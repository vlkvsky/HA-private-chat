import logging
import time

from homeassistant.core import HomeAssistant, ServiceCall, Context
from homeassistant.helpers.storage import Store
from homeassistant.config_entries import ConfigEntry

from .const import *

DOMAIN = "private_chat"
_LOGGER = logging.getLogger(__name__)


async def async_setup(hass: HomeAssistant, config):
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry):

    store = Store(hass, STORAGE_VERSION, STORAGE_KEY)

    data = await store.async_load()
    messages = data.get("messages", []) if isinstance(data, dict) else []

    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN]["messages"] = messages
    hass.data[DOMAIN]["notify_service"] = entry.data.get(CONF_NOTIFY_SERVICE)

    _LOGGER.warning(f"[private_chat] Loaded {len(messages)} messages")

    async def save():
        await store.async_save({"messages": hass.data[DOMAIN]["messages"]})

    # 🔥 PUSH helper
    def send_push(message: dict):
        notify_service = hass.data[DOMAIN].get("notify_service")

        if not notify_service:
            return

        hass.services.call(
            "notify",
            notify_service.replace("notify.", ""),
            {
                "title": "Private Chat",
                "message": f"{message['user']}: {message['message']}"
            }
        )

    # 🔥 SEND MESSAGE
    async def send_message(call: ServiceCall):
        text = call.data.get("message")
        if not text:
            return

        user_name = "System"
        user_id = None

        if call.context.user_id:
            user = await hass.auth.async_get_user(call.context.user_id)
            if user:
                user_name = user.name
                user_id = user.id

        msg = {
            "timestamp": time.time(),
            "user": user_name,
            "user_id": user_id,
            "message": text,
        }

        hass.data[DOMAIN]["messages"].append(msg)

        if len(hass.data[DOMAIN]["messages"]) > MAX_HISTORY:
            hass.data[DOMAIN]["messages"].pop(0)

        await save()

        # 🔥 realtime event
        hass.bus.async_fire(
            EVENT_NEW_MESSAGE,
            {"message": msg},
            context=Context(user_id=None)
        )

        # 🔥 PUSH NOTIFICATION
        send_push(msg)

    # 🔥 HISTORY
    async def get_history(call: ServiceCall):
        hass.bus.async_fire(
            EVENT_HISTORY,
            {"messages": hass.data[DOMAIN]["messages"]},
            context=Context(user_id=None)
        )

    hass.services.async_register(DOMAIN, SERVICE_SEND, send_message)
    hass.services.async_register(DOMAIN, SERVICE_GET_HISTORY, get_history)

    return True