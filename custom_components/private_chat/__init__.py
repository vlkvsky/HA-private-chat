import logging
import time
import asyncio

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

    _LOGGER.info(f"[private_chat] Loaded {len(messages)} messages")

    async def save():
        await store.async_save({
            "messages": hass.data[DOMAIN]["messages"]
        })

    def push_state(msg):
        # 🔥 GLOBAL STATE (VISIBLE TO ALL USERS INCLUDING GUEST)
        hass.states.async_set(
            "private_chat.last_message",
            msg["message"],
            {
                "user": msg["user"],
                "timestamp": msg["timestamp"]
            }
        )

        hass.states.async_set(
            "private_chat.last_user",
            msg["user"]
        )

        hass.states.async_set(
            "private_chat.history_size",
            len(hass.data[DOMAIN]["messages"])
        )

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

        push_state(msg)

    async def get_history(call: ServiceCall):
        hass.states.async_set(
            "private_chat.history",
            "loaded",
            {
                "messages": hass.data[DOMAIN]["messages"]
            }
        )

    async def clear_chat(call: ServiceCall):
        async with LOCK:
            hass.data[DOMAIN]["messages"] = []
            await save()

        hass.states.async_set(
            "private_chat.history",
            "cleared",
            {"messages": []}
        )

        hass.states.async_set("private_chat.last_message", "")
        hass.states.async_set("private_chat.history_size", 0)

    hass.services.async_register(DOMAIN, SERVICE_SEND, send_message)
    hass.services.async_register(DOMAIN, SERVICE_GET_HISTORY, get_history)
    hass.services.async_register(DOMAIN, SERVICE_CLEAR_CHAT, clear_chat)

    return True


async def async_unload_entry(hass: HomeAssistant, entry):
    hass.data.pop(DOMAIN, None)
    return True