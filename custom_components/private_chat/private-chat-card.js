console.info("PRIVATE CHAT FINAL STABLE MOBILE");

class HaChatCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        this.messages = [];
        this._ready = false;
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

    // =========================
    // HISTORY
    // =========================
    loadHistory() {
        this._hass.callService('private_chat', 'get_history', {});
    }

    // =========================
    // EVENTS
    // =========================
    subscribe() {
        this._hass.connection.subscribeEvents((event) => {
            const msg = event.data?.message;
            if (!msg) return;

            this.messages.push(msg);
            this.appendMessage(msg);

        }, 'private_chat_new_message');

        this._hass.connection.subscribeEvents((event) => {
            const msgs = event.data?.messages;
            if (!msgs) return;

            this.messages = msgs;
            this.renderFull();
        }, 'private_chat_history');
    }

    // =========================
    // SEND
    // =========================
    sendMessage(file = null) {
        const input = this.shadowRoot.querySelector('#msg-input');
        const text = input.value.trim();

        if (!text && !file) return;

        if (file) {
            const form = new FormData();
            form.append("file", file);

            fetch("/api/private_chat/upload", {
                method: "POST",
                body: form,
                headers: {
                    Authorization: `Bearer ${this._hass.auth.data.access_token}`
                }
            })
            .then(r => r.json())
            .then(payload => {
                this._hass.callService('private_chat', 'send_message', {
                    message: text,
                    ...payload
                });
            });

        } else {
            this._hass.callService('private_chat', 'send_message', {
                message: text
            });
        }

        input.value = '';
    }

    // =========================
    // RENDER FULL
    // =========================
    renderFull() {
        const box = this.shadowRoot.querySelector('#chat-box');
        box.innerHTML = '';

        this.messages.forEach(m => this.appendMessage(m, false));
        this.scrollToBottom(true);
    }

    // =========================
    // APPEND MESSAGE
    // =========================
    appendMessage(msg, scroll = true) {
        const box = this.shadowRoot.querySelector('#chat-box');

        const isMe = msg.user_id === this.currentUserId;

        const div = document.createElement('div');
        div.className = `msg ${isMe ? 'me' : 'other'}`;

        const bubble = document.createElement('div');
        bubble.className = 'bubble';

        const meta = document.createElement('div');
        meta.className = 'meta';

        const time = new Date(msg.timestamp * 1000)
            .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        meta.textContent = `${msg.user} ${time}`;
        bubble.appendChild(meta);

        if (msg.message) {
            const t = document.createElement('div');
            t.textContent = msg.message;
            bubble.appendChild(t);
        }

        if (msg.file_url) {
            if (msg.file_type === 'image') {
                const img = document.createElement('img');
                img.src = msg.file_url;
                img.className = 'media';
                bubble.appendChild(img);
            }

            if (msg.file_type === 'video') {
                const v = document.createElement('video');
                v.src = msg.file_url;
                v.controls = true;
                v.className = 'media';
                bubble.appendChild(v);
            }

            if (msg.file_type === 'file') {
                const a = document.createElement('a');
                a.href = msg.file_url;
                a.target = "_blank";
                a.textContent = msg.file_name;
                bubble.appendChild(a);
            }
        }

        div.appendChild(bubble);
        box.appendChild(div);

        if (scroll && this._autoScroll) {
            this.scrollToBottom();
        }
    }

    // =========================
    // SCROLL
    // =========================
    scrollToBottom(force = false) {
        const box = this.shadowRoot.querySelector('#chat-box');

        if (!force && !this._autoScroll) return;

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                box.scrollTop = box.scrollHeight;
            });
        });
    }

    // =========================
    // UI
    // =========================
    render() {
        this.shadowRoot.innerHTML = `
        <style>

        :host {
            position: fixed;
            inset: 0;
            overflow: hidden;
            overscroll-behavior: none;
            touch-action: none;
        }

        #container {
            height: 100dvh;
            display: flex;
            flex-direction: column;
            background: var(--lovelace-background);
        }

        #chat-box {
            flex: 1;
            overflow-y: auto;
            padding: 10px;
            display: flex;
            flex-direction: column;
            gap: 8px;

            overscroll-behavior: contain;
            -webkit-overflow-scrolling: touch;
            touch-action: pan-y;
        }

        .msg { max-width: 75%; }
        .me { align-self: flex-end; }
        .other { align-self: flex-start; }

        .bubble {
            padding: 10px;
            border-radius: 12px;
            background: #e5e5e5;
        }

        .me .bubble {
            background: #03a9f4;
            color: white;
        }

        .media {
            max-width: 220px;
            max-height: 160px;
            border-radius: 10px;
            display: block;
        }

        #input-area {
            display: flex;
            padding: 10px;
            gap: 8px;
            border-top: 1px solid #ccc;
            background: var(--card-background-color);

            touch-action: manipulation;
        }

        #msg-input {
            flex: 1;
            padding: 10px;
            border-radius: 20px;
            border: 1px solid #ccc;
        }

        #send-btn {
            background: #03a9f4;
            color: white;
            border: none;
            border-radius: 20px;
            padding: 10px 16px;
        }

        #attach-btn {
            background: none;
            border: none;
            font-size: 22px;
        }

        </style>

        <div id="container">
            <div id="chat-box"></div>

            <div id="input-area">
                <button id="attach-btn">📎</button>
                <input id="msg-input" placeholder="Message..." />
                <button id="send-btn">Send</button>
                <input type="file" id="file-input" style="display:none;">
            </div>
        </div>
        `;

        const fileInput = this.shadowRoot.querySelector('#file-input');
        const input = this.shadowRoot.querySelector('#msg-input');
        const box = this.shadowRoot.querySelector('#chat-box');

        // attach
        this.shadowRoot.querySelector('#attach-btn')
            .onclick = () => fileInput.click();

        fileInput.onchange = () => {
            const f = fileInput.files[0];
            if (f) {
                this.sendMessage(f);
                fileInput.value = '';
            }
        };

        // send
        this.shadowRoot.querySelector('#send-btn')
            .onclick = () => this.sendMessage();

        // ENTER FIX
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // scroll tracking
        box.addEventListener('scroll', () => {
            const nearBottom =
                box.scrollHeight - box.scrollTop - box.clientHeight < 80;

            this._autoScroll = nearBottom;
        });

        this.shadowRoot.addEventListener('touchmove', (e) => {
            if (!box.contains(e.target)) {
                e.preventDefault();
            }
        }, { passive: false });
    }

    setConfig() {}
    getCardSize() { return 6; }
}

customElements.define('private-chat-card', HaChatCard);