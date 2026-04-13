
export default class LoginView {
    constructor() {
        this.step = 'mobile'; // mobile | telegram | otp
        this.mobileNumber = '';
        this.pendingUser = null;
        this.tgPollInterval = null;
    }

    async render() {
        const container = document.createElement('div');
        container.className = 'view-login';
        container.style.height = '100dvh';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.justifyContent = 'center';
        container.style.padding = 'calc(32px + var(--safe-area-top)) 32px calc(32px + var(--safe-area-bottom))';
        container.style.background = 'white';

        this.container = container;
        this.updateUI();
        return container;
    }

    updateUI() {
        if (!this.container) return;

        // Cleanup any existing polls from previous renderings to avoid leaks
        if (this.tgPollInterval) {
            clearInterval(this.tgPollInterval);
            this.tgPollInterval = null;
        }

        let content = "";
        if (this.step === 'mobile') content = this.renderMobileStep();
        else if (this.step === 'telegram') content = this.renderTelegramStep();
        else if (this.step === 'otp') content = this.renderOtpStep();

        this.container.innerHTML = `
            <div style="text-align:center; margin-bottom:48px;">
                <h2 class="header-md" style="color:#3f3a86; font-weight:800; letter-spacing:1px; text-transform:uppercase;">Internal Workspace</h2>
            </div>
            ${content}
            <div style="margin-top:auto; text-align:center; padding-bottom:32px;">
                <p class="text-xs" style="color:#8e8bac;">Protected by Converged Generation Communications Company Ltd</p>
                <p class="text-xs" style="margin-top:8px;">v1.0.0</p>
            </div>
        `;

        // Re-attach events
        const btn = this.container.querySelector('#action-btn');
        if (btn) btn.onclick = () => this.handleAction();
        const copyBtn = this.container.querySelector('#copy-link-code-btn');
        if (copyBtn) {
            copyBtn.onclick = async () => {
                try {
                    const code = this.container.querySelector('#telegram-link-code')?.innerText || '';
                    await navigator.clipboard.writeText(code);
                    appToast('Code copied. Send it to the bot chat.', 'success');
                } catch (e) {
                    appToast('Copy failed. Please type the code manually.', 'warning');
                }
            };
        }

        // Attach OTP auto-jump listeners if in OTP step
        if (this.step === 'otp') {
            this.setupOtpListeners();
        }
    }

    renderMobileStep() {
        return `
            <div class="animate-enter">
                <h1 class="header-lg" style="margin-bottom:8px; color:#2f2a79;">Welcome Back</h1>
                <p class="text-sm" style="margin-bottom:32px;">Enter your mobile number to sign in.</p>
                
                <div style="margin-bottom:32px;">
                    <label class="text-xs" style="font-weight:600; text-transform:uppercase; letter-spacing:1px; margin-bottom:12px; display:block;">Mobile Number</label>
                    <div style="display:flex; gap:12px;">
                        <input type="tel" disabled value="+966" style="width:85px; padding:18px; border:1px solid var(--border-light); border-radius:14px; background:#F9FAFB; font-size:16px; font-weight:700; color:var(--text-primary); text-align:center;">
                        <input id="mobile-input" type="tel" placeholder="5X XXX XXXX" style="flex:1; padding:18px; border:1px solid var(--border-light); border-radius:14px; background:#F9FAFB; font-size:16px; font-weight:700; color:var(--text-primary); outline:none;">
                    </div>
                </div>

                <button id="action-btn" style="width:100%; padding:20px; background:linear-gradient(135deg, #4f4a99 0%, #3f3a86 58%, #eb4f67 100%); color:white; border:none; border-radius:16px; font-size:16px; font-weight:700; cursor:pointer; box-shadow:0 10px 20px rgba(63, 58, 134, 0.28);">
                    Identify Account
                </button>
            </div>
        `;
    }

