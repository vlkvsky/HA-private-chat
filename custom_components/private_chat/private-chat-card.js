console.info("PRIVATE CHAT TELEGRAM STYLE UI");

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

    loadHistory() {
        this._hass.callService('private_chat', 'get_history', {});
    }

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

    renderFull() {
        const box = this.shadowRoot.querySelector('#chat-box');
        box.innerHTML = '';

        this.messages.forEach(m => this.appendMessage(m, false));
        this.scrollToBottom(true);
    }

    appendMessage(msg, scroll = true) {
        const box = this.shadowRoot.querySelector('#chat-box');

        const isMe = msg.user_id === this.currentUserId;

        const row = document.createElement('div');
        row.className = `row ${isMe ? 'me' : 'other'}`;

        const bubble = document.createElement('div');
        bubble.className = `bubble ${isMe ? 'me-bubble' : 'other-bubble'}`;

        // текст
        if (msg.message) {
            const text = document.createElement('div');
            text.className = 'text';
            text.textContent = msg.message;
            bubble.appendChild(text);
        }

        // media
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
                a.className = 'file';
                a.textContent = msg.file_name;
                bubble.appendChild(a);
            }
        }

        // meta
        const meta = document.createElement('div');
        meta.className = 'meta';

        const time = new Date(msg.timestamp * 1000)
            .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        meta.textContent = msg.user + " · " + time;

        bubble.appendChild(meta);

        row.appendChild(bubble);
        box.appendChild(row);

        if (scroll && this._autoScroll) {
            this.scrollToBottom();
        }
    }

    scrollToBottom(force = false) {
        const box = this.shadowRoot.querySelector('#chat-box');

        if (!force && !this._autoScroll) return;

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                box.scrollTop = box.scrollHeight;
            });
        });
    }

    render() {
        this.shadowRoot.innerHTML = `
        <style>

        :host {
            position: fixed;
            inset: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial;
        }

        #container {
            height: 100vh;
            display: flex;
            flex-direction: column;
            background: var(--lovelace-background);
        }

        #chat-box {
            flex: 1;
            overflow-y: auto;
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        /* ROW */
        .row {
            display: flex;
            width: 100%;
        }

        .me {
            justify-content: flex-end;
        }

        .other {
            justify-content: flex-start;
        }

        /* BUBBLE */
        .bubble {
            max-width: 75%;
            padding: 8px 12px;
            border-radius: 16px;
            font-size: 14px;
            line-height: 1.35;
            word-break: break-word;
        }

        .me-bubble {
            background: #03a9f4;
            color: white;
            border-bottom-right-radius: 4px;
        }

        .other-bubble {
            background: #1e1e1e;
            color: #eaeaea;
            border-bottom-left-radius: 4px;
        }

        .text {
            font-size: 14px;
            margin-bottom: 4px;
        }

        .meta {
            font-size: 11px;
            opacity: 0.6;
            margin-top: 4px;
        }

        .media {
            width: 220px;
            height: 160px;
            border-radius: 12px;
            margin-top: 6px;
            display: block;
            object-fit: cover; 
            background: #000;
        }
        
        video.media {
            width: 220px;
            height: 160px;
            border-radius: 12px;
            object-fit: cover;
            background: #000;
        }
        
        img.media {
            width: 220px;
            height: 160px;
            border-radius: 1px;
            object-fit: cover;
            background: #000;
        }

        .file {
            display: block;
            margin-top: 6px;
            color: #4ea4ff;
            font-size: 13px;
        }

        /* INPUT */
        #input-area {
            display: flex;
            gap: 8px;
            padding: 10px;
            background: #151515;
            border-top: 1px solid #222;
        }

        #msg-input {
            flex: 1;
            border-radius: 18px;
            border: none;
            padding: 10px 12px;
            background: #222;
            color: white;
            outline: none;
            font-size: 14px;
        }

        #send-btn {
            background: #03a9f4;
            color: white;
            border: none;
            border-radius: 18px;
            padding: 8px 14px;
        }

        #attach-btn {
            background: none;
            border: none;
            font-size: 20px;
            color: white;
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

        this.shadowRoot.querySelector('#attach-btn')
            .onclick = () => fileInput.click();

        fileInput.onchange = () => {
            const f = fileInput.files[0];
            if (f) {
                this.sendMessage(f);
                fileInput.value = '';
            }
        };

        this.shadowRoot.querySelector('#send-btn')
            .onclick = () => this.sendMessage();

        this.shadowRoot.querySelector('#msg-input')
            .addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.sendMessage();
                }
            });

        const box = this.shadowRoot.querySelector('#chat-box');

        box.addEventListener('scroll', () => {
            const nearBottom =
                box.scrollHeight - box.scrollTop - box.clientHeight < 80;

            this._autoScroll = nearBottom;
        });
    }

    setConfig() {}
    getCardSize() { return 6; }
}

customElements.define('private-chat-card', HaChatCard);