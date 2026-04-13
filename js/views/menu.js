import { AuthService, _executeRequest, ERP_CONFIG } from '../services/api.js';
import { TelegramService } from '../services/telegram.js';
import { UIService } from '../services/ui.js';

function extractChatId(user) {
    if (!user) return null;
    const fields = [user.Fax, user.Description].filter(Boolean);
    for (const field of fields) {
        const match = String(field).match(/tg_chat_id:\s*(\d+)/i);
        if (match && match[1]) return match[1];
    }
    return null;
}

export default class MenuView {
    async render() {
        // Refresh latest profile from ERP to get updated Description/ChatID
        let user = AuthService.getUser();
        if (user) {
            const latest = await AuthService.queryErpUser('AD_User_ID', user.AD_User_ID);
            if (latest) {
                // Merge latest data but keep roles and ReferenceNo from session
                const roles = user.roles;
                const refNo = user.ReferenceNo;
                user = { ...latest, roles, ReferenceNo: refNo };

                // Ensure ReferenceNo is present for PM/Admin if missing
                if (!user.ReferenceNo && user.C_BPartner_ID && user.roles.some(r => ['1000038', '1000036', '1000017', '0'].includes(String(r)))) {
                    // Direct query for BP if missing
                    const bpInfo = await _executeRequest({
                        "login_user": ERP_CONFIG.auth,
                        "tablename": "C_BPartner",
                        "type": "query_data",
                        "columns_where": [{ "name": "C_BPartner_ID", "opertor": "=", "value": user.C_BPartner_ID }],
                        "columns_output": ["ReferenceNo"]
                    });
                    if (Array.isArray(bpInfo) && bpInfo.length > 0) {
                        user.ReferenceNo = bpInfo[0].ReferenceNo;
                    }
                }

                localStorage.setItem('artelco_user', JSON.stringify(user));
            }
        }

        const container = document.createElement('div');
        container.className = 'menu-view fade-in';

        container.innerHTML = `
            <div class="view-header" style="padding: 24px 20px;">
                <h1 class="header-lg">Settings & Profile</h1>
                <p class="text-secondary">Manage your account and notifications</p>
            </div>

            <div class="menu-content" style="padding: 0 20px;">
                <!-- Profile Card -->
                <div class="profile-card" style="background: white; border-radius: 20px; padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.05); margin-bottom: 24px; display: flex; align-items: center; gap: 20px;">
                    <div class="profile-avatar" style="width: 70px; height: 70px; background: var(--primary-color); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white;">
                        <span class="material-icons-round" style="font-size: 32px;">person</span>
                    </div>
                    <div class="profile-info">
                        <h2 style="margin: 0; font-size: 20px; font-weight: 700;">${user?.Name || 'User'}</h2>
                        <p style="margin: 4px 0 0; color: var(--text-tertiary); font-size: 14px;">${user?.EMail || 'No email set'}</p>
                    </div>
                </div>

                <!-- Telegram Connection Section -->
                <div class="settings-group" style="margin-bottom: 32px;">
                    <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 16px; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                        <span class="material-icons-round" style="color: #0088cc;">send</span>
                        Telegram Notifications
                    </h3>
                    
                    <div id="telegram-status-card" class="settings-card" style="background: white; border-radius: 20px; padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.05); border: 1px solid var(--border-color);">
                        <div id="tg-initial-state">
                            <p style="margin: 0 0 16px; font-size: 14px; color: var(--text-secondary); line-height: 1.6;">
                                Connect your Telegram account to receive instant notifications when tickets are assigned to you.
                            </p>
                            <button id="btn-connect-telegram" class="btn-primary" style="width: 100%; height: 54px; display: flex; align-items: center; justify-content: center; gap: 12px; background: #0088cc;">
                                <span class="material-icons-round">link</span>
                                Connect Telegram
                            </button>
                        </div>

                        <div id="tg-waiting-state" style="display: none; text-align: center;">
                            <div class="tg-loader" style="width: 40px; height: 40px; border: 3px solid #0088cc20; border-top-color: #0088cc; border-radius: 50%; margin: 0 auto 16px; animation: spin 1s linear infinite;"></div>
                            <h4 style="margin: 0 0 8px; font-size: 16px;">Waiting for Telegram...</h4>
                            <p style="margin: 0 0 20px; font-size: 13px; color: var(--text-secondary);">
                                We've opened Telegram. Please tap <b>"START"</b> in the bot chat to complete the link.
                            </p>
                            <button id="btn-retry-tg" style="background: none; border: none; color: #0088cc; font-weight: 600; font-size: 14px; cursor: pointer;">
                                Manual Retry
                            </button>
                        </div>

                        <div id="tg-success-state" style="display: none; text-align: center;">
                            <div style="width: 48px; height: 48px; background: #22c55e15; color: #22c55e; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
                                <span class="material-icons-round" style="font-size: 28px;">check_circle</span>
                            </div>
                            <h4 style="margin: 0 0 4px; font-size: 16px;">Telegram Connected!</h4>
                            <p id="tg-username" style="margin: 0; font-size: 13px; color: var(--text-secondary);">Your notifications are active.</p>
                            <button id="btn-disconnect-tg" style="margin-top: 16px; background: none; border: none; color: var(--danger); font-size: 12px; font-weight: 500; cursor: pointer;">Disconnect Account</button>
                        </div>
                    </div>
                </div>

                <!-- Team Section (For PMs and Admins) -->
                ${(user.roles.some(r => ['1000038', '1000036', '1000017', '0'].includes(String(r)))) ? `
                <div class="settings-group" style="margin-bottom: 32px;">
                    <h3 style="font-size: 16px; font-weight: 700; margin-bottom: 16px; color: var(--text-primary); display: flex; align-items: center; gap: 8px;">
                        <span class="material-icons-round" style="color: var(--primary-color);">group</span>
                        ${user.roles.some(r => ['1000036', '1000017', '0'].includes(String(r))) ? 'All Workforce Teams' : `Team Members (Group ${user.ReferenceNo})`}
                    </h3>
                    <div id="team-list" class="settings-card" style="background: white; border-radius: 20px; padding: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.05); border: 1px solid var(--border-color);">
                        <div style="text-align:center; padding:20px;"><div class="loader-spinner" style="margin:0 auto; width:24px; height:24px;"></div></div>
                    </div>
                </div>
                ` : ''}

                <!-- App Info -->
                <div style="text-align: center; padding: 40px 0;">
                    <p style="margin: 0; font-size: 12px; color: var(--text-tertiary);">ARTELCO Workforce v1.0.8</p>
                    <p style="margin: 4px 0 0; font-size: 10px; color: var(--text-tertiary); opacity: 0.5;">Secure ERP Integration Active</p>
                </div>
            </div>

            <style>
                @keyframes spin { to { transform: rotate(360deg); } }
                .menu-content .settings-card { transition: all 0.3s ease; }
            </style>
        `;

        return container;
    }

