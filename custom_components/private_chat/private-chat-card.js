console.info("PRIVATE CHAT CARD LOADED");

class HaChatCard extends HTMLElement {
    constructor() {
        super();
        this.messages = [];
        this.attachShadow({ mode: 'open' });
        this._autoScroll = true;
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

    loadHistory() {
        this._hass.callService('private_chat', 'get_history', {});
    }

    subscribe() {
        this._hass.connection.subscribeEvents((event) => {
            if (!event.data?.message) return;

            const msg = event.data.message;

            if (this.messages.some(m => m.timestamp === msg.timestamp)) return;

            this.messages.push(msg);
            this.refreshChat(true);

        }, 'private_chat_new_message');

        this._hass.connection.subscribeEvents((event) => {
            if (!event.data?.messages) return;

            this.messages = event.data.messages;
            this.refreshChat(true);

        }, 'private_chat_history');
    }

    sendMessage() {
        const input = this.shadowRoot.querySelector('#msg-input');
        const text = input.value.trim();
        if (!text) return;

        this._hass.callService('private_chat', 'send_message', {
            message: text
        });

        input.value = '';
    }

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

    refreshChat(forceScroll = false) {
        const box = this.shadowRoot.querySelector('#chat-box');
        if (!box) return;

        box.innerHTML = '';

        this.messages.forEach(msg => {
            const isMe = msg.user_id === this.currentUserId;

            const div = document.createElement('div');
            div.className = `msg ${isMe ? 'me' : 'other'}`;

            const time = new Date(msg.timestamp * 1000)
                .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const bubble = document.createElement('div');
            bubble.className = 'bubble';

            const meta = document.createElement('div');
            meta.className = 'meta';
            meta.textContent = `${msg.user} ${time}`;

            const text = document.createElement('div');
            text.className = 'text';
            text.textContent = msg.message; // ✅ XSS FIX

            bubble.appendChild(meta);
            bubble.appendChild(text);
            div.appendChild(bubble);

            box.appendChild(div);
        });

        this.scrollToBottom(forceScroll);
    }

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
        }

        .msg { max-width:75%; display:flex; flex-direction:column; }
        .me { align-self:flex-end; }
        .other { align-self:flex-start; }

        .bubble {
            padding:10px;
            border-radius:12px;
            background:var(--secondary-background-color,#e5e5e5);
        }

        .me .bubble {
            background:var(--primary-color,#03a9f4);
            color:white;
        }

        .meta {
            font-size:11px;
            opacity:0.7;
            margin-bottom:3px;
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

customElements.define('private-chat-card', HaChatCard);