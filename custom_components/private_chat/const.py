DOMAIN = "private_chat"

EVENT_NEW_MESSAGE = f"{DOMAIN}_new_message"
EVENT_HISTORY = f"{DOMAIN}_history"

SERVICE_SEND = "send_message"
SERVICE_GET_HISTORY = "get_history"
SERVICE_CLEAR_CHAT = "clear_chat"

MAX_HISTORY = 20000

STORAGE_KEY = "private_chat_history"
STORAGE_VERSION = 1

# presence: користувач вважається «в чаті», якщо картка надсилала відмітку не пізніше N секунд тому
PRESENCE_TIMEOUT = 35
WS_PRESENCE = f"{DOMAIN}/presence"
