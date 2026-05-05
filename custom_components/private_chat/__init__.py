import os
import time
import asyncio
import logging
import re

from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers.storage import Store
from homeassistant.components.http import HomeAssistantView

from .const import *

_LOGGER = logging.getLogger(__name__)
LOCK = asyncio.Lock()


# =========================
# SAFE FILENAME
# =========================
def safe_filename(name: str) -> str:
    name = re.sub(r"[^a-zA-Z0-9._-]", "_", name)
    return name[:120]


# =========================
# STREAM UPLOAD (NO LIMIT)
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

        filename = safe_filename(field.filename or "file.bin")

        upload_dir = hass.config.path("www/private_chat")
        os.makedirs(upload_dir, exist_ok=True)

        safe_name = f"{int(time.time())}_{filename}"
        file_path = os.path.join(upload_dir, safe_name)

        # STREAM WRITE (NO RAM LIMIT)
        with open(file_path, "wb") as f:
            while True:
                chunk = await field.read_chunk(1024 * 512)
                if not chunk:
                    break
                f.write(chunk)

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

    hass.http.register_view(PrivateChatUploadView())

    async def save():
        await store.async_save({"messages": hass.data[DOMAIN]["messages"]})

    # =========================
    # SEND MESSAGE (CLEAN ONLY)
    # =========================
    async def send_message(call: ServiceCall):

        user_name = "User"
        user_id = None

        if call.context and call.context.user_id:
            user = await hass.auth.async_get_user(call.context.user_id)
            if user:
                user_name = user.name
                user_id = user.id

        # 🔥 ЖЁСТКАЯ САНИТИЗАЦИЯ (ВАЖНО)
        msg = {
            "timestamp": time.time(),
            "user": user_name,
            "user_id": user_id,
            "message": call.data.get("message"),

            # ONLY URL MODE (NO FILE, NO BASE64 EVER)
            "file_url": call.data.get("file_url"),
            "file_type": call.data.get("file_type"),
            "file_name": call.data.get("file_name"),
        }

        msg = {k: v for k, v in msg.items() if v is not None}

        async with LOCK:
            hass.data[DOMAIN]["messages"].append(msg)

            if len(hass.data[DOMAIN]["messages"]) > MAX_HISTORY:
                hass.data[DOMAIN]["messages"].pop(0)

            await save()

        hass.bus.async_fire(
            EVENT_NEW_MESSAGE,
            {
                "message": {
                    "timestamp": msg["timestamp"],
                    "user": msg["user"],
                    "user_id": msg["user_id"],
                    "message": msg.get("message"),
                    "file_url": msg.get("file_url"),
                    "file_type": msg.get("file_type"),
                    "file_name": msg.get("file_name"),
                }
            },
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
    # CLEAR
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
    # REGISTER SERVICES
    # =========================
    hass.services.async_register(DOMAIN, SERVICE_SEND, send_message)
    hass.services.async_register(DOMAIN, SERVICE_GET_HISTORY, get_history)
    hass.services.async_register(DOMAIN, SERVICE_CLEAR_CHAT, clear_chat)

    return True


async def async_unload_entry(hass: HomeAssistant, entry):
    hass.data.pop(DOMAIN, None)
    return True