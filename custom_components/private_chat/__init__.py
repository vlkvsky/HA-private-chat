import os
import time
import asyncio
import logging

from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers.storage import Store
from homeassistant.components.http import HomeAssistantView

from .const import *

_LOGGER = logging.getLogger(__name__)
LOCK = asyncio.Lock()


# =========================
# UPLOAD VIEW (STREAM)
# =========================
class PrivateChatUploadView(HomeAssistantView):
    url = "/api/private_chat/upload"
    name = "api:private_chat:upload"
    requires_auth = True

    async def post(self, request):
        hass = request.app["hass"]

        reader = await request.multipart()
        field = await reader.next()

        if not field:
            return self.json({"error": "no file"})

        filename = field.filename or "file.bin"

        upload_dir = hass.config.path("www/private_chat")
        os.makedirs(upload_dir, exist_ok=True)

        safe_name = f"{int(time.time())}_{filename}"
        file_path = os.path.join(upload_dir, safe_name)

        try:
            with open(file_path, "wb") as f:
                while True:
                    chunk = await field.read_chunk(1024 * 256)
                    if not chunk:
                        break
                    f.write(chunk)

        except Exception as e:
            _LOGGER.error(f"[private_chat] upload error: {e}")
            return self.json({"error": "write_failed"})

        ext = filename.lower().split(".")[-1]

        if ext in ["jpg", "jpeg", "png", "gif", "webp"]:
            ftype = "image"
        elif ext in ["mp4", "webm", "mov"]:
            ftype = "video"
        else:
            ftype = "file"

        return self.json({
            "file_url": f"/local/private_chat/{safe_name}",
            "file_type": ftype,
            "file_name": filename
        })


# =========================
# SETUP
# =========================
async def async_setup_entry(hass: HomeAssistant, entry):

    store = Store(hass, STORAGE_VERSION, STORAGE_KEY)

    data = await store.async_load()
    messages = data.get("messages", []) if isinstance(data, dict) else []

    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN]["messages"] = messages

    _LOGGER.info(f"[private_chat] loaded {len(messages)} messages")

    # register upload endpoint
    hass.http.register_view(PrivateChatUploadView())

    # =========================
    # SAVE STORAGE
    # =========================
    async def save():
        await store.async_save({
            "messages": hass.data[DOMAIN]["messages"]
        })

    # =========================
    # SEND MESSAGE
    # =========================
    async def send_message(call: ServiceCall):

        user_name = "User"
        user_id = None

        if call.context and call.context.user_id:
            user = await hass.auth.async_get_user(call.context.user_id)
            if user:
                user_name = user.name
                user_id = user.id

        msg = {
            "timestamp": time.time(),
            "user": user_name,
            "user_id": user_id,
            "message": call.data.get("message"),
            "file_url": call.data.get("file_url"),
            "file_type": call.data.get("file_type"),
            "file_name": call.data.get("file_name"),
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
    # HISTORY
    # =========================
    async def get_history(call: ServiceCall):
        hass.bus.async_fire(
            EVENT_HISTORY,
            {"messages": hass.data[DOMAIN]["messages"]},
            context=call.context
        )

    # =========================
    # CLEAR CHAT (MESSAGES)
    # =========================
    async def clear_chat(call: ServiceCall):
        async with LOCK:
            hass.data[DOMAIN]["messages"] = []
            await save()

        hass.bus.async_fire(
            EVENT_HISTORY,
            {"messages": []},
            context=call.context
        )

    # =========================
    # NEW: CLEAR FILES FOLDER
    # =========================
    async def clear_upload_folder(call: ServiceCall):
        upload_dir = hass.config.path("www/private_chat")

        deleted = 0

        if os.path.exists(upload_dir):
            for file in os.listdir(upload_dir):
                file_path = os.path.join(upload_dir, file)

                try:
                    if os.path.isfile(file_path):
                        os.remove(file_path)
                        deleted += 1
                except Exception as e:
                    _LOGGER.error(f"[private_chat] delete error {file}: {e}")

        _LOGGER.info(f"[private_chat] cleaned upload folder: {deleted} files")

        hass.bus.async_fire(
            "private_chat_uploads_cleared",
            {"deleted": deleted},
            context=call.context
        )

    # =========================
    # SERVICES
    # =========================
    hass.services.async_register(DOMAIN, SERVICE_SEND, send_message)
    hass.services.async_register(DOMAIN, SERVICE_GET_HISTORY, get_history)
    hass.services.async_register(DOMAIN, SERVICE_CLEAR_CHAT, clear_chat)

    hass.services.async_register(
        DOMAIN,
        "clear_uploads",
        clear_upload_folder
    )

    return True


async def async_unload_entry(hass: HomeAssistant, entry):
    hass.data.pop(DOMAIN, None)
    return True