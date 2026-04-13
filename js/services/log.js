
export const LogService = {
    MAX_LOGS: 500,

    addLog(type, action, message, details = null) {
        const logs = this.getLogs();
        const entry = {
            id: Date.now() + Math.random().toString(36).substr(2, 5),
            timestamp: new Date().toISOString(),
            type, // 'AI', 'ERP', 'SYSTEM'
            action, // 'TOOL_EXEC', 'AI_RESPONSE', 'TICKET_CREATE'
            message,
            details: details ? (typeof details === 'object' ? JSON.stringify(details, null, 2) : details) : null
        };

        logs.unshift(entry);

        // Keep only last 100 logs
        const trimmed = logs.slice(0, this.MAX_LOGS);
        localStorage.setItem('artelco_system_logs', JSON.stringify(trimmed));

        console.log(`[LOG][${type}] ${action}: ${message}`);
    },

    getLogs() {
        const data = localStorage.getItem('artelco_system_logs');
        return data ? JSON.parse(data) : [];
    },

    clearLogs() {
        localStorage.removeItem('artelco_system_logs');
    },

    downloadLogs() {
        const logs = this.getLogs();
        const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `artelco_logs_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
};
