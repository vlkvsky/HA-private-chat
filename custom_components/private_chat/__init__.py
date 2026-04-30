import logging
import time
import asyncio

from homeassistant.core import HomeAssistant, ServiceCall, Context
from homeassistant.helpers.storage import Store

from .const import *

_LOGGER = logging.getLogger(__name__)

LOCK = asyncio.Lock()


async def async_setup(hass: HomeAssistant, config):
    """Legacy support (YAML disabled style integration)."""
    return True


async def async_setup_entry(hass: HomeAssistant, entry):
    """UI config flow entry setup."""

    store = Store(hass, STORAGE_VERSION, STORAGE_KEY)

    data = await store.async_load()
    messages = data.get("messages", []) if isinstance(data, dict) else []

    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN]["messages"] = messages

    _LOGGER.info(f"[private_chat] Loaded {len(messages)} messages")

    async def save():
        await store.async_save({"messages": hass.data[DOMAIN]["messages"]})

    # 🔥 SEND MESSAGE
    async def send_message(call: ServiceCall):
        text = call.data.get("message")
        if not text:
            return

        user_name = "System"
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
            "message": text,
        }

        async with LOCK:
            hass.data[DOMAIN]["messages"].append(msg)

            if len(hass.data[DOMAIN]["messages"]) > MAX_HISTORY:
                hass.data[DOMAIN]["messages"].pop(0)

            await save()

        hass.bus.async_fire(
            EVENT_NEW_MESSAGE,
            {"message": msg}
        )

    # 🔥 HISTORY
    async def get_history(call: ServiceCall):
        hass.bus.async_fire(
            EVENT_HISTORY,
            {"messages": hass.data[DOMAIN]["messages"]}
        )

    hass.services.async_register(DOMAIN, SERVICE_SEND, send_message)
    hass.services.async_register(DOMAIN, SERVICE_GET_HISTORY, get_history)

    return True


async def async_unload_entry(hass: HomeAssistant, entry):
    """Unload integration."""
    hass.data.pop(DOMAIN, None)
    return True