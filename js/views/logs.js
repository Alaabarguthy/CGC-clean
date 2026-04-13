
import { LogService } from '../services/log.js';

export default class LogsView {
    async render() {
        const container = document.createElement('div');
        container.className = 'view-logs';
        container.style = "height:100%; display:flex; flex-direction:column; background:#F8FAFC;";
        this.container = container;

        container.innerHTML = `
            <header style="background:white; padding:16px 20px; border-bottom:1px solid #E2E8F0; display:flex; align-items:center; gap:12px; flex-shrink:0; position:sticky; top:0; z-index:100;">
                <button id="back-home" style="background:none; border:none; padding:8px; cursor:pointer; color:var(--text-secondary);">
                    <span class="material-icons-round">arrow_back</span>
                </button>
                <h1 style="font-size:18px; font-weight:700; margin:0; flex:1;">System Trace Logs</h1>
                <div style="display:flex; gap:8px;">
                    <button id="download-logs" style="background:var(--primary-color); color:white; border:none; padding:8px 12px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:4px;">
                        <span class="material-icons-round" style="font-size:16px;">download</span>
                        JSON
                    </button>
                    <button id="clear-logs" style="background:#F1F5F9; color:var(--danger); border:none; padding:8px; border-radius:8px; cursor:pointer;">
                        <span class="material-icons-round" style="font-size:20px;">delete_sweep</span>
                    </button>
                </div>
            </header>

            <div id="logs-list" style="flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:12px;">
                <!-- Logs will be injected here -->
            </div>
        `;

        this.applyEvents();
        this.renderLogs();
        return container;
    }

    applyEvents() {
        this.container.querySelector('#back-home').onclick = () => window.app.router.navigate('home');
        this.container.querySelector('#download-logs').onclick = () => LogService.downloadLogs();
        this.container.querySelector('#clear-logs').onclick = () => {
            if (confirm("Clear all system logs?")) {
                LogService.clearLogs();
                this.renderLogs();
            }
        };
    }

    renderLogs() {
        const list = this.container.querySelector('#logs-list');
        const logs = LogService.getLogs();

        if (logs.length === 0) {
            list.innerHTML = `
                <div style="text-align:center; padding:60px 20px; color:var(--text-tertiary);">
                    <span class="material-icons-round" style="font-size:48px; opacity:0.2;">assignment</span>
                    <div style="margin-top:16px; font-weight:600;">No logs exported yet.</div>
                </div>
            `;
            return;
        }

        list.innerHTML = logs.map(log => `
            <div class="card animate-enter" style="padding:16px; background:white; border:1px solid #E2E8F0; border-radius:12px; font-size:13px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="padding:4px 8px; border-radius:6px; font-size:10px; font-weight:800; text-transform:uppercase; background:${this.getTypeColor(log.type)}20; color:${this.getTypeColor(log.type)};">
                            ${log.type}
                        </span>
                        <span style="font-weight:700; color:var(--text-primary);">${log.action}</span>
                    </div>
                    <span style="font-size:11px; color:var(--text-tertiary);">${new Date(log.timestamp).toLocaleTimeString()}</span>
                </div>
                <div style="color:var(--text-secondary); margin-bottom:8px; line-height:1.4;">${log.message}</div>
                ${log.details ? `
                    <div style="background:#F1F5F9; padding:10px; border-radius:8px; font-family:monospace; font-size:11px; white-space:pre-wrap; overflow-x:auto; color:#475569; border-left:3px solid ${this.getTypeColor(log.type)};">
                        ${log.details}
                    </div>
                ` : ''}
            </div>
        `).join('');
    }

    getTypeColor(type) {
        switch (type) {
            case 'AI': return '#6366F1';
            case 'ERP': return '#00A4E0';
            case 'SYSTEM': return '#64748B';
            default: return '#94A3B8';
        }
    }
}
