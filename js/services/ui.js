/**
 * UIService - Handles premium notifications and custom app alerts
 * Replaces standard browser alert() with mobile-aesthetic popups
 */
export const UIService = {
    toastContainer: null,

    _initToastContainer() {
        if (!this.toastContainer) {
            this.toastContainer = document.createElement('div');
            this.toastContainer.className = 'toast-container';
            document.body.appendChild(this.toastContainer);
        }
    },

    /**
     * Show a quick toast notification
     * @param {string} message 
     * @param {'success' | 'error' | 'warning'} type 
     */
    showToast(message, type = 'success', duration = 3000) {
        this._initToastContainer();

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        let icon = 'check_circle';
        if (type === 'error') icon = 'error_outline';
        if (type === 'warning') icon = 'warning_amber';

        toast.innerHTML = `
            <span class="material-icons-round toast-icon">${icon}</span>
            <div class="toast-message">${message}</div>
        `;

        this.toastContainer.appendChild(toast);

        // Auto remove
        setTimeout(() => {
            toast.classList.add('toast-exit');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },

    /**
     * Show a premium modal alert (replaces window.alert)
     * @param {string} title 
     * @param {string} message 
     * @param {string} icon 
     */
    async alert(title, message, icon = 'info') {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'app-alert-overlay';

            let iconLabel = 'info';
            let iconColor = 'var(--info)';
            if (icon === 'success') { iconLabel = 'check_circle'; iconColor = 'var(--success)'; }
            if (icon === 'error') { iconLabel = 'error'; iconColor = 'var(--danger)'; }
            if (icon === 'warning') { iconLabel = 'warning'; iconColor = 'var(--warning)'; }

            overlay.innerHTML = `
                <div class="app-alert-sheet">
                    <div class="app-alert-icon" style="background:${iconColor}15; color:${iconColor};">
                        <span class="material-icons-round">${iconLabel}</span>
                    </div>
                    <div class="app-alert-title">${title}</div>
                    <div class="app-alert-msg">${message}</div>
                    <button class="app-alert-btn">OK</button>
                </div>
            `;

            document.body.appendChild(overlay);

            const btn = overlay.querySelector('.app-alert-btn');
            btn.onclick = () => {
                overlay.remove();
                resolve();
            };

            // Also close on overlay click
            overlay.onclick = (e) => {
                if (e.target === overlay) {
                    overlay.remove();
                    resolve();
                }
            };
        });
    },

    /**
     * Alias for alert to maintain compatibility
     */
    async showAlert(title, message, icon = 'info') {
        return this.alert(title, message, icon);
    },

    /**
     * Show a premium confirmation dialog
     * @param {string} title 
     * @param {string} message 
     * @returns {Promise<boolean>}
     */
    async confirm(title, message, type = 'primary') {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'app-alert-overlay';

            const color = type === 'danger' ? '#EF4444' : (type === 'success' ? '#10B981' : 'var(--primary-color)');
            const icon = type === 'danger' ? 'report_problem' : (type === 'success' ? 'check_circle' : 'help_outline');

            overlay.innerHTML = `
                <div class="app-alert-sheet">
                    <div class="app-alert-icon" style="background:${color}15; color:${color};">
                        <span class="material-icons-round">${icon}</span>
                    </div>
                    <div class="app-alert-title">${title}</div>
                    <div class="app-alert-msg">${message}</div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
                        <button class="app-alert-btn cancel-btn" style="background:#F3F4F6; color:var(--text-primary);">Cancel</button>
                        <button class="app-alert-btn confirm-btn" style="background:${color};">Yes</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            overlay.querySelector('.confirm-btn').onclick = () => {
                overlay.remove();
                resolve(true);
            };

            overlay.querySelector('.cancel-btn').onclick = () => {
                overlay.remove();
                resolve(false);
            };
        });
    },

    /**
     * Show a signature pad for drawing
     * @param {string} title 
     * @returns {Promise<string|null>} DataURL of signature or null
     */
    async showSignaturePad(title) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'app-alert-overlay';
            overlay.style.zIndex = '6000';

            overlay.innerHTML = `
                <div class="app-alert-sheet" style="max-width:400px; padding:24px;">
                    <h3 style="margin:0 0 16px; font-size:18px;">${title}</h3>
                    <div style="background:#F3F4F6; border:2px dashed #D1D5DB; border-radius:12px; margin-bottom:20px; position:relative; overflow:hidden;">
                        <canvas id="sig-canvas" width="340" height="200" style="width:100%; height:200px; touch-action:none;"></canvas>
                        <div style="position:absolute; bottom:8px; right:8px; pointer-events:none; opacity:0.3; font-size:10px; font-weight:700;">SIGN HERE</div>
                    </div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px;">
                        <button class="app-alert-btn cancel-btn" style="background:#F3F4F6; color:var(--text-primary);">Cancel</button>
                        <button class="app-alert-btn confirm-btn">Save Signature</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            const canvas = overlay.querySelector('#sig-canvas');
            const ctx = canvas.getContext('2d');
            let drawing = false;

            const getPos = (e) => {
                const rect = canvas.getBoundingClientRect();
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                return {
                    x: (clientX - rect.left) * (canvas.width / rect.width),
                    y: (clientY - rect.top) * (canvas.height / rect.height)
                };
            };

            const start = (e) => {
                drawing = true;
                const pos = getPos(e);
                ctx.beginPath();
                ctx.moveTo(pos.x, pos.y);
                e.preventDefault();
            };

            const move = (e) => {
                if (!drawing) return;
                const pos = getPos(e);
                ctx.lineTo(pos.x, pos.y);
                ctx.lineWidth = 2;
                ctx.lineCap = 'round';
                ctx.strokeStyle = '#1E293B';
                ctx.stroke();
                e.preventDefault();
            };

            const stop = () => drawing = false;

            canvas.addEventListener('touchstart', start);
            canvas.addEventListener('touchmove', move);
            canvas.addEventListener('touchend', stop);

            canvas.addEventListener('mousedown', start);
            canvas.addEventListener('mousemove', move);
            canvas.addEventListener('mouseup', stop);

            overlay.querySelector('.confirm-btn').onclick = () => {
                const dataUrl = canvas.toDataURL();
                overlay.remove();
                resolve(dataUrl);
            };

            overlay.querySelector('.cancel-btn').onclick = () => {
                overlay.remove();
                resolve(null);
            };
        });
    },

    /**
     * Show a full screen loading indicator
     * @param {string} message 
     * @returns {{remove: Function}} Reference to remove the loader
     */
    showLoading(message = "Loading...") {
        const overlay = document.createElement('div');
        overlay.className = 'app-alert-overlay';
        overlay.style.zIndex = '5000';
        overlay.style.display = 'flex';
        overlay.style.flexDirection = 'column';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.gap = '20px';

        overlay.innerHTML = `
            <div class="loader-spinner" style="border-width:4px; width:48px; height:48px; border-top-color:white;"></div>
            <div style="color:white; font-weight:600; font-size:16px;">${message}</div>
        `;

        document.body.appendChild(overlay);
        return {
            remove: () => overlay.remove()
        };
    }
};

// Global helper for quick access if needed
window.appAlert = (title, msg, type) => UIService.alert(title, msg, type);
window.appToast = (msg, type) => UIService.showToast(msg, type);
window.appConfirm = (title, msg, type) => UIService.confirm(title, msg, type);
window.appSignaturePad = (title) => UIService.showSignaturePad(title);
window.showLoading = (msg) => UIService.showLoading(msg);
