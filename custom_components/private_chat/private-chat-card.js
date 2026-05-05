console.info("PRIVATE CHAT FINAL STABLE JS");

class HaChatCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        this.messages = [];
        this._ready = false;
        this._autoScroll = true;
    }

    // =========================
    // INIT
    // =========================
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
    // SUBSCRIBE EVENTS
    // =========================
    subscribe() {
        this._hass.connection.subscribeEvents((event) => {
            const msg = event.data?.message;
            if (!msg) return;

            this.messages.push(msg);
            this.appendMessage(msg, true);

        }, 'private_chat_new_message');

        this._hass.connection.subscribeEvents((event) => {
            const msgs = event.data?.messages;
            if (!msgs) return;

            this.messages = msgs;
            this.renderFullHistory();

        }, 'private_chat_history');
    }

    // =========================
    // SEND MESSAGE 
    // =========================
    async sendMessage(file = null) {
        const input = this.shadowRoot.querySelector('#msg-input');
        const text = input.value.trim();

        if (!text && !file) return;

        let payload = {};

        if (file) {
            payload = await this.uploadFile(file);
        }

        this._hass.callService('private_chat', 'send_message', {
            message: text,
            ...payload
        });

        input.value = '';
    }

    // =========================
    // UPLOAD FILE 
    // =========================
    async uploadFile(file) {
        const form = new FormData();
        form.append("file", file);

        const res = await fetch("/api/private_chat/upload", {
            method: "POST",
            body: form,
            headers: {
                Authorization: `Bearer ${this._hass.auth.data.access_token}`
            }
        });

        return await res.json();
    }

    // =========================
    // FULL HISTORY (ONLY ON LOAD)
    // =========================
    renderFullHistory() {
        const box = this.shadowRoot.querySelector('#chat-box');
        if (!box) return;

        box.innerHTML = '';

        this.messages.forEach(msg => {
            this.appendMessage(msg, false);
        });

        this.scrollToBottom(true);
    }

    // =========================
    // APPEND MESSAGE
    // =========================
    appendMessage(msg, shouldScroll = true) {
        const box = this.shadowRoot.querySelector('#chat-box');
        if (!box) return;

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

        // TEXT
        if (msg.message) {
            const text = document.createElement('div');
            text.textContent = msg.message;
            bubble.appendChild(text);
        }

        // MEDIA 
        if (msg.file_url) {
            const wrapper = document.createElement('div');
            wrapper.style.minHeight = '160px';

            if (msg.file_type === 'image') {
                const img = document.createElement('img');
                img.src = msg.file_url;
                img.loading = 'lazy';
                img.style.maxWidth = '220px';
                img.style.borderRadius = '10px';

                img.onclick = () => window.open(msg.file_url, '_blank');

                wrapper.appendChild(img);
            }

            if (msg.file_type === 'video') {
                const video = document.createElement('video');
                video.src = msg.file_url;
                video.controls = true;
                video.style.maxWidth = '220px';

                video.onclick = () => window.open(msg.file_url, '_blank');

                wrapper.appendChild(video);
            }

            if (msg.file_type === 'file') {
                const a = document.createElement('a');
                a.href = msg.file_url;
                a.target = '_blank';
                a.textContent = msg.file_name || 'download file';
                wrapper.appendChild(a);
            }

            bubble.appendChild(wrapper);
        }

        div.appendChild(bubble);
        box.appendChild(div);

        if (shouldScroll && this._autoScroll) {
            this.scrollToBottom();
        }
    }

    // =========================
    // STABLE SCROLL 
    // =========================
    scrollToBottom(force = false) {
        const box = this.shadowRoot.querySelector('#chat-box');
        if (!box) return;

        if (!force && !this._autoScroll) return;

        requestAnimationFrame(() => {
            box.scrollTop = box.scrollHeight;
        });
    }

    // =========================
    // UI
    // =========================
    render() {
        this.shadowRoot.innerHTML = `
        <style>
        #chat-container {
            display:flex;
            flex-direction:column;
            height:700px;
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

        .meta {
            font-size:11px;
            opacity:0.7;
            margin-bottom:3px;
        }

        #input-area {
            display:flex;
            gap:8px;
            border-top:1px solid #ccc;
            padding-top:10px;
            align-items:center;
        }

        #msg-input {
            flex:1;
            padding:10px;
            border-radius:8px;
        }

        #attach-btn {
            font-size:22px;
            cursor:pointer;
            background:none;
            border:none;
        }

        #send-btn {
            background:#03a9f4;
            color:white;
            border:none;
            border-radius:8px;
            padding:8px 16px;
        }

        #file-input {
            display:none;
        }
        </style>

        <div id="chat-container">
            <div id="chat-box"></div>

            <div id="input-area">
                <button id="attach-btn">📎</button>
                <input id="msg-input" placeholder="Message..." />
                <button id="send-btn">Send</button>
                <input type="file" id="file-input">
            </div>
        </div>
        `;

        const box = this.shadowRoot.querySelector('#chat-box');
        const fileInput = this.shadowRoot.querySelector('#file-input');
        const input = this.shadowRoot.querySelector('#msg-input');

        // attach
        this.shadowRoot.querySelector('#attach-btn')
            .onclick = () => fileInput.click();

        fileInput.onchange = () => {
            const file = fileInput.files[0];
            if (file) {
                this.sendMessage(file);
                fileInput.value = '';
            }
        };

        // send button
        this.shadowRoot.querySelector('#send-btn')
            .onclick = () => this.sendMessage();

        // ENTER FIX
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // AUTO SCROLL DETECT
        box.addEventListener('scroll', () => {
            const bottom =
                box.scrollHeight - box.scrollTop - box.clientHeight < 120;

            this._autoScroll = bottom;
        });
    }

    setConfig() {}
    getCardSize() { return 6; }
}

customElements.define('private-chat-card', HaChatCard);