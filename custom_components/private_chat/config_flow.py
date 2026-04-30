import voluptuous as vol
from homeassistant import config_entries
from homeassistant.helpers.selector import SelectSelector, SelectSelectorConfig, SelectOptionDict

from .const import DOMAIN, CONF_NOTIFY_SERVICE


class PrivateChatConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):

    async def async_step_user(self, user_input=None):

        notify_services = []

        for service in self.hass.services.async_services().get("notify", {}):
            if service.startswith("mobile_app_"):
                notify_services.append(service)

        if not notify_services:
            notify_services = ["notify.notify"]

        schema = vol.Schema({
            vol.Required(CONF_NOTIFY_SERVICE): vol.In(notify_services)
        })

        if user_input is not None:
            return self.async_create_entry(
                title="Private Chat",
                data=user_input
            )

        return self.async_show_form(
            step_id="user",
            data_schema=schema
        )