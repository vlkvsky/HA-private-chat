console.info("PRIVATE CHAT CARD");

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
        if (!box) return;

        box.innerHTML = '';

        this.messages.forEach(msg => {
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
                const text = document.createElement('div');
                text.textContent = msg.message;
                bubble.appendChild(text);
            }

            if (msg.file_type === 'image') {
                const img = document.createElement('img');
                img.src = msg.file_url;
                img.style.maxWidth = '220px';
                img.style.borderRadius = '10px';
                bubble.appendChild(img);
            }

            if (msg.file_type === 'video') {
                const video = document.createElement('video');
                video.src = msg.file_url;
                video.controls = true;
                video.style.maxWidth = '220px';
                bubble.appendChild(video);
            }

            if (msg.file_type === 'file') {
                const link = document.createElement('a');
                link.href = msg.file_url;
                link.textContent = msg.file_name || "Download file";
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
        if (!box) return;

        requestAnimationFrame(() => {
            box.scrollTop = box.scrollHeight;
        });
    }

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

        const fileInput = this.shadowRoot.querySelector('#file-input');

        this.shadowRoot.querySelector('#attach-btn')
            .addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', () => {
            const file = fileInput.files[0];
            if (file) {
                this.sendMessage(file);
                fileInput.value = '';
            }
        });

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