    renderTelegramStep() {
        // Start polling automatically when this step is rendered
        this.startTelegramPolling();
        const linkCode = `cgc_${this.pendingUser?.AD_User_ID || ''}`;

        return `
            <div class="animate-enter" style="text-align:center;">
                <div style="width:72px; height:72px; background:#0088CC; color:white; border-radius:50%; display:flex; align-items:center; justify-content:center; margin: 0 auto 24px;">
                    <span class="material-icons-round" style="font-size:40px;">send</span>
                </div>
                <h1 class="header-lg" style="margin-bottom:12px;">Connect Telegram</h1>
                <p class="text-sm" style="margin-bottom:16px; line-height:1.6; padding: 0 10px; color:var(--text-secondary);">
                    Open the bot, send <b>START</b> (with your link code if asked). The bot will ask you to use <b>Share Contact</b> — that control appears <b>inside Telegram</b> as a button above the chat keyboard, <b>not</b> on this web page.
                </p>
                <div style="margin-bottom:24px; padding:12px 14px; border-radius:12px; background:#FFFBEB; border:1px solid #FDE68A; text-align:left;">
                    <p class="text-xs" style="margin:0; line-height:1.55; color:#92400E;">
                        <b>Tip:</b> Telegram Web and some desktop clients often <b>do not show</b> the Share Contact button. If you only see the bot message and no button, use <b>Open in Telegram app</b> on your phone.
                    </p>
                </div>
                
                <a href="tg://resolve?domain=gc_workspace_bot&start=cgc_${this.pendingUser?.AD_User_ID}" class="btn-telegram-link" style="display:flex; align-items:center; justify-content:center; gap:12px; width:100%; padding:20px; background:#059669; color:white; border-radius:16px; font-weight:700; text-decoration:none; margin-bottom:12px; box-shadow: 0 8px 20px rgba(5, 150, 105, 0.25);">
                    <span class="material-icons-round">smartphone</span>
                    Open in Telegram app (recommended)
                </a>
                <a href="https://t.me/gc_workspace_bot?start=cgc_${this.pendingUser?.AD_User_ID}" target="_blank" rel="noopener" class="btn-telegram-link" style="display:flex; align-items:center; justify-content:center; gap:12px; width:100%; padding:16px; background:#0088CC; color:white; border-radius:16px; font-weight:700; text-decoration:none; margin-bottom:24px; box-shadow: 0 8px 20px rgba(0, 136, 204, 0.3);">
                    <span class="material-icons-round">open_in_new</span>
                    Open Telegram Web / desktop
                </a>

                <div style="margin-bottom:16px; background:#F8FAFC; border:1px solid var(--border-light); border-radius:12px; padding:12px;">
                    <div style="font-size:12px; color:var(--text-secondary); margin-bottom:8px;">If needed, send this code to the bot:</div>
                    <div id="telegram-link-code" style="font-weight:800; color:#2f2a79; letter-spacing:0.4px; margin-bottom:10px;">${linkCode}</div>
                    <button id="copy-link-code-btn" style="padding:8px 12px; border:none; border-radius:10px; background:#ECEBFF; color:#3f3a86; font-weight:700; cursor:pointer;">Copy Code</button>
                </div>

                <div id="polling-status" style="margin-bottom:32px; font-size:13px; color:var(--text-secondary); font-weight:600; background:#0088CC10; padding:14px; border-radius:12px; text-align:left;">
                    <div style="display:flex; align-items:center; gap:12px; margin-bottom:0;">
                        <div class="status-dot-pulse" style="background:#0088CC; flex-shrink:0;"></div>
                        <span id="polling-status-text" style="color:#0369A1;">Waiting for your /start message in the bot…</span>
                    </div>
                </div>

                <div style="border-top: 1px solid var(--border-light); padding-top:24px;">
                    <button onclick="window.app.router.currentView.step='mobile';window.app.router.currentView.updateUI()" style="width:100%; padding:12px; background:transparent; border:none; color:var(--text-tertiary); font-size:14px; font-weight:600;">
                        Use different number
                    </button>
                </div>
            </div>
        `;
    }

