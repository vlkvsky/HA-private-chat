console.info("PRIVATE CHAT");

class HaChatCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        this.messages = [];
        this._ready = false;
        this._autoScroll = true;
        this._presenceTimer = null;
        this._onVisibility = () => this._sendPresence(document.visibilityState === 'visible');
    }

    // =========================
    // PRESENCE: «я зараз у чаті»
    // =========================
    _sendPresence(active) {
        if (!this._hass) return;
        this._hass.callWS({ type: 'private_chat/presence', active }).catch(() => {});
    }

    _startPresence() {
        if (this._presenceTimer) return;
        document.addEventListener('visibilitychange', this._onVisibility);
        this._sendPresence(document.visibilityState === 'visible');
        this._presenceTimer = setInterval(() => {
            if (document.visibilityState === 'visible') this._sendPresence(true);
        }, 15000);
    }

    _stopPresence() {
        document.removeEventListener('visibilitychange', this._onVisibility);
        if (this._presenceTimer) {
            clearInterval(this._presenceTimer);
            this._presenceTimer = null;
        }
        this._sendPresence(false);
    }

    connectedCallback() {
        if (this._ready) this._startPresence();
        this._updateOffset = this._updateOffset.bind(this);
        window.addEventListener('resize', this._updateOffset);
        this._observeSidebar();

        // iOS/Android: коли з'являється клавіатура, підганяємо висоту під видиму область,
        // щоб останні повідомлення не ховалися під верхній край екрана
        this._onViewport = this._onViewport || (() => this._fitViewport());
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', this._onViewport);
            window.visualViewport.addEventListener('scroll', this._onViewport);
        }
        this._fitViewport();
    }

    _fitViewport() {
        const vv = window.visualViewport;
        if (!vv) return;
        this.style.setProperty('--vv-height', vv.height + 'px');
        this.style.setProperty('--vv-top', vv.offsetTop + 'px');
        if (this._ready && this._autoScroll) this.scrollToBottom(true);
    }

    disconnectedCallback() {
        this._stopPresence();
        window.removeEventListener('resize', this._updateOffset);
        this._sidebarObserver?.disconnect();
        if (window.visualViewport && this._onViewport) {
            window.visualViewport.removeEventListener('resize', this._onViewport);
            window.visualViewport.removeEventListener('scroll', this._onViewport);
        }
    }

    _getSidebarEl() {
        try {
            const ha = document.querySelector('home-assistant');
            const main = ha?.shadowRoot?.querySelector('home-assistant-main');
            const drawer = main?.shadowRoot?.querySelector('ha-drawer');
            return drawer?.querySelector('ha-sidebar') || null;
        } catch (e) {
            return null;
        }
    }

    _observeSidebar() {
        const sidebar = this._getSidebarEl();
        if (!sidebar) {
            // DOM ще не готовий — пробуємо ще раз трохи пізніше
            setTimeout(() => this._observeSidebar(), 500);
            return;
        }
        this._sidebarObserver = new ResizeObserver(() => this._updateOffset());
        this._sidebarObserver.observe(sidebar);
        this._updateOffset();
    }

    _updateOffset() {
        const sidebar = this._getSidebarEl();
        const width = sidebar ? sidebar.getBoundingClientRect().width : 0;
        this.style.setProperty('--sidebar-offset', width + 'px');
    }

    set hass(hass) {
        this._hass = hass;

        if (!this._ready) {
            this._ready = true;
            this.render();
            this.subscribe();
            this._startPresence();
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
            top: var(--vv-top, 0px);
            right: 0;
            height: var(--vv-height, 100vh);
            left: var(--sidebar-offset, 0px);
            transition: left 0.2s ease;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial;
        }

        #container {
            height: 100%;
            overscroll-behavior: none;
            display: flex;
            flex-direction: column;
            background: var(--lovelace-background);
        }

        #chat-box {
            flex: 1;
            overflow-y: auto;
            overscroll-behavior: contain;
            -webkit-overflow-scrolling: touch;
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 6px;
            padding-top: calc(12px + env(safe-area-inset-top) + 56px);
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
            .addEventListener('focus', () => {
                this._autoScroll = true;
                setTimeout(() => this._fitViewport(), 300);
            });

        this.shadowRoot.querySelector('#msg-input')
            .addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.sendMessage();
                }
            });

        const box = this.shadowRoot.querySelector('#chat-box');

        // не даємо прокручувати сторінку Lovelace під чатом
        this.shadowRoot.querySelector('#container')
            .addEventListener('touchmove', (e) => {
                const path = e.composedPath();
                if (!path.includes(box)) {
                    e.preventDefault();
                    return;
                }
                const atTop = box.scrollTop <= 0;
                const atBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 1;
                if (box.scrollHeight <= box.clientHeight || (atTop && atBottom)) {
                    e.preventDefault();
                }
            }, { passive: false });

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