    afterRender() {
        const user = AuthService.getUser();
        if (!user) return;

        const btnConnect = document.getElementById('btn-connect-telegram');
        const initState = document.getElementById('tg-initial-state');
        const waitingState = document.getElementById('tg-waiting-state');
        const successState = document.getElementById('tg-success-state');
        const usernameEl = document.getElementById('tg-username');

        // Check if already linked via ERP (Prefer Fax, fallback to Description)
        const linkedId = extractChatId(user);

        if (linkedId) {
            initState.style.display = 'none';
            successState.style.display = 'block';
            usernameEl.innerText = `Connected via ERP (ID: ${linkedId})`;
        }

        let pollInterval = null;

        btnConnect.onclick = () => {
            const link = TelegramService.getConnectionLink(user.AD_User_ID);
            window.open(link, '_blank');

            initState.style.display = 'none';
            waitingState.style.display = 'block';

            // Start polling
            let attempts = 0;
            let connection = null;
            let contactPromptSent = false;
            const expectedPhones = [user.Phone, user.Phone2].filter(Boolean);
            pollInterval = setInterval(async () => {
                attempts++;
                if (attempts > 60) { // Timeout after 2 minutes
                    clearInterval(pollInterval);
                    UIService.showToast("Connection timeout. Please try again.", "error");
                    initState.style.display = 'block';
                    waitingState.style.display = 'none';
                    return;
                }

                if (!connection) {
                    const result = await TelegramService.pollForConnection(user.AD_User_ID);
                    if (result) {
                        connection = result;
                        UIService.showToast("Telegram detected. Please tap Share Contact in bot.", "warning");
                    }
                }

                if (connection && !contactPromptSent) {
                    await TelegramService.requestContactShare(connection.chatId);
                    contactPromptSent = true;
                }

                if (connection) {
                    const verified = await TelegramService.pollForVerifiedContact(connection.chatId, expectedPhones);
                    if (verified.ok) {
                        clearInterval(pollInterval);
                        const linked = await TelegramService.linkUser(connection.chatId);
                        if (!linked) {
                            UIService.showToast(TelegramService.getLastError() || "Telegram link failed", "error");
                            initState.style.display = 'block';
                            waitingState.style.display = 'none';
                            return;
                        }

                        waitingState.style.display = 'none';
                        successState.style.display = 'block';
                        usernameEl.innerText = `Connected as @${connection.username || 'telegram-user'}`;
                        UIService.showToast("Telegram Linked Successfully!", "success");
                    }
                }
            }, 2000);
        };

        // Populate Team Members if section exists
        const teamList = document.getElementById('team-list');
        const isAdmin = user.roles.some(r => ['1000036', '1000017', '0'].includes(String(r)));

        if (teamList) {
            if (isAdmin) {
                // Admin sees everyone grouped
                AuthService.getAllTeams().then(groups => {
                    let html = '';
                    const sortedGroups = Object.keys(groups).sort();
                    
                    if (sortedGroups.length === 0) {
                        teamList.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-tertiary);">No teams found.</div>';
                        return;
                    }

                    sortedGroups.forEach(g => {
                        html += `<div style="padding:8px 12px; background:var(--bg-secondary); font-size:12px; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.5px; border-radius:8px; margin: 8px 0;">Group ${g}</div>`;
                        html += groups[g].map(m => `
                            <div style="display:flex; align-items:center; gap:12px; padding:10px 12px; border-bottom:1px solid var(--border-light);">
                                <div style="width:32px; height:32px; border-radius:16px; background:#F1F5F9; display:flex; align-items:center; justify-content:center; color:var(--primary-color); font-weight:800; font-size:12px;">${m.name.charAt(0)}</div>
                                <div style="flex:1;">
                                    <div style="font-weight:700; font-size:13px;">${m.name}</div>
                                    <div style="font-size:10px; color:var(--text-tertiary);">ID: ${m.id}</div>
                                </div>
                            </div>
                        `).join('');
                    });
                    teamList.innerHTML = html;
                });
            } else if (user.ReferenceNo) {
                // PM sees their group
                AuthService.getTeamMembers(user.ReferenceNo).then(members => {
                    const others = members.filter(m => String(m.id) !== String(user.AD_User_ID));
                    if (others.length === 0) {
                        teamList.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-tertiary); font-size:14px;">No other members in this group.</div>';
                        return;
                    }
                    teamList.innerHTML = others.map(m => `
                        <div style="display:flex; align-items:center; gap:12px; padding:12px; border-bottom:1px solid var(--border-light);">
                            <div style="width:36px; height:36px; border-radius:18px; background:#F1F5F9; display:flex; align-items:center; justify-content:center; color:var(--primary-color); font-weight:800; font-size:14px;">${m.name.charAt(0)}</div>
                            <div style="flex:1;">
                                <div style="font-weight:700; font-size:14px;">${m.name}</div>
                                <div style="font-size:11px; color:var(--text-tertiary);">ID: ${m.id}</div>
                            </div>
                        </div>
                    `).join('');
                });
            }
        }

        const btnRetry = document.getElementById('btn-retry-tg');
        if (btnRetry) btnRetry.onclick = () => {
            if (pollInterval) clearInterval(pollInterval);
            btnConnect.click();
        };

        const btnDisconnect = document.getElementById('btn-disconnect-tg');
        if (btnDisconnect) btnDisconnect.onclick = async () => {
            if (await UIService.confirm("Disconnect Telegram", "Stop receiving notifications on Telegram?")) {
                const rawDesc = user.Description || "";
                const updatedDesc = rawDesc.replace(/tg_chat_id:\s*\d+/gi, "").trim();
                
                // Also clear Fax specifically
                const updates = { 
                    fax: " ",
                    description: updatedDesc || " " 
                };

                console.log("[Telegram] Disconnecting. Clearing Fax and cleaning Description.");

                const res = await AuthService.updateProfile(updates, user.AD_User_ID);

                if (res && res.success) {
                    UIService.showToast("Telegram Disconnected", "success");
                    user.Fax = " ";
                    user.Description = updatedDesc;
                    localStorage.setItem('artelco_user', JSON.stringify(user));
                    setTimeout(() => window.location.reload(), 1000);
                } else {
                    console.error("[Telegram] Disconnect failed in ERP", res);
                    UIService.showToast("Failed to disconnect from ERP", "error");
                }
            }
        };
    }
}