    renderOtpStep() {
        return `
            <div class="animate-enter">
                <h1 class="header-lg" style="margin-bottom:8px;">Verification</h1>
                <p class="text-sm" style="margin-bottom:32px;">We've sent a 4-digit code to your <b>Telegram</b> account.</p>
                
                <div style="display:flex; gap:16px; justify-content:center; margin-bottom:40px;">
                    ${[0, 1, 2, 3].map(i => `
                        <input class="otp-digit" type="number" data-index="${i}" oninput="if(this.value.length > 1) this.value = this.value.slice(0, 1);" style="width:55px; height:55px; border:2px solid var(--border-light); border-radius:18px; text-align:center; font-size:24px; font-weight:900; color:var(--primary-color); outline:none; background:#F9FAFB;">
                    `).join('')}
                </div>

                <button id="action-btn" style="width:100%; padding:20px; background:linear-gradient(135deg, #4f4a99 0%, #3f3a86 58%, #eb4f67 100%); color:white; border:none; border-radius:16px; font-size:16px; font-weight:700; cursor:pointer; box-shadow:0 10px 20px rgba(63, 58, 134, 0.28);">
                    Verify & Sign In
                </button>
                
                <button onclick="window.app.router.currentView.step='mobile';window.app.router.currentView.updateUI()" style="width:100%; margin-top:24px; padding:12px; background:transparent; border:none; color:var(--text-tertiary); font-size:13px; font-weight:600;">
                    Back to Mobile
                </button>
            </div>
        `;
    }

