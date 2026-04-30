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
            this.loadHistory();
            this.startPolling();
        }

        this.currentUserId = hass.user?.id;
    }

    // =====================
    // LOAD HISTORY
    // =====================
    async loadHistory() {
        const res = await this._hass.callService(
            'private_chat',
            'get_history',
            {}
        );

        if (res?.messages) {
            this.messages = res.messages;
            this.refreshChat(true);
        }
    }

    // =====================
    // POLLING (FIX FOR GUESTS)
    // =====================
    startPolling() {
        setInterval(() => {
            this.loadHistory();
        }, 3000); // каждые 3 сек
    }

    // =====================
    // SEND
    // =====================
    sendMessage() {
        const input = this.shadowRoot.querySelector('#msg-input');
        const text = input.value.trim();
        if (!text) return;

        this._hass.callService('private_chat', 'send_message', {
            message: text
        });

        input.value = '';
    }

    // =====================
    // RENDER
    // =====================
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

            div.innerHTML = `
                <div class="bubble">
                    <div class="meta">
                        <strong>${msg.user}</strong>
                        <span>${time}</span>
                    </div>
                    <div class="text">${msg.message}</div>
                </div>
            `;

            box.appendChild(div);
        });

        this.scrollToBottom(forceScroll);
    }

    scrollToBottom(force = false) {
        const box = this.shadowRoot.querySelector('#chat-box');
        if (!box) return;

        requestAnimationFrame(() => {
            box.scrollTop = box.scrollHeight;
        });
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

        .msg { max-width:75%; }
        .me { align-self:flex-end; }
        .other { align-self:flex-start; }

        .bubble {
            padding:10px;
            border-radius:12px;
            background:#e5e5e5;
        }

        .me .bubble {
            background:#03a9f4;
            color:white;
        }

        #input-area {
            display:flex;
            gap:8px;
            border-top:1px solid #ccc;
            padding-top:10px;
        }

        input {
            flex:1;
            padding:10px;
        }

        button {
            background:#03a9f4;
            color:white;
            border:none;
            padding:0 16px;
            border-radius:8px;
        }
        </style>

        <div id="chat-container">
            <div id="chat-box"></div>
            <div id="input-area">
                <input id="msg-input" placeholder="Message..." />
                <button>Send</button>
            </div>
        </div>
        `;

        this.shadowRoot.querySelector('button')
            .addEventListener('click', () => this.sendMessage());

        this.shadowRoot.querySelector('input')
            .addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.sendMessage();
            });
    }
}

customElements.define('private-chat-card', HaChatCard);