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

    sendMessage(file = null) {
        const input = this.shadowRoot.querySelector('#msg-input');
        const text = input.value.trim();

        if (!text && !file) return;

        if (file) {
            const reader = new FileReader();

            reader.onload = () => {
                const base64 = reader.result.split(',')[1];

                this._hass.callService('private_chat', 'send_message', {
                    message: text,
                    file: base64,
                    file_name: file.name
                });
            };

            reader.readAsDataURL(file);
        } else {
            this._hass.callService('private_chat', 'send_message', {
                message: text
            });
        }

        input.value = '';
    }

    refreshChat(forceScroll = false) {
        const box = this.shadowRoot.querySelector('#chat-box');
        box.innerHTML = '';

        this.messages.forEach(msg => {
            const isMe = msg.user_id === this.currentUserId;

            const div = document.createElement('div');
            div.className = `msg ${isMe ? 'me' : 'other'}`;

            const bubble = document.createElement('div');
            bubble.className = 'bubble';

            const meta = document.createElement('div');
            meta.className = 'meta';
            meta.textContent = `${msg.user}`;

            bubble.appendChild(meta);

            if (msg.message) {
                const text = document.createElement('div');
                text.textContent = msg.message;
                bubble.appendChild(text);
            }

            // 📷 IMAGE
            if (msg.file_type === 'image') {
                const img = document.createElement('img');
                img.src = msg.file_url;
                img.style.maxWidth = '200px';
                img.style.borderRadius = '10px';
                bubble.appendChild(img);
            }

            // 🎬 VIDEO
            if (msg.file_type === 'video') {
                const video = document.createElement('video');
                video.src = msg.file_url;
                video.controls = true;
                video.style.maxWidth = '200px';
                bubble.appendChild(video);
            }

            // 📄 FILE
            if (msg.file_type === 'file') {
                const link = document.createElement('a');
                link.href = msg.file_url;
                link.textContent = msg.file_name;
                link.target = '_blank';
                bubble.appendChild(link);
            }

            div.appendChild(bubble);
            box.appendChild(div);
        });

        this.scrollToBottom(forceScroll);
    }

    scrollToBottom(force = false) {
        const box = this.shadowRoot.querySelector('#chat-box');
        if (force || this._autoScroll) {
            requestAnimationFrame(() => {
                box.scrollTop = box.scrollHeight;
            });
        }
    }

    render() {
        this.shadowRoot.innerHTML = `
        <style>
        #chat-container { height:740px; display:flex; flex-direction:column; }
        #chat-box { flex:1; overflow:auto; display:flex; flex-direction:column; gap:8px; }
        .msg { max-width:75%; }
        .me { align-self:flex-end; }
        .other { align-self:flex-start; }
        .bubble { padding:10px; border-radius:12px; background:#eee; }
        .me .bubble { background:#03a9f4; color:white; }
        </style>

        <div id="chat-container">
            <div id="chat-box"></div>
            <input id="msg-input">
            <input type="file" id="file-input">
            <button id="send-btn">Send</button>
        </div>
        `;

        const fileInput = this.shadowRoot.querySelector('#file-input');

        this.shadowRoot.querySelector('#send-btn')
            .addEventListener('click', () => {
                this.sendMessage(fileInput.files[0]);
                fileInput.value = '';
            });
    }
}

customElements.define('private-chat-card', HaChatCard);