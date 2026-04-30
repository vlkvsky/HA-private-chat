console.info("PRIVATE CHAT CARD LOADED");

class PrivateChatCard extends HTMLElement {
    constructor() {
        super();
        this.messages = [];
        this.attachShadow({ mode: 'open' });

        this._autoScroll = true;
        this._ready = false;
    }

    set hass(hass) {
        this._hass = hass;

        if (!this._ready) {
            this._ready = true;
            this.render();
            this.subscribe();
            this.loadHistory();
        }

        this.currentUserId = hass.user?.id;
    }

    // =========================
    // LOAD HISTORY
    // =========================
    loadHistory() {
        this._hass.callService('private_chat', 'get_history', {});
    }

    // =========================
    // SUBSCRIPTIONS (FIXED)
    // =========================
    subscribe() {

        // 🔥 REALTIME via STATE (WORKS FOR GUEST)
        this._hass.connection.subscribeMessage((msg) => {
            if (!msg?.event?.data) return;

            const event = msg.event;
            const entity_id = event.data?.entity_id;

            // only our entity
            if (entity_id !== "private_chat.last_message") return;

            const state = event.data.new_state;
            if (!state) return;

            const message = state.state;
            const user = state.attributes?.user || "System";
            const timestamp = state.attributes?.timestamp || Date.now() / 1000;

            // anti-duplicate
            if (this.messages.some(m => m.timestamp === timestamp)) return;

            this.messages.push({
                message,
                user,
                user_id: null,
                timestamp
            });

            this.refreshChat(true);

        }, {
            type: "event",
            event_type: "state_changed"
        });

        // 🔥 HISTORY EVENT (optional fallback)
        this._hass.connection.subscribeEvents((event) => {
            if (!event.data?.messages) return;

            this.messages = event.data.messages;
            this.refreshChat(true);

        }, 'private_chat_history');
    }

    // =========================
    // SEND MESSAGE
    // =========================
    sendMessage() {
        const input = this.shadowRoot.querySelector('#msg-input');
        const text = input.value.trim();
        if (!text) return;

        this._hass.callService('private_chat', 'send_message', {
            message: text
        });

        input.value = '';
    }

    // =========================
    // SCROLL LOGIC
    // =========================
    scrollToBottom(force = false) {
        const box = this.shadowRoot.querySelector('#chat-box');
        if (!box) return;

        const isNearBottom =
            box.scrollHeight - box.scrollTop - box.clientHeight < 80;

        if (force || this._autoScroll || isNearBottom) {
            requestAnimationFrame(() => {
                box.scrollTop = box.scrollHeight;
            });
        }
    }

    // =========================
    // RENDER CHAT
    // =========================
    refreshChat(forceScroll = false) {
        const box = this.shadowRoot.querySelector('#chat-box');
        if (!box) return;

        box.innerHTML = '';

        this.messages.forEach(msg => {
            const isMe = msg.user_id === this.currentUserId;

            const div = document.createElement('div');
            div.className = `msg ${isMe ? 'me' : 'other'}`;

            const time = new Date(msg.timestamp * 1000)
                .toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit'
                });

            const bubble = document.createElement('div');
            bubble.className = 'bubble';

            const meta = document.createElement('div');
            meta.className = 'meta';
            meta.innerHTML = `<strong>${msg.user}</strong> <span>${time}</span>`;

            const text = document.createElement('div');
            text.className = 'text';
            text.textContent = msg.message;

            bubble.appendChild(meta);
            bubble.appendChild(text);
            div.appendChild(bubble);
            box.appendChild(div);
        });

        this.scrollToBottom(forceScroll);
    }

    // =========================
    // UI
    // =========================
    render() {
        this.shadowRoot.innerHTML = `
        <style>
        :host { display:block; }

        #chat-container {
            display:flex;
            flex-direction:column;
            height:740px;
            padding:10px;
            box-sizing:border-box;
        }

        #chat-box {
            flex:1;
            overflow-y:auto;
            display:flex;
            flex-direction:column;
            gap:8px;
            padding-bottom:10px;
        }

        .msg {
            max-width:75%;
            display:flex;
            flex-direction:column;
        }

        .me { align-self:flex-end; }
        .other { align-self:flex-start; }

        .bubble {
            padding:10px 12px;
            border-radius:14px;
            background:var(--secondary-background-color,#e5e5e5);
        }

        .me .bubble {
            background:var(--primary-color,#03a9f4);
            color:white;
        }

        .meta {
            font-size:11px;
            opacity:0.7;
            display:flex;
            justify-content:space-between;
            margin-bottom:3px;
        }

        .text {
            word-break:break-word;
        }

        #input-area {
            display:flex;
            gap:8px;
            border-top:1px solid var(--divider-color,#ccc);
            padding-top:10px;
        }

        input {
            flex:1;
            padding:10px;
            border-radius:8px;
        }

        button {
            background:var(--primary-color,#03a9f4);
            color:white;
            border:none;
            border-radius:8px;
            padding:0 16px;
        }
        </style>

        <div id="chat-container">
            <div id="chat-box"></div>

            <div id="input-area">
                <input id="msg-input" placeholder="Message..." />
                <button id="send-btn">Send</button>
            </div>
        </div>
        `;

        this.shadowRoot.querySelector('#send-btn')
            .addEventListener('click', () => this.sendMessage());

        this.shadowRoot.querySelector('#msg-input')
            .addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.sendMessage();
            });

        const box = this.shadowRoot.querySelector('#chat-box');

        box.addEventListener('scroll', () => {
            const isBottom =
                box.scrollHeight - box.scrollTop - box.clientHeight < 80;

            this._autoScroll = isBottom;
        });
    }

    setConfig() {}
    getCardSize() { return 6; }
}

customElements.define('private-chat-card', PrivateChatCard);