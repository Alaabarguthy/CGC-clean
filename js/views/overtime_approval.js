import { TicketService, AuthService } from '../services/api.js';
import { UIService } from '../services/ui.js';
import { MenaitechService } from '../services/menaitech.js';

export default class OvertimeApprovalView {
    async render() {
        const user = AuthService.getUser();
        const container = document.createElement('div');
        container.className = 'view-overtime animate-fade-in';
        this.container = container;

        container.innerHTML = `
            <div style="padding: 24px; background: white; border-bottom: 1px solid #F1F5F9; position: sticky; top: 0; z-index: 10;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <h1 class="header-lg" style="margin:0;">Overtime Approval</h1>
                    <button id="btn-back-home" style="background:#F3F4F6; border:none; border-radius:50%; width:36px; height:36px; cursor:pointer;">
                        <span class="material-icons-round">close</span>
                    </button>
                </div>
                <p style="color:var(--text-tertiary); margin:4px 0 0; font-size:14px;">Review and sync overtime to Menaitech</p>
            </div>

            <div id="overtime-list" style="padding: 20px;">
                <div style="text-align:center; padding:40px;"><div class="loader-spinner" style="margin:0 auto;"></div></div>
            </div>
        `;

        this.loadRequests();
        return container;
    }

    async loadRequests() {
        const listEl = this.container.querySelector('#overtime-list');
        const approver = AuthService.getUser();
        
        try {
            const updates = await TicketService.getPendingOvertimeUpdates();

            if (updates.length === 0) {
                listEl.innerHTML = `
                    <div style="text-align:center; padding:60px 20px; color:var(--text-tertiary);">
                        <span class="material-icons-round" style="font-size:48px; opacity:0.2; margin-bottom:16px;">verified</span>
                        <div style="font-weight:600;">All overtime requests are processed!</div>
                    </div>
                `;
                return;
            }

            listEl.innerHTML = '';
            
            for (const upd of updates) {
                // Fetch Ticket and Technician info for context
                const ticket = await TicketService.getTicketById(upd.R_Request_ID);
                
                // Get Customer Name
                const { CustomerService } = await import('../services/api.js');
                const customerName = ticket?.C_BPartner_ID ? await CustomerService.getPartnerName(ticket.C_BPartner_ID) : "Unknown Customer";
                
                // CRITICAL FIX: Overtime goes to the Assigned Tech (SalesRep_ID), NOT the person who created the update (CreatedBy)
                const techUserId = ticket?.SalesRep_ID || upd.CreatedBy;
                const tech = await AuthService.queryErpUser('AD_User_ID', techUserId);
                const employeeCode = tech?.Title || "UNKNOWN";
                
                const card = document.createElement('div');
                card.className = 'card animate-enter';
                card.style = "margin-bottom:16px; padding:20px; border-left:4px solid var(--primary-color); position:relative;";
                
                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; margin-bottom:12px; align-items:start;">
                        <div>
                            <div style="font-weight:800; color:var(--primary-color); font-size:14px;">${ticket?.DocumentNo || 'Ticket #' + upd.R_Request_ID}</div>
                            <div style="font-weight:700; color:var(--text-primary); margin-top:2px; font-size:15px;">${customerName}</div>
                            <div style="font-size:11px; color:var(--text-tertiary); margin-top:2px;">Dated: ${new Date(upd.Created).toLocaleDateString()}</div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:18px; font-weight:900; color:#6366F1;">${upd.HoursOvertime} hrs</div>
                            <div style="font-size:10px; color:var(--text-tertiary); font-weight:700;">OVERTIME</div>
                        </div>
                    </div>

                    <div style="background:#F8FAFC; border-radius:12px; padding:12px; margin-bottom:16px;">
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                            <div style="width:28px; height:28px; border-radius:14px; background:white; border:1px solid #E2E8F0; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:800; color:var(--primary-color);">
                                ${tech?.Name?.charAt(0) || 'U'}
                            </div>
                            <span style="font-size:13px; font-weight:700; color:var(--text-primary);">${tech?.Name || 'Unknown Technician'}</span>
                            <span style="font-size:10px; background:#E2E8F0; padding:2px 6px; border-radius:4px; color:var(--text-secondary); font-weight:700; margin-left:auto;">${employeeCode}</span>
                        </div>
                        <div style="font-size:12px; color:var(--text-primary); font-weight:600; margin-top:8px; border-top:1px dashed #E2E8F0; padding-top:8px;">
                            ${upd.Result || 'No result provided.'}
                        </div>
                    </div>

                    <div style="display:flex; gap:12px;">
                        <button class="btn-approve" style="flex:1; padding:14px; background:#10B981; color:white; border:none; border-radius:12px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow:0 4px 10px rgba(16, 185, 129, 0.2);">
                            <span class="material-icons-round" style="font-size:18px;">check_circle</span>
                            Approve
                        </button>
                        <button class="btn-reject" style="flex:1; padding:14px; background:#EF4444; color:white; border:none; border-radius:12px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow:0 4px 10px rgba(239, 68, 68, 0.2);">
                            <span class="material-icons-round" style="font-size:18px;">cancel</span>
                            Reject
                        </button>
                    </div>
                `;
                
                listEl.appendChild(card);

                // Events
                card.querySelector('.btn-approve').onclick = () => this.handleApprove(upd, ticket, tech, employeeCode, approver.Name);
                card.querySelector('.btn-reject').onclick = () => this.handleReject(upd, ticket, tech, approver.Name);
            }

        } catch (e) {
            console.error(e);
            listEl.innerHTML = '<div style="padding:40px; text-align:center; color:var(--danger);">Failed to load overtime data.</div>';
        }
    }

    async handleApprove(upd, ticket, tech, employeeCode, approverName) {
        if (employeeCode === "UNKNOWN") {
            UIService.showToast("Cannot approve: Missing Employee Code in ERP", "error");
            return;
        }

        const summary = upd.Result || "No summary";
        const confirmed = await UIService.confirm("Approve Overtime", 
            `Sync <b>${upd.HoursOvertime} hrs</b> to Menaitech for <b>${tech.Name}</b>?\n\n` +
            `<div style="font-size:12px; color:#000; margin-top:8px; font-weight:600; font-style:italic;">"${summary.substring(0, 100)}..."</div>`,
            'success');
        if (!confirmed) return;

        const loader = UIService.showLoading("Syncing with HR system...");
        
        try {
            const payload = {
                date: upd.Created ? upd.Created.split(' ')[0].split('-').reverse().join('/') : new Date().toLocaleDateString('en-GB'),
                employeeCode: employeeCode,
                description: `APPROVED via App: ${ticket?.DocumentNo} - ${upd.Result?.substring(0, 30)}`,
                hours: upd.HoursOvertime
            };

            const valid = await MenaitechService.validateOvertime(payload);
            if (valid.message !== "Success") {
                loader.remove();
                UIService.showAlert("Menaitech Rejected Data", valid.subMessage || "Validation failed.", "warning");
                return;
            }

            const save = await MenaitechService.saveOvertime(payload);
            if (save.message === "Success") {
                // Mark processed in ERP
                await TicketService.markOvertimeProcessed(upd.R_RequestUpdate_ID, upd.HoursOvertime);
                
                // Notify Technician
                const { TelegramService } = await import('../services/telegram.js');
                const message = `✅ <b>Overtime Approved</b>\n\n` +
                                `Ticket: ${ticket?.DocumentNo || 'N/A'}\n` +
                                `Hours: ${upd.HoursOvertime}\n` +
                                `Approver: ${approverName}\n\n` +
                                `The hours have been synced to Menaitech.`;
                
                // Get Tech's Chat ID from profile
                let chatId = null;
                if (tech.Fax && tech.Fax.includes('tg_chat_id:')) chatId = tech.Fax.split('tg_chat_id:')[1].split(' ')[0].trim();
                else if (tech.Description && tech.Description.includes('tg_chat_id:')) chatId = tech.Description.split('tg_chat_id:')[1].split(' ')[0].trim();

                if (chatId) await TelegramService.sendMessage(chatId, message);

                loader.remove();
                UIService.showToast("Overtime Synced & Approved!", "success");
                this.loadRequests();
            } else {
                loader.remove();
                UIService.showAlert("Sync Error", save.subMessage || "Could not save to Menaitech.", "error");
            }
        } catch (e) {
            loader.remove();
            UIService.showToast("Menaitech Connection Error", "error");
            console.error(e);
        }
    }

    async handleReject(upd, ticket, tech, approverName) {
        const summary = upd.Result || "No summary";
        const confirmed = await UIService.confirm("Reject Overtime", 
            `Are you sure you want to reject this request for <b>${tech.Name}</b>?\n\n` +
            `<div style="font-size:12px; color:#000; margin-top:8px; font-weight:600; font-style:italic;">"${summary.substring(0, 100)}..."</div>`,
            'danger');
        if (!confirmed) return;

        try {
            // Mark processed in ERP (hide it)
            await TicketService.markOvertimeProcessed(upd.R_RequestUpdate_ID, upd.HoursOvertime);
            
            // Notify Technician
            const { TelegramService } = await import('../services/telegram.js');
            const message = `❌ <b>Overtime Rejected</b>\n\n` +
                            `Ticket: ${ticket?.DocumentNo || 'N/A'}\n` +
                            `Hours: ${upd.HoursOvertime}\n` +
                            `Status: Rejected by ${approverName}`;
            
            let chatId = null;
            if (tech.Fax && tech.Fax.includes('tg_chat_id:')) chatId = tech.Fax.split('tg_chat_id:')[1].split(' ')[0].trim();
            else if (tech.Description && tech.Description.includes('tg_chat_id:')) chatId = tech.Description.split('tg_chat_id:')[1].split(' ')[0].trim();

            if (chatId) await TelegramService.sendMessage(chatId, message);

            UIService.showToast("Request Rejected", "info");
            this.loadRequests();
        } catch (e) {
            console.error(e);
            UIService.showToast("Failed to process rejection", "error");
        }
    }

    afterRender() {
        const backBtn = this.container.querySelector('#btn-back-home');
        if (backBtn) backBtn.onclick = () => window.app.router.navigate('home');
    }
}
