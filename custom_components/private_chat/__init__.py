import logging
import time
import asyncio
import os
import base64

from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers.storage import Store

from .const import *

_LOGGER = logging.getLogger(__name__)
LOCK = asyncio.Lock()


async def async_setup(hass: HomeAssistant, config):
    return True


async def async_setup_entry(hass: HomeAssistant, entry):

    store = Store(hass, STORAGE_VERSION, STORAGE_KEY)

    data = await store.async_load()
    messages = data.get("messages", []) if isinstance(data, dict) else []

    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN]["messages"] = messages

    www_path = hass.config.path("www/private_chat")
    os.makedirs(www_path, exist_ok=True)

    async def save():
        await store.async_save({
            "messages": hass.data[DOMAIN]["messages"]
        })

    # =========================
    # SEND MESSAGE
    # =========================
    async def send_message(call: ServiceCall):
        text = call.data.get("message")
        file_data = call.data.get("file")
        file_name = call.data.get("file_name")

        user_name = "System"
        user_id = None

        if call.context and call.context.user_id:
            user = await hass.auth.async_get_user(call.context.user_id)
            if user:
                user_name = user.name
                user_id = user.id

        file_url = None
        file_type = None

        # 📦 FILE SAVE
        if file_data and file_name:
            try:
                content = base64.b64decode(file_data)
                filename = f"{int(time.time())}_{file_name}"
                file_path = os.path.join(www_path, filename)

                with open(file_path, "wb") as f:
                    f.write(content)

                file_url = f"/local/private_chat/{filename}"

                if file_name.lower().endswith((".png", ".jpg", ".jpeg", ".gif", ".webp")):
                    file_type = "image"
                elif file_name.lower().endswith((".mp4", ".webm", ".mov")):
                    file_type = "video"
                else:
                    file_type = "file"

            except Exception as e:
                _LOGGER.error(f"[private_chat] File save error: {e}")

        msg = {
            "timestamp": time.time(),
            "user": user_name,
            "user_id": user_id,
            "message": text,
            "file_url": file_url,
            "file_type": file_type,
            "file_name": file_name
        }

        async with LOCK:
            hass.data[DOMAIN]["messages"].append(msg)

            if len(hass.data[DOMAIN]["messages"]) > MAX_HISTORY:
                hass.data[DOMAIN]["messages"].pop(0)

            await save()

        hass.bus.async_fire(
            EVENT_NEW_MESSAGE,
            {"message": msg},
            context=call.context
        )

    # =========================
    async def get_history(call: ServiceCall):
        hass.bus.async_fire(
            EVENT_HISTORY,
            {"messages": hass.data[DOMAIN]["messages"]},
            context=call.context
        )

    async def clear_chat(call: ServiceCall):
        async with LOCK:
            hass.data[DOMAIN]["messages"] = []
            await save()

        hass.bus.async_fire(
            EVENT_HISTORY,
            {"messages": []},
            context=call.context
        )

    hass.services.async_register(DOMAIN, SERVICE_SEND, send_message)
    hass.services.async_register(DOMAIN, SERVICE_GET_HISTORY, get_history)
    hass.services.async_register(DOMAIN, SERVICE_CLEAR_CHAT, clear_chat)

    return True


async def async_unload_entry(hass: HomeAssistant, entry):
    hass.data.pop(DOMAIN, None)
    return True