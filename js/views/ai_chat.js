
import { AiAgent } from '../services/ai.js';
import { AuthService } from '../services/api.js';
import { VoiceService } from '../services/voice.js';

export default class AiChatView {
    async render() {
        const user = AuthService.getUser();
        if (!user) {
            window.app.router.navigate('login');
            return document.createElement('div');
        }

        const container = document.createElement('div');
        container.className = 'view-ai-chat';
        container.style.height = '100%';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.background = '#F8FAFC';
        this.container = container;

        container.innerHTML = `
                <!-- Header -->
                <header style="background:white; padding:calc(16px + var(--safe-area-top)) 20px 16px; border-bottom:1px solid #E2E8F0; display:flex; align-items:center; gap:12px; flex-shrink:0;">
                    <button id="back-home" style="background:none; border:none; padding:8px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--text-secondary);">
                        <span class="material-icons-round">arrow_back</span>
                    </button>
                    <div>
                        <div style="font-weight:700; color:#000000; font-size:16px;">ARTELCO AI Agent</div>
                    </div>
                    
                    <div style="margin-left:auto; display:flex; align-items:center; gap:8px;">
                        <button id="start-call" style="background:#00A4E0; color:white; border:none; padding:8px 12px; border-radius:10px; cursor:pointer; display:flex; align-items:center; gap:6px; font-size:12px; font-weight:700; transition:all 0.2s; box-shadow: 0 4px 12px rgba(0, 164, 224, 0.2);">
                            <span class="material-icons-round" style="font-size:18px;">phone</span>
                            CALL
                        </button>
                        <button id="toggle-voice" style="background:${VoiceService.autoSpeak ? 'rgba(16,185,129,0.1)' : '#F1F5F9'}; color:${VoiceService.autoSpeak ? '#10B981' : 'var(--text-tertiary)'}; border:none; padding:8px 12px; border-radius:10px; cursor:pointer; display:flex; align-items:center; gap:6px; font-size:12px; font-weight:700; transition:all 0.2s;">
                            <span class="material-icons-round" style="font-size:18px;">${VoiceService.autoSpeak ? 'volume_up' : 'volume_off'}</span>
                            ${VoiceService.autoSpeak ? 'VOICE ON' : 'VOICE OFF'}
                        </button>
                    </div>
                </header>

                <!-- Messages Area (Forced Scroll Fix) -->
                <div id="chat-messages" style="height: calc(100vh - 220px); overflow-y: scroll; padding: 20px 20px 220px 20px; display: flex; flex-direction: column; gap: 16px; -webkit-overflow-scrolling: touch; touch-action: pan-y !important;">
                </div>

                <!-- Suggestions -->
                <div style="padding:0 20px 12px; display:flex; gap:8px; overflow-x:auto; flex-shrink:0;" id="chat-suggestions">
                    <button class="chip-btn" data-query="Check product costs" style="background:white; border:1px solid #E2E8F0; padding:6px 14px; border-radius:20px; font-size:12px; font-weight:700; color:#000000; cursor:pointer; white-space:nowrap;">Check costs</button>
                    <button class="chip-btn" data-query="Show items in stock" style="background:white; border:1px solid #E2E8F0; padding:6px 14px; border-radius:20px; font-size:12px; font-weight:700; color:#000000; cursor:pointer; white-space:nowrap;">In Stock</button>
                    <button class="chip-btn" data-query="Find my tickets" style="background:white; border:1px solid #E2E8F0; padding:6px 14px; border-radius:20px; font-size:12px; font-weight:700; color:#000000; cursor:pointer; white-space:nowrap;">My Requests</button>
                </div>

                <!-- Input Area -->
                <div style="padding:16px 20px 24px; background:white; border-top:1px solid #E2E8F0;">
                    <div style="position:relative; display:flex; align-items:center; gap:12px; background:#F1F5F9; border-radius:16px; padding:8px 12px; border:1px solid transparent; transition:all 0.2s;" id="input-container">
                        <textarea id="chat-textarea" placeholder="Type your request here..." style="flex:1; background:none; border:none; outline:none; font-family:inherit; font-size:15px; color:#000000; font-weight: 500; padding:8px; min-height:24px; max-height:120px; resize:none;" rows="1"></textarea>
                        
                        <div style="display:flex; align-items:center; gap:8px;">
                            <button id="voice-btn" style="width:40px; height:40px; background:#F1F5F9; border-radius:12px; border:1px solid #E2E8F0; display:flex; align-items:center; justify-content:center; color:#000000; cursor:pointer; transition:all 0.2s;">
                                <span class="material-icons-round" id="mic-icon">mic</span>
                            </button>
                            <button id="send-msg" style="width:40px; height:40px; background:white; border-radius:12px; border:1px solid #E2E8F0; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0;">
                                <img src="assets/bg-pattern.png" style="width:24px; height:24px; object-fit:contain;">
                            </button>
                        </div>
                    </div>
                </div>
        `;

        this.applyEvents();
        // Start with a clean slate
        // this.renderInitialMessage();
        return container;
    }

    applyEvents() {
        const backBtn = this.container.querySelector('#back-home');
        backBtn.onclick = () => window.app.router.navigate('home');

        const startCall = this.container.querySelector('#start-call');
        startCall.onclick = () => window.app.router.navigate('call');

        const toggleVoice = this.container.querySelector('#toggle-voice');
        toggleVoice.onclick = () => {
            VoiceService.autoSpeak = !VoiceService.autoSpeak;
            toggleVoice.style.background = VoiceService.autoSpeak ? 'rgba(16,185,129,0.1)' : '#F1F5F9';
            toggleVoice.style.color = VoiceService.autoSpeak ? '#10B981' : 'var(--text-tertiary)';
            toggleVoice.innerHTML = `
                <span class="material-icons-round" style="font-size:18px;">${VoiceService.autoSpeak ? 'volume_up' : 'volume_off'}</span>
                ${VoiceService.autoSpeak ? 'VOICE ON' : 'VOICE OFF'}
            `;
        };

        const textarea = this.container.querySelector('#chat-textarea');
        const sendBtn = this.container.querySelector('#send-msg');
        const voiceBtn = this.container.querySelector('#voice-btn');
        const micIcon = this.container.querySelector('#mic-icon');
        const inputContainer = this.container.querySelector('#input-container');

        textarea.onfocus = () => inputContainer.style.borderColor = 'var(--primary-color)';
        textarea.onblur = () => inputContainer.style.borderColor = 'transparent';

        textarea.oninput = () => {
            textarea.style.height = 'auto';
            textarea.style.height = (textarea.scrollHeight) + 'px';
        };

        const handleSend = async (customMsg = null, userVoiceUrl = null) => {
            const msg = customMsg || textarea.value.trim();
            if (!msg && !userVoiceUrl) return;

            if (!customMsg) {
                textarea.value = '';
                textarea.style.height = 'auto';
            }

            this.addMessage('user', msg || "(Voice Message)", userVoiceUrl);

            const typingId = this.addTypingIndicator();
            const response = await AiAgent.sendMessage(msg || "Sent a voice message.", (status) => {
                this.updateTypingLabel(typingId, status);
            });
            this.removeTypingIndicator(typingId);

            // Get AI voice response
            const aiVoiceUrl = await VoiceService.getVoiceResponse(response);
            this.addMessage('ai', response, aiVoiceUrl);

            if (VoiceService.autoSpeak && aiVoiceUrl) {
                const audio = new Audio(aiVoiceUrl);
                audio.play();
            }
        };

        // Voice Recording Logic
        voiceBtn.onclick = async () => {
            if (VoiceService.isRecording) {
                micIcon.innerText = 'hourglass_empty';
                const result = await VoiceService.stopRecording();
                micIcon.innerText = 'mic';
                voiceBtn.style.background = '#F1F5F9';
                voiceBtn.style.color = 'var(--text-secondary)';
                voiceBtn.classList.remove('pulse-red');

                if (result) {
                    handleSend(result.text, result.audioUrl);
                }
            } else {
                const started = await VoiceService.startRecording();
                if (started) {
                    micIcon.innerText = 'stop';
                    voiceBtn.style.background = '#EF4444';
                    voiceBtn.style.color = 'white';
                    voiceBtn.classList.add('pulse-red');
                }
            }
        };

        sendBtn.onclick = () => handleSend();
        textarea.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        };

        // Suggestion chips
        this.container.querySelectorAll('.chip-btn').forEach(btn => {
            btn.onclick = () => {
                const query = btn.getAttribute('data-query');
                textarea.value = query;
                textarea.dispatchEvent(new Event('input')); // Reset height
                handleSend();
            };
        });
    }

    addMessage(type, text, voiceUrl = null) {
        const chatArea = this.container.querySelector('#chat-messages');
        const bubble = document.createElement('div');
        bubble.className = "animate-enter";

        if (type === 'user') {
            bubble.style = "align-self:flex-end; background:#000000; color:#FFFFFF; padding:12px 16px; border-radius:18px 18px 2px 18px; max-width:85%; font-size:14px; line-height:1.5; box-shadow:0 4px 12px rgba(0,0,0,0.1); display:flex; flex-direction:column; gap:8px; font-weight:500;";

            let html = `<div>${text}</div>`;
            if (voiceUrl) {
                html += `
                    <div style="background:rgba(255,255,255,0.1); border-radius:12px; padding:4px 8px; display:flex; align-items:center; gap:8px;">
                        <audio src="${voiceUrl}" controls style="height:30px; filter:invert(1) grayscale(1) contrast(200%); width:200px;"></audio>
                    </div>
                `;
            }
            bubble.innerHTML = html;
            chatArea.appendChild(bubble);
        } else {
            // Processing AI response for rich components
            let contentHtml = text;
            const components = [];

            // Extract Charts
            if (contentHtml.includes('[CHART]')) {
                const parts = contentHtml.split('[CHART]');
                contentHtml = parts[0];
                for (let i = 1; i < parts.length; i++) {
                    try {
                        const chartData = JSON.parse(parts[i].trim().split('\n')[0]);
                        components.push({ type: 'chart', data: chartData });
                    } catch (e) { console.error("Chart parse failed", e); }
                    // Clean up trailing text from this part if any
                    contentHtml += parts[i].substring(parts[i].indexOf('\n') + 1 || parts[i].length);
                }
            }

            // Extract Tables [TABLE]
            if (contentHtml.includes('[TABLE]')) {
                const parts = contentHtml.split('[TABLE]');
                contentHtml = parts[0];
                for (let i = 1; i < parts.length; i++) {
                    try {
                        const jsonStr = parts[i].trim().split('\n')[0];
                        const tableData = JSON.parse(jsonStr);
                        components.push({ type: 'table', data: tableData });

                        // Add back any text that came after the JSON block
                        const remainingText = parts[i].trim().substring(jsonStr.length).trim();
                        if (remainingText) contentHtml += '<br>' + remainingText;
                    } catch (e) {
                        console.error("Table parse failed", e);
                        contentHtml += '[TABLE]' + parts[i];
                    }
                }
            }

            // NEW: Enhanced Markdown Table Detection & Extraction
            const markdownTableRegex = /^(\s*\|[^\n]+\|\r?\n?)+/gm;
            let matches = [...contentHtml.matchAll(markdownTableRegex)];

            for (const match of matches) {
                const tableStr = match[0].trim();
                // Basic validation: must have at least 3 lines (Header, Separator, Data)
                // and contain the markdown separator pattern | --- |
                if (tableStr.split('\n').length >= 3 && /\|\s*:?-+:?\s*\|/.test(tableStr)) {
                    const parsed = this.parseMarkdownTable(tableStr);
                    if (parsed && parsed.rows.length > 0) {
                        components.push({ type: 'table', data: parsed });
                        // Remove the raw table from the text bubble
                        contentHtml = contentHtml.replace(match[0], '');
                    }
                }
            }

            // NEW: Strip [ACTION] blocks so they don't clutter the UI
            contentHtml = contentHtml.replace(/\[ACTION\]\s*{.*?}/g, '').trim();

            const formattedText = contentHtml.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
            let html = `<div style="font-size:14px; line-height:1.6; color:#000000; font-weight:500;">${formattedText}</div>`;

            if (voiceUrl) {
                html = `
                    <div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:12px; padding:10px 14px; display:flex; align-items:center; gap:12px;">
                        <span class="material-icons-round" style="color:var(--primary-color);">play_circle</span>
                        <audio src="${voiceUrl}" controls style="height:32px; width:200px;"></audio>
                    </div>
                    ` + html;
            }

            bubble.innerHTML = html;
            chatArea.appendChild(bubble);

            // Render Components
            components.forEach(comp => {
                if (comp.type === 'chart') this.renderRichChart(comp.data);
                if (comp.type === 'table') this.renderRichTable(comp.data);
            });
        }

        chatArea.scrollTop = chatArea.scrollHeight;
    }

    parseMarkdownTable(mdText) {
        try {
            const lines = mdText.trim().split('\n').filter(l => l.trim().startsWith('|'));
            if (lines.length < 3) return null; // Header, Separator, at least one Row

            const parseLine = (line) => line.split('|').map(c => c.trim()).filter((c, i, a) => i > 0 && i < a.length - 1);

            const headers = parseLine(lines[0]);
            const rows = lines.slice(2).map(parseLine).filter(r => r.length > 0);

            return { headers, rows };
        } catch (e) {
            console.error("MD Table parse error", e);
            return null;
        }
    }

    renderRichTable(data) {
        const chatArea = this.container.querySelector('#chat-messages');
        const container = document.createElement('div');
        container.className = 'rich-table-container animate-slide-up';
        container.style = "background:white; border-radius:12px; border:1px solid #E2E8F0; margin:16px 0; overflow-x:auto; -webkit-overflow-scrolling:touch; box-shadow:0 4px 12px rgba(0,0,0,0.05); width:100%; max-width:100%;";

        if (!data || !data.rows || !data.headers) return;

        const tableId = 'table-' + Date.now();
        const searchId = 'search-' + tableId;

        container.innerHTML = `
            <div style="background:#F8FAFC; padding:10px 16px; border-bottom:1px solid #E2E8F0; display:flex; justify-content:space-between; align-items:center;">
                 <span style="font-weight:700; font-size:12px; color:#000000; text-transform:uppercase; letter-spacing:0.5px;">Data Result</span>
                 <div style="background:white; border:1px solid #E2E8F0; border-radius:6px; padding:2px 8px; display:flex; align-items:center; gap:6px;">
                     <span class="material-icons-round" style="font-size:16px; color:#000000;">search</span>
                     <input type="text" id="${searchId}" placeholder="Filter..." style="border:none; background:none; outline:none; font-size:12px; width:80px; padding:4px 0;">
                 </div>
            </div>
            <div style="overflow-x:auto;">
                <table class="rich-table" id="${tableId}" style="width:100%; border-collapse:collapse; font-size:11px; min-width:600px;">
                    <thead>
                        <tr style="background:#F9FAFB;">
                            ${data.headers.map(h => `<th style="text-align:left; padding:10px 16px; font-weight:700; color:var(--text-secondary); border-bottom:2px solid #E2E8F0;">${h}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody id="body-${tableId}">
                        ${data.rows.map(row => `
                            <tr style="border-bottom:1px solid #F1F5F9; transition:background 0.2s;">
                                ${row.map((cell, idx) => {
            const isCost = data.headers[idx].toLowerCase().includes('cost') || data.headers[idx].toLowerCase().includes('price') || cell.toLowerCase().includes('jod') || cell.toLowerCase().includes('usd');
            const val = isCost ? `<span style="font-weight:700; color:#059669;">${cell}</span>` : cell;
            return `<td style="padding:10px 16px; color:#000000;">${val}</td>`;
        }).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div style="background:#F8FAFC; padding:6px 16px; border-top:1px solid #E2E8F0; font-size:11px; color:#000000; font-weight:700; text-align:right;">
                Total: ${data.rows.length} records
            </div>
        `;

        chatArea.appendChild(container);

        // Add client-side search logic
        const searchInput = container.querySelector(`#${searchId}`);
        const tableBody = container.querySelector(`#body-${tableId}`);
        searchInput.oninput = (e) => {
            const query = e.target.value.toLowerCase();
            const rows = tableBody.querySelectorAll('tr');
            rows.forEach(row => {
                const text = row.innerText.toLowerCase();
                row.style.display = text.includes(query) ? '' : 'none';
            });
        };
    }

    renderRichChart(data) {
        const chatArea = this.container.querySelector('#chat-messages');
        const canvasContainer = document.createElement('div');
        canvasContainer.style = "background:white; border-radius:16px; border:1px solid #E2E8F0; padding:16px; margin-top:8px; width:100%; animation: slideUp 0.3s ease-out;";

        const canvasId = 'chart-' + Date.now();
        canvasContainer.innerHTML = `
            <div style="font-weight:700; font-size:14px; margin-bottom:12px; color:var(--primary-color);">${data.title || 'Data Analysis'}</div>
            <canvas id="${canvasId}" style="max-height:220px;"></canvas>
        `;

        chatArea.appendChild(canvasContainer);

        const ctx = document.getElementById(canvasId).getContext('2d');
        new Chart(ctx, {
            type: data.type || 'bar',
            data: {
                labels: data.labels,
                datasets: data.datasets.map(ds => ({
                    ...ds,
                    backgroundColor: data.type === 'pie' ? ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#3B82F6'] : '#6366F1',
                    borderRadius: 4
                }))
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: data.type === 'pie', position: 'bottom' } },
                scales: data.type !== 'pie' ? {
                    y: { beginAtZero: true, grid: { display: false } },
                    x: { grid: { display: false } }
                } : {}
            }
        });
    }

    addTypingIndicator() {
        const chatArea = this.container.querySelector('#chat-messages');
        const id = 'typing-' + Date.now();
        const bubble = document.createElement('div');
        bubble.id = id;
        bubble.style = "align-self:flex-start; background:white; padding:12px 16px; border-radius:2px 14px 14px 14px; border:1px solid #E2E8F0; min-width:80px; display:flex; flex-direction:column; gap:8px; box-shadow:0 2px 5px rgba(0,0,0,0.05);";
        bubble.innerHTML = `
            <div style="display:flex; gap:4px; align-items:center;">
                <div class="dot" style="width:5px; height:5px; background:var(--primary-color); border-radius:50%; animation: bounce 1.4s infinite ease-in-out;"></div>
                <div class="dot" style="width:5px; height:5px; background:var(--primary-color); border-radius:50%; animation: bounce 1.4s infinite ease-in-out 0.2s;"></div>
                <div class="dot" style="width:5px; height:5px; background:var(--primary-color); border-radius:50%; animation: bounce 1.4s infinite ease-in-out 0.4s;"></div>
            </div>
            <div id="${id}-label" style="font-size:11px; font-weight:700; color:#000000; font-style:italic; white-space:nowrap;">Thinking...</div>
        `;
        chatArea.appendChild(bubble);
        chatArea.scrollTop = chatArea.scrollHeight;
        return id;
    }

    updateTypingLabel(id, text) {
        const label = document.getElementById(id + '-label');
        if (label) {
            label.innerText = text;
            // Scroll to bottom when height changes
            const chatArea = this.container.querySelector('#chat-messages');
            chatArea.scrollTop = chatArea.scrollHeight;
        }
    }

    removeTypingIndicator(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    renderInitialMessage() {
        const user = AuthService.getUser();
        this.addMessage('ai', `Hello ${user.Name}! How can I assist you with your tasks today?`);
    }
}
