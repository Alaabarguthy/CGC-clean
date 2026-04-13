
import { AiAgent } from '../services/ai.js';
import { LogService } from '../services/log.js';

export default class ChatView {
    async render() {
        const container = document.createElement('div');
        container.className = 'view-chat';
        container.style.cssText = `
            display: flex;
            flex-direction: column;
            height: 100%;
            background: #FFFFFF;
            position: relative;
        `;

        container.innerHTML = `
            <!-- Chat Header -->
            <div style="flex-shrink:0; height:60px; border-bottom:1px solid var(--border-light); display:flex; align-items:center; padding:0 20px; background:rgba(255,255,255,0.9); backdrop-filter:blur(10px); z-index:10;">
                <span class="material-icons-round" style="color:var(--primary-color); margin-right:12px;">smart_toy</span>
                <div>
                    <div style="font-weight:700; font-size:16px;">Artelco Assistant</div>
                    <div style="font-size:11px; color:var(--success); display:flex; align-items:center; gap:4px;">
                        <div style="width:6px; height:6px; background:var(--success); border-radius:50%;"></div>
                        Online
                    </div>
                </div>
            </div>

            <!-- Messages Area (Scrollable with forced Height) -->
            <div id="chat-messages" style="height: calc(100vh - 180px); overflow-y: scroll; -webkit-overflow-scrolling: touch; padding: 20px 20px 200px 20px; display: flex; flex-direction: column; gap: 16px; overscroll-behavior: contain; touch-action: pan-y !important;">
                <div style="text-align:center; font-size:11px; color:var(--text-tertiary); margin:10px 0;">TODAY</div>
                ${this.renderMessage('bot', 'Good morning! How can I help you today?')}
                <div class="suggestions-container" style="display:flex; gap:8px; flex-wrap:wrap; margin-left:44px; padding-bottom: 20px;">
                    ${this.renderChip('Show my open tickets', 'get_my_tickets')}
                    ${this.renderChip('Check stock level', 'check_stock')}
                </div>
            </div>

            <!-- Input Area -->
            <div style="flex-shrink:0; background:white; padding:12px 16px; border-top:1px solid var(--border-light); padding-bottom: calc(12px + var(--safe-area-bottom));">
                <div style="background:var(--bg-body); border-radius:24px; padding:4px 4px 4px 16px; display:flex; align-items:center; border:1px solid var(--border-light);">
                    <input id="chat-input" type="text" placeholder="Ask anything..." style="flex:1; background:none; border:none; outline:none; font-size:15px; padding:8px 0; color:var(--text-primary);">
                    <button id="chat-send-btn" style="width:40px; height:40px; background:var(--primary-color); border:none; border-radius:50%; color:white; display:flex; align-items:center; justify-content:center; margin-left:8px; cursor:pointer;">
                        <span class="material-icons-round" style="font-size:20px;">send</span>
                    </button>
                </div>
            </div>
        `;
        this.container = container; 
        return container;
    }

    afterRender() {
        this.applyEvents();
    }

    applyEvents() {
        const input = this.container.querySelector('#chat-input');
        const sendBtn = this.container.querySelector('#chat-send-btn');
        const messages = this.container.querySelector('#chat-messages');

        const triggerSend = () => {
            const text = input.value.trim();
            if (text) {
                this.handleSendMessage(text);
                input.value = '';
            }
        };

        sendBtn.onclick = triggerSend;
        input.onkeypress = (e) => { if (e.key === 'Enter') triggerSend(); };

        // Handle chips
        this.container.addEventListener('click', (e) => {
            const chip = e.target.closest('.chat-chip');
            if (chip) {
                const actionText = chip.innerText;
                this.handleSendMessage(actionText);
            }
        });
    }

    async handleSendMessage(text) {
        const messagesArea = this.container.querySelector('#chat-messages');
        
        // 1. Add User Message
        messagesArea.insertAdjacentHTML('beforeend', this.renderMessage('user', text));
        this.scrollToBottom();

        // 2. Add Typing Indicator
        const typingId = 'typing-' + Date.now();
        messagesArea.insertAdjacentHTML('beforeend', `
            <div id="${typingId}" style="display:flex; align-items:center; gap:8px; margin-left:44px; color:var(--text-tertiary); font-size:12px; font-style:italic;">
                <div class="loader-spinner" style="width:14px; height:14px; border-width:2px;"></div>
                AI is thinking...
            </div>
        `);
        this.scrollToBottom();

        try {
            // 3. Call AI
            const response = await AiAgent.sendMessage(text, (status) => {
                const typingEl = document.getElementById(typingId);
                if (typingEl) typingEl.innerText = status;
            });

            // 4. Remove typing and add response
            document.getElementById(typingId)?.remove();
            messagesArea.insertAdjacentHTML('beforeend', this.renderMessage('bot', response));
            this.scrollToBottom();
        } catch (e) {
            document.getElementById(typingId)?.remove();
            messagesArea.insertAdjacentHTML('beforeend', this.renderMessage('bot', `<span style="color:red;">Error: ${e.message}</span>`));
            this.scrollToBottom();
        }
    }

    scrollToBottom() {
        const messages = this.container.querySelector('#chat-messages');
        messages.scrollTop = messages.scrollHeight;
    }

    renderMessage(type, text) {
        const isBot = type === 'bot';
        const align = isBot ? 'flex-start' : 'flex-end';
        const bg = isBot ? '#F1F5F9' : 'var(--primary-color)';
        const color = isBot ? 'var(--text-primary)' : 'white';
        const rounded = isBot ? '4px 18px 18px 18px' : '18px 18px 4px 18px';

        let avatar = '';
        if (isBot) {
            avatar = `
                <div style="width:32px; height:32px; border-radius:50%; background:var(--primary-light); display:flex; align-items:center; justify-content:center; color:white; margin-right:12px; flex-shrink:0;">
                    <span class="material-icons-round" style="font-size:18px;">smart_toy</span>
                </div>
            `;
        }

        // Wrap tables in the scrollable container we fixed in CSS
        let content = text;
        if (text.includes('<table')) {
            content = `<div class="rich-table-container">${text}</div>`;
        }

        return `
            <div class="msg-item msg-enter" style="display:flex; align-items:flex-end; justify-content:${align}; width: 100%; margin-bottom: 8px;">
                ${avatar}
                <div class="${isBot ? 'ai-bubble' : 'user-bubble'}" style="max-width:calc(100% - 44px); background:${bg}; color:${color}; padding:12px 16px; border-radius:${rounded}; font-size:14px; line-height:1.5; box-shadow: 0 2px 5px rgba(0,0,0,0.05); overflow-x: auto; overscroll-behavior: contain;">
                    ${content}
                </div>
            </div>
        `;
    }

    renderChip(label, action) {
        return `
            <button class="chat-chip" data-action="${action}" style="background:white; border:1px solid #E2E8F0; color:var(--text-secondary); padding:8px 14px; border-radius:20px; font-size:13px; font-weight:600; cursor:pointer; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                ${label}
            </button>
        `;
    }
}