    setupOtpListeners() {
        const inputs = this.container.querySelectorAll('.otp-digit');
        inputs.forEach((input, index) => {
            input.addEventListener('input', (e) => {
                if (e.target.value.length === 1 && index < inputs.length - 1) {
                    inputs[index + 1].focus();
                }
            });

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Backspace' && e.target.value === '' && index > 0) {
                    inputs[index - 1].focus();
                }
            });
        });
    }

    _renderTelegramPollingConnected() {
        const box = this.container?.querySelector('#polling-status');
        if (!box || box.dataset.connected === '1') return;
        box.dataset.connected = '1';
        const uid = this.pendingUser?.AD_User_ID || '';
        box.innerHTML = `
            <p style="margin:0 0 8px;font-weight:700;color:#0369A1;font-size:14px;">Connected — next step is in Telegram</p>
            <p style="margin:0 0 14px;line-height:1.55;color:var(--text-secondary);font-size:13px;font-weight:500;">
                The bot sent you a message. <b>Share Contact</b> is a <b>Telegram button</b> above the chat keyboard (not a link on this page). If you do not see it, open the bot in the <b>Telegram app</b> using the green button above.
            </p>
            <div style="display:flex;flex-direction:column;gap:10px;">
                <a href="tg://resolve?domain=gc_workspace_bot&start=cgc_${uid}" class="btn-telegram-link" style="display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:14px;background:#059669;color:white;border-radius:12px;font-weight:700;text-decoration:none;font-size:14px;">
                    <span class="material-icons-round" style="font-size:20px;">smartphone</span>
                    Open Telegram app
                </a>
                <a href="https://t.me/gc_workspace_bot?start=cgc_${uid}" target="_blank" rel="noopener" style="text-align:center;font-size:13px;font-weight:600;color:#0088CC;">Open bot in browser</a>
            </div>
        `;
    }

    async startTelegramPolling() {
        if (this.tgPollInterval) clearInterval(this.tgPollInterval);

        console.log("[Login] Starting auto-polling for Telegram connection...");
        const { TelegramService } = await import('../services/telegram.js');
        const { AuthService } = await import('../services/api.js');
        const expectedPhones = [
            this.mobileNumber,
            this.pendingUser?.Phone,
            this.pendingUser?.Phone2
        ].filter(Boolean);

        let attempts = 0;
        let connection = null;
        let contactPromptSent = false;
        this.tgPollInterval = setInterval(async () => {
            attempts++;
            if (attempts > 100 || this.step !== 'telegram') {
                clearInterval(this.tgPollInterval);
                return;
            }

            if (!connection) {
                connection = await TelegramService.pollForConnection(this.pendingUser.AD_User_ID);
                if (connection) {
                    console.log("[Login] Connection detected!", connection);
                    this._renderTelegramPollingConnected();
                }
            }

            if (connection && !contactPromptSent) {
                await TelegramService.requestContactShare(connection.chatId);
                contactPromptSent = true;
            }

            if (connection) {
                const verified = await TelegramService.pollForVerifiedContact(connection.chatId, expectedPhones);
                if (verified.ok) {
                    console.log("[Login] Contact verified. Linking user...");
                    clearInterval(this.tgPollInterval);
                    const linked = await TelegramService.linkUser(connection.chatId, this.pendingUser);
                    if (linked) {
                        const sessionUser = sessionStorage.getItem('pending_user');
                        if (sessionUser) this.pendingUser = JSON.parse(sessionUser);

                        const otpRes = await AuthService.sendLoginOtp();
                        if (otpRes.success) {
                            this.step = 'otp';
                            this.updateUI();
                            appToast("Telegram verified. Code sent.", 'success');
                        } else {
                            appAlert("OTP Delivery Failed", otpRes.message || "Could not send OTP.", 'error');
                        }
                    } else {
                        appAlert("Link Failed", TelegramService.getLastError() || "Could not save Telegram link to ERP.", 'error');
                    }
                }
            }
        }, 3000);
    }

    async handleAction() {
        const btn = this.container.querySelector('#action-btn');
        const { AuthService } = await import('../services/api.js');

        if (this.step === 'mobile') {
            const input = this.container.querySelector('#mobile-input').value;
            if (input.length < 5) {
                appToast("Please enter a valid mobile number", 'warning');
                return;
            }

            btn.innerText = "Analyzing ERP...";
            btn.disabled = true;

            let raw = input.replace(/\D/g, '');
            if (raw.startsWith('0')) raw = raw.substring(1);
            let formatted = `+966-${raw.substring(0, 2)}-${raw.substring(2, 5)}-${raw.substring(5)}`;
            if (raw.length !== 9) formatted = "+966-" + raw;

            this.mobileNumber = formatted;
            const response = await AuthService.identifyUser(formatted);

            if (response.success) {
                this.pendingUser = response.user;

                // Primary flow: backend sends OTP to user's Telegram,
                // then app navigates directly to OTP screen.
                btn.innerText = "Sending Code...";
                const otpRes = await AuthService.sendLoginOtp();
                if (otpRes.success) {
                    this.step = 'otp';
                } else {
                    const msg = String(otpRes.message || '');
                    const needsLink = msg.toLowerCase().includes('telegram link') || msg.toLowerCase().includes('connect telegram');
                    if (needsLink) {
                        this.step = 'telegram';
                        this.updateUI();
                        appToast("Please connect Telegram once to receive OTP.", 'warning');
                        return;
                    }
                    appAlert("OTP Delivery Failed", msg || "Could not send OTP to your Telegram account.", 'error');
                    btn.innerText = "Identify Account";
                    btn.disabled = false;
                    return;
                }
                this.updateUI();
            } else {
                appAlert("Account Restricted", response.message, 'warning');
                btn.innerText = "Identify Account";
                btn.disabled = false;
            }

        } else if (this.step === 'otp') {
            const otpInputs = this.container.querySelectorAll('.otp-digit');
            let otp = '';
            otpInputs.forEach(i => otp += i.value);

            if (otp.length !== 4) {
                appToast("Please enter 4 digits", 'warning');
                return;
            }

            btn.innerHTML = '<div class="loader-spinner" style="width:20px; height:20px; border-color:white; border-top-color:transparent;"></div>';
            btn.disabled = true;

            const response = await AuthService.verifyOtp(otp);

            if (response.success) {
                this.container.innerHTML = `
                        <div class="animate-enter" style="text-align:center; margin-top:20px;">
                        <div class="loader-spinner" style="margin:0 auto 24px; width:48px; height:48px;"></div>
                        <h2 class="header-md">Session Verified</h2>
                        <p class="text-sm">Welcome back, ${response.user.Name}</p>
                        </div>
                `;

                setTimeout(() => {
                    window.app.router.navigate('home');
                }, 1200);
            } else {
                appToast(response.message, 'error');
                btn.innerText = "Verify & Sign In";
                btn.disabled = false;
            }
        }
    }
}
