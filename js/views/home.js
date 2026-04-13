
import { TicketService, AuthService, CustomerService, STATUS_MAP, ROLES } from '../services/api.js';

export default class HomeView {
    async render() {
        const user = AuthService.getUser();
        if (!user) {
            window.app.router.navigate('login');
            return document.createElement('div');
        }

        const container = document.createElement('div');
        container.className = 'view-home animate-fade-in';
        this.container = container;

        container.innerHTML = `
            <div style="padding: 24px;">
                <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:12px; margin-bottom:32px; max-width: 360px; margin-left: auto; margin-right: auto;">
                    ${this.renderActionCard('add_task', 'New Request', 'var(--primary-color)', 'btn-new-ticket')}
                    ${this.renderActionCard('edit_note', 'Update Request', '#0284C7', 'btn-update-ticket')}
                    ${this.renderActionCard('check_circle', 'Close Request', '#059669', 'btn-close-ticket')}
                    ${(user.roles.some(r => [...ROLES.ADMIN, ...ROLES.PROJECT_MANAGER].includes(String(r)))) ?
                this.renderActionCard('timer', 'Overtime Approval', '#6366F1', 'btn-overtime-approval') : ''}
                </div>
            </div>
        `;

        this.applyEvents();
        return container;
    }

    renderActionCard(icon, label, color, id) {
        return `
            <div id="${id}" class="card animate-enter" style="background:white; border:1px solid var(--border-light); padding:16px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; cursor:pointer; aspect-ratio: 1 / 1; transition:transform 0.1s; box-shadow: var(--shadow-sm);">
                <span class="material-icons-round" style="color:${color}; font-size:32px; margin-bottom:10px;">${icon}</span>
                <div style="font-size:12px; font-weight:700; color:var(--text-primary); line-height:1.2; padding: 0 4px;">${label}</div>
            </div>
        `;
    }

    applyEvents() {
        const newBtn = this.container.querySelector('#btn-new-ticket');
        if (newBtn) newBtn.onclick = () => this.showNewTicketForm();

        const updateBtn = this.container.querySelector('#btn-update-ticket');
        if (updateBtn) updateBtn.onclick = () => this.showTicketSelection('update');

        const closeBtn = this.container.querySelector('#btn-close-ticket');
        if (closeBtn) closeBtn.onclick = () => this.showTicketSelection('close');

        const overtimeBtn = this.container.querySelector('#btn-overtime-approval');
        if (overtimeBtn) overtimeBtn.onclick = () => window.app.router.navigate('overtime-approval');

    }

    async loadStats(container, userId) {
        const stats = await TicketService.getDashboardStats(userId);
        const statsEl = container.querySelector('#stats-container');
        if (!statsEl) return;

        statsEl.innerHTML = `
            <div class="card animate-enter" style="min-width:145px; background: #F9FAFB; border:1px solid var(--border-light); padding:16px;">
                <span class="material-icons-round" style="color:var(--text-secondary); font-size:28px; margin-bottom:12px;">inventory_2</span>
                <div class="header-lg" style="color:var(--text-primary); margin-bottom:4px; font-size:24px;">${stats.total_count}</div>
                <div class="text-sm" style="color:var(--text-secondary); font-weight:600;">Total Requests</div>
            </div>

            <div class="card animate-enter delay-1" style="min-width:145px; background: #FEF2F2; border:1px solid #FECACA; padding:16px;">
                <span class="material-icons-round" style="color:#DC2626; font-size:28px; margin-bottom:12px;">confirmation_number</span>
                <div class="header-lg" style="color:#DC2626; margin-bottom:4px; font-size:24px;">${stats.open_count}</div>
                <div class="text-sm" style="color:#991B1B; font-weight:600;">Open Requests</div>
            </div>

            <div class="card animate-enter delay-2" style="min-width:145px; background: #ECFDF5; border:1px solid #A7F3D0; padding:16px;">
                <span class="material-icons-round" style="color:var(--success); font-size:28px; margin-bottom:12px;">task_alt</span>
                <div class="header-lg" style="color:var(--success); margin-bottom:4px; font-size:24px;">${stats.resolved_count}</div>
                <div class="text-sm" style="color:#065F46; font-weight:600;">Resolved</div>
            </div>
        `;
    }

    async showTicketSelection(mode) {
        const user = AuthService.getUser();
        console.log("user:", user);
        if (!user) return;

        const modal = document.createElement('div');
        modal.className = 'details-overlay animate-enter';
        modal.style = "position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:4000; display:flex; align-items:flex-end;";

        const title = mode === 'close' ? 'Close Request' : 'Update Request';
        const color = mode === 'close' ? '#059669' : '#0284C7';

        modal.innerHTML = `
             <div class="details-sheet animate-slide-up">
                <div style="width:40px; height:4px; background:#E5E7EB; border-radius:2px; margin: 0 auto 24px; flex-shrink:0;"></div>
                
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px; flex-shrink:0;">
                    <h2 class="header-lg" style="margin:0;">${title}</h2>
                    <button class="close-modal" style="background:#F3F4F6; border:none; border-radius:50%; width:36px; height:36px; cursor:pointer;">
                        <span class="material-icons-round">close</span>
                    </button>
                </div>

                <div id="selection-list" style="flex:1; overflow-y:auto; padding-bottom:20px;">
                    <div style="text-align:center; padding:40px;"><div class="loader-spinner" style="margin:0 auto;"></div></div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        modal.querySelector('.close-modal').onclick = () => modal.remove();

        // Render Function for the selection list
        const list = modal.querySelector('#selection-list');
        const renderList = (tickets) => {
            // Filter out closed tickets
            const getStatusLabel = (t) => String(t?.R_Status_Name || STATUS_MAP[String(t.R_Status_ID)] || 'Open');
            const normalize = (s) => String(s || '').trim().toLowerCase();
            const closedLike = new Set(['closed', 'done', 'final close', 'solved', 'cancelled', 'canceled']);
            const filtered = tickets.filter(t => !closedLike.has(normalize(getStatusLabel(t))));

            if (filtered.length === 0) {
                list.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-tertiary);">No active tickets found.</div>`;
            } else {
                list.innerHTML = filtered.map(t => `
                    <div class="card ticket-item animate-enter" data-id="${t.DocumentNo}" style="margin-bottom:12px; cursor:pointer; padding:16px;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                            <span style="font-weight:700; color:var(--primary-color);">${t.DocumentNo}</span>
                            <span class="status-badge" style="font-size:10px; padding:2px 8px; border-radius:20px; background:#F3F4F6; color:var(--text-secondary);">${getStatusLabel(t)}</span>
                        </div>
                        <div style="font-weight:700; color:var(--text-primary); margin-bottom:4px;">${t.Summary || 'No subject'}</div>
                        <div style="font-size:12px; color:var(--text-tertiary); display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden;">${(t.PartnerName && String(t.PartnerName).trim().toUpperCase() !== 'N/A') ? t.PartnerName : 'Customer field is empty'}</div>
                    </div>
                `).join('');

                list.querySelectorAll('.ticket-item').forEach(el => {
                    el.onclick = async () => {
                        window.removeEventListener('tickets-updated', onUpdate);
                        const docNo = el.dataset.id;

                        if (mode === 'close') {
                            const confirmed = await appConfirm("Close Request", `Are you sure you want to close ${docNo}?`);
                            if (confirmed) {
                                modal.remove();
                                const loader = document.createElement('div');
                                loader.style = "position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(255,255,255,0.8); z-index:3000; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:16px;";
                                loader.innerHTML = '<div class="loader-spinner"></div><div style="font-weight:700; color:var(--primary-color);">Closing Request...</div>';
                                document.body.appendChild(loader);

                                try {
                                    const res = await TicketService.closeTicket(docNo);
                                    loader.remove();
                                    if (res.success) {
                                        appToast(`${docNo} closed successfully!`, 'success');
                                        this.loadStats(this.container, user.AD_User_ID);
                                    } else {
                                        appAlert("Error", res.message || "Failed to close request.", 'error');
                                    }
                                } catch (err) {
                                    console.error(err);
                                    loader.remove();
                                    appAlert("Error", "A connection error occurred.", 'error');
                                }
                            }
                        } else {
                            this.showTicketUpdateForm(docNo, mode);
                            modal.remove();
                        }
                    };
                });
            }
        };

        // Listen for background updates
        const onUpdate = (e) => renderList(e.detail);
        window.addEventListener('tickets-updated', onUpdate);

        // Initial render (ensuring sort)
        const initialTickets = await TicketService.getTickets(user.AD_User_ID, true);
        const sorted = [...initialTickets].sort((a, b) => (parseInt(b.DocumentNo.replace(/\D/g, '')) || 0) - (parseInt(a.DocumentNo.replace(/\D/g, '')) || 0));
        renderList(sorted);

        modal.querySelector('.close-modal').onclick = () => {
            window.removeEventListener('tickets-updated', onUpdate);
            modal.remove();
        };
    }

    async showTicketUpdateForm(documentNo, mode) {
        const user = AuthService.getUser();
        if (!user) return;

        const userRoles = user.roles || [];
        const isAdmin = userRoles.some(r => ROLES.ADMIN.includes(String(r)));
        const isProjManager = userRoles.some(r => ROLES.PROJECT_MANAGER.includes(String(r)));

        const loadingOverlay = document.createElement('div');
        loadingOverlay.style = "position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(255,255,255,0.8); z-index:2000; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:16px;";
        loadingOverlay.innerHTML = '<div class="loader-spinner"></div><div style="font-weight:600; color:var(--text-secondary);">Preparing Update Steps...</div>';
        document.body.appendChild(loadingOverlay);

        try {
            // 1. Initial Data Load (Background fetches are already in initAppData, but we ensure these are ready)
            const [tickets, allTypes, allStatuses, techUsers] = await Promise.all([
                TicketService.getTickets(user.AD_User_ID),
                TicketService.getRequestTypes(),
                TicketService.getStatuses(),
                AuthService.getRoleUsers(ROLES.TECHNICAL[0])
            ]);

            loadingOverlay.remove();
            const ticket = tickets.find(t => t.DocumentNo === documentNo);
            if (!ticket) { appToast("Request not found.", 'warning'); return; }

            // Fetch existing Order Document No if needed
            let currentOrderNo = 'None';
            if (ticket.C_Order_ID && ticket.C_Order_ID !== '0') {
                const orders = await TicketService.getSalesOrders(ticket.C_BPartner_ID);
                const found = orders.find(o => String(o.C_Order_ID) === String(ticket.C_Order_ID));
                if (found) currentOrderNo = found.DocumentNo;
            }

            // --- State for the Update Wizard ---
            let currentStep = 1;
            const updateState = {
                R_Request_ID: ticket.R_Request_ID,
                documentNo: ticket.DocumentNo,
                summary: ticket.Summary || '',
                result: ticket.Result || '',
                hoursSpent: parseFloat(ticket.QtySpent) || 0,
                hoursOvertime: parseFloat(ticket.HoursOvertime) || 0,
                statusId: ticket.R_Status_ID,
                requestTypeId: ticket.R_RequestType_ID,
                salesOrderId: ticket.C_Order_ID || null,
                salesOrderDoc: currentOrderNo,
                newAssigneeId: ticket.SalesRep_ID,
                confirmation: null
            };

            const modal = document.createElement('div');
            modal.className = 'details-overlay animate-enter';
            modal.style = "position:fixed; top:0; left:0; right:0; bottom:0; background:#F8FAFC; z-index:4000; display:flex; flex-direction:column;";
            document.body.appendChild(modal);

            const renderHeader = (title, subtitle) => `
                <div style="padding:24px 24px 10px; background:white; border-bottom:1px solid #F1F5F9;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <h2 class="header-lg" style="margin:0; font-size:24px;">${title}</h2>
                        <button class="close-update" style="background:#F3F4F6; border:none; border-radius:50%; width:36px; height:36px; cursor:pointer;">
                            <span class="material-icons-round">close</span>
                        </button>
                    </div>
                    <p style="color:var(--text-tertiary); margin:0; font-size:14px;">${subtitle}</p>
                </div>
            `;

            const updateUI = async () => {
                modal.innerHTML = '';
                const container = document.createElement('div');
                container.style = "flex:1; overflow-y:auto; display:flex; flex-direction:column;";
                modal.appendChild(container);

                if (currentStep === 1) {
                    // --- STEP 1: SUMMARY & RESULT ---
                    container.innerHTML = renderHeader("Update Progress", `Ticket: ${documentNo}`);
                    const content = document.createElement('div');
                    content.style = "padding:24px; flex:1;";
                    content.innerHTML = `
                        <div class="card animate-slide-up" style="padding:20px; margin-bottom:20px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                                <label style="font-weight:800; color:var(--text-secondary); font-size:12px; text-transform:uppercase;">Ticket Subject</label>
                            </div>
                            <textarea id="update-summary" readonly style="width:100%; border:none; background:transparent; font-size:16px; font-weight:600; color:var(--text-primary); resize:none; outline:none; height:80px;">${updateState.summary}</textarea>
                        </div>

                        <div class="card animate-slide-up" style="padding:20px; border-left:4px solid var(--primary-color);">
                            <label style="display:block; font-weight:800; color:var(--primary-color); font-size:12px; text-transform:uppercase; margin-bottom:12px;">Description (work done / notes)</label>
                            <textarea id="update-result" placeholder="What was the outcome? Describe work done..." style="width:100%; border:1px solid #E2E8F0; border-radius:12px; padding:12px; font-size:16px; font-weight:500; height:280px; outline:none;" required>${updateState.result}</textarea>
                        </div>
                        
                        <button id="next-step" style="margin-top:32px; width:100%; padding:18px; background:var(--primary-color); color:white; border:none; border-radius:16px; font-size:16px; font-weight:800;">Continue</button>
                    `;
                    container.appendChild(content);

                    content.querySelector('#next-step').onclick = () => {
                        const resultVal = content.querySelector('#update-result').value.trim();
                        // Optional result as requested
                        updateState.result = resultVal;
                        updateState.summary = content.querySelector('#update-summary').value;
                        currentStep = 2;
                        updateUI();
                    };
                } else if (currentStep === 2) {
                    // --- STEP 2: HOURS ---
                    container.innerHTML = renderHeader("Working Hours", "Enter hours if applicable");
                    const content = document.createElement('div');
                    content.style = "padding:24px; flex:1;";
                    content.innerHTML = `
                        <div class="card animate-slide-up" style="padding:20px; margin-bottom:20px;">
                            <label style="display:block; font-weight:800; color:var(--text-secondary); font-size:12px; text-transform:uppercase; margin-bottom:12px;">Normal Hours</label>
                            <input type="number" id="update-hours" placeholder="0" value="${updateState.hoursSpent || ''}" style="width:100%; border:1px solid #E2E8F0; border-radius:12px; padding:14px; font-size:20px; font-weight:700;">
                        </div>
                        <div class="card animate-slide-up" style="padding:20px; border-left:4px solid #F59E0B;">
                            <label style="display:block; font-weight:800; color:#B45309; font-size:12px; text-transform:uppercase; margin-bottom:12px;">Overtime Hours</label>
                            <input type="number" id="update-overtime" placeholder="0" value="${updateState.hoursOvertime || ''}" style="width:100%; border:1px solid #E2E8F0; border-radius:12px; padding:14px; font-size:20px; font-weight:700;">
                        </div>
                        <button id="next-step" style="margin-top:32px; width:100%; padding:18px; background:var(--primary-color); color:white; border:none; border-radius:16px; font-size:16px; font-weight:800;">Continue</button>
                    `;
                    container.appendChild(content);

                    content.querySelector('#next-step').onclick = () => {
                        const h = parseFloat(content.querySelector('#update-hours').value) || 0;
                        const ot = parseFloat(content.querySelector('#update-overtime').value) || 0;

                        // Hours are now optional as requested
                        updateState.hoursSpent = h;
                        updateState.hoursOvertime = ot;
                        currentStep = mode === 'close' ? 7 : 3;
                        updateUI();
                    };
                } else if (currentStep === 3) {
                    // --- STEP 3: CHOICE (EXIT OR CONTINUE) ---
                    container.innerHTML = renderHeader("Next Action", "Select how you want to proceed");
                    const list = document.createElement('div');
                    list.style = "padding:24px; flex:1;";
                    list.innerHTML = `
                        <div class="card selection-card animate-enter" id="action-save" style="margin-bottom:16px; padding:24px; cursor:pointer; display:flex; align-items:center; gap:20px; border-left:4px solid var(--primary-color);">
                            <div style="width:48px; height:48px; border-radius:12px; background:var(--primary-color)15; color:var(--primary-color); display:flex; align-items:center; justify-content:center;">
                                <span class="material-icons-round">save</span>
                            </div>
                            <div style="flex:1;">
                                <div style="font-weight:800; font-size:18px;">Save & Close</div>
                                <div style="color:var(--text-tertiary); font-size:14px;">Finish update with current details</div>
                            </div>
                        </div>
                        <div class="card selection-card animate-enter" id="action-continue" style="padding:24px; cursor:pointer; display:flex; align-items:center; gap:20px; border-left:4px solid #6366F1;">
                            <div style="width:48px; height:48px; border-radius:12px; background:#6366F115; color:#6366F1; display:flex; align-items:center; justify-content:center;">
                                <span class="material-icons-round">arrow_forward</span>
                            </div>
                            <div style="flex:1;">
                                <div style="font-weight:800; font-size:18px;">Update More Details</div>
                                <div style="color:var(--text-tertiary); font-size:14px;">Change assignee, type or sales order</div>
                            </div>
                        </div>
                    `;
                    container.appendChild(list);

                    list.querySelector('#action-save').onclick = () => { currentStep = 7; updateUI(); };
                    list.querySelector('#action-continue').onclick = () => { currentStep = 4; updateUI(); };
                } else if (currentStep === 4) {
                    // --- STEP 4: ASSIGNEE selection ---
                    container.innerHTML = renderHeader("Assigned To", "Current technician is pinned at top");
                    const list = document.createElement('div');
                    list.style = "padding:0 24px 24px; flex:1; overflow-y:auto;";
                    container.appendChild(list);

                    // Use pre-fetched techUsers
                    const users = techUsers || [];
                    // Sort to put current at top
                    const sortedUsers = [...users].sort((a, b) => (String(a.AD_User_ID) === String(updateState.newAssigneeId) ? -1 : 1));

                    list.innerHTML = sortedUsers.map(u => `
                        <div class="card selection-card animate-enter tech-item" data-id="${u.AD_User_ID}" style="margin-bottom:12px; padding:16px; cursor:pointer; display:flex; align-items:center; gap:16px; ${String(u.AD_User_ID) === String(updateState.newAssigneeId) ? 'border:2px solid var(--primary-color); background:var(--primary-color)05;' : ''}">
                            <div style="width:40px; height:40px; border-radius:20px; background:#F1F5F9; color:var(--primary-color); display:flex; align-items:center; justify-content:center; font-weight:800;">${u.Name.charAt(0)}</div>
                            <div style="flex:1;">
                                <div style="font-weight:700;">${u.Name}</div>
                                ${u.AD_User_ID === updateState.newAssigneeId ? '<div style="color:var(--primary-color); font-size:11px; font-weight:800; text-transform:uppercase;">Current Assignee</div>' : ''}
                            </div>
                        </div>
                    `).join('');

                    list.querySelectorAll('.tech-item').forEach(el => {
                        el.onclick = () => {
                            updateState.newAssigneeId = el.dataset.id;
                            currentStep = 5;
                            updateUI();
                        }
                    });
                } else if (currentStep === 5) {
                    // --- STEP 5: REQUEST TYPE ---
                    container.innerHTML = renderHeader("Request Type", "Choose primary reason for visit");
                    const list = document.createElement('div');
                    list.style = "padding:24px; flex:1;";
                    container.appendChild(list);

                    const getIcon = (name) => {
                        const n = name.toLowerCase();
                        if (n.includes('in-scope')) return 'check_circle';
                        if (n.includes('out-of-scope')) return 'error_outline';
                        if (n.includes('task')) return 'assignment';
                        return 'category';
                    };

                    const getColor = (name) => {
                        const n = name.toLowerCase();
                        if (n.includes('in-scope')) return '#059669';
                        if (n.includes('out-of-scope')) return '#DC2626';
                        if (n.includes('task')) return '#0284C7';
                        return '#6366F1';
                    };

                    list.innerHTML = allTypes.map(t => {
                        const icon = getIcon(t.Name);
                        const color = getColor(t.Name);
                        const isSelected = String(t.R_RequestType_ID) === String(updateState.requestTypeId);

                        return `
                            <div class="card selection-card animate-enter type-item" data-id="${t.R_RequestType_ID}" style="margin-bottom:12px; padding:18px; cursor:pointer; display:flex; align-items:center; gap:16px; ${isSelected ? `border:2px solid ${color}; background:${color}05;` : ''}">
                                <div style="width:36px; height:36px; border-radius:8px; background:${color}10; color:${color}; display:flex; align-items:center; justify-content:center;"><span class="material-icons-round">${icon}</span></div>
                                <div style="font-weight:700; flex:1;">${t.Name}</div>
                                ${isSelected ? `<span class="material-icons-round" style="color:${color};">check_circle</span>` : ''}
                            </div>
                        `;
                    }).join('') + `
                        <button id="skip-type" style="margin-top:20px; width:100%; padding:14px; background:#F1F5F9; border:none; border-radius:12px; color:var(--text-secondary); font-weight:700;">Keep Current</button>
                    `;

                    list.querySelectorAll('.type-item').forEach(el => {
                        el.onclick = () => { updateState.requestTypeId = el.dataset.id; currentStep = 6; updateUI(); }
                    });
                    list.querySelector('#skip-type').onclick = () => { currentStep = 6; updateUI(); };
                } else if (currentStep === 6) {
                    // --- STEP 6: SALES ORDER ---
                    container.innerHTML = renderHeader("Sales Order", "Link this request to an SO");
                    const list = document.createElement('div');
                    list.style = "padding:24px; flex:1;";
                    container.appendChild(list);

                    list.innerHTML = `
                        <div style="text-align:center; padding:40px;"><div class="loader-spinner" style="margin:0 auto;"></div></div>
                    `;

                    const orders = await TicketService.getSalesOrders(ticket.C_BPartner_ID);
                    const now = new Date();

                    const categorized = orders.map(o => {
                        const description = (o.Description || "").toUpperCase();
                        const isSLA = description.includes("SLA");
                        const promisedRaw = o.DatePromised ? o.DatePromised.split(' ')[0].replace(/-/g, '/') : null;
                        const orderedRaw = o.DateOrdered ? o.DateOrdered.split(' ')[0].replace(/-/g, '/') : null;
                        const promised = promisedRaw ? new Date(promisedRaw + " 23:59:59") : null;
                        const ordered = orderedRaw ? new Date(orderedRaw + " 00:00:00") : null;
                        const isExpired = promised && promised < now;
                        const isFuture = ordered && ordered > now;
                        let rank = 4;
                        if (isSLA) {
                            if (isExpired) rank = 3; else if (isFuture) rank = 2; else rank = 1;
                        }
                        return { ...o, isSLA, isExpired, isFuture, rank };
                    }).sort((a, b) => {
                        const isA = String(a.C_Order_ID) === String(updateState.salesOrderId);
                        const isB = String(b.C_Order_ID) === String(updateState.salesOrderId);
                        if (isA) return -1;
                        if (isB) return 1;
                        return a.rank - b.rank;
                    });

                    list.innerHTML = `
                        <div style="font-size:12px; font-weight:800; color:var(--text-tertiary); margin-bottom:16px;">AVAILABLE ORDERS</div>
                        ${categorized.length === 0 ? '<div style="text-align:center; padding:20px;">No available orders found.</div>' : ''}
                        ${categorized.map(o => {
                        let badge = '';
                        let style = 'border:1px solid var(--border-light);';
                        const isSelected = String(o.C_Order_ID) === String(updateState.salesOrderId);

                        if (o.isSLA) {
                            if (o.isExpired) {
                                badge = `<span style="font-size:10px; font-weight:800; background:#FEE2E2; color:#B91C1C; padding:2px 8px; border-radius:6px;">EXPIRED SLA</span>`;
                                style = 'border:1px solid #FECACA; background:#FFF5F5;';
                            } else if (o.isFuture) {
                                badge = `<span style="font-size:10px; font-weight:800; background:#FEF3C7; color:#92400E; padding:2px 8px; border-radius:6px;">FUTURE SLA</span>`;
                                style = 'border:1px solid #FDE68A; background:#FFFBEB;';
                            } else {
                                badge = `<span style="font-size:10px; font-weight:800; background:#D1FAE5; color:#047857; padding:2px 8px; border-radius:6px;">ACTIVE SLA</span>`;
                                style = 'border:2px solid #34D399; background:#F0FDF4; box-shadow: 0 4px 12px rgba(52, 211, 153, 0.1);';
                            }
                        }

                        if (isSelected) {
                            badge = `<span style="font-size:10px; font-weight:800; background:var(--primary-color); color:white; padding:2px 8px; border-radius:6px;">CURRENTLY LINKED</span>`;
                            style = 'border:2px solid var(--primary-color); background:var(--primary-color)05;';
                        }

                        return `
                                <div class="card selection-card animate-enter order-item" data-id="${o.C_Order_ID}" data-doc="${o.DocumentNo}" style="margin-bottom:12px; padding:16px; cursor:pointer; ${style}">
                                    <div style="display:flex; justify-content:space-between; margin-bottom:4px; align-items:center;">
                                        <span style="font-weight:800; color:var(--primary-color);">${o.DocumentNo}</span>
                                        ${badge}
                                    </div>
                                    <div style="font-size:13px; font-weight:700; color:var(--text-primary); margin-bottom:4px;">${o.Description || 'No description'}</div>
                                    <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-tertiary);">
                                        <span>Total: ${o.GrandTotal} JOD</span>
                                        <span>Status: ${o.DocStatus}</span>
                                    </div>
                                </div>
                            `;
                    }).join('')}
                        <button id="skip-so" style="margin-top:20px; width:100%; padding:16px; background:#F1F5F9; border:none; border-radius:12px; color:var(--text-secondary); font-weight:700;">Skip / No Change</button>
                    `;

                    list.querySelectorAll('.order-item').forEach(el => {
                        el.onclick = () => {
                            updateState.salesOrderId = el.dataset.id;
                            updateState.salesOrderDoc = el.dataset.doc;
                            currentStep = 7;
                            updateUI();
                        }
                    });
                    list.querySelector('#skip-so').onclick = () => { currentStep = 7; updateUI(); };
                } else if (currentStep === 7) {
                    // --- STEP 7: EXIT CHOICE (CONFIRMATION?) ---
                    container.innerHTML = renderHeader("Final Completion", "Request customer confirmation?");
                    const list = document.createElement('div');
                    list.style = "padding:24px; flex:1;";
                    list.innerHTML = `
                        <div class="card selection-card animate-enter" id="finish-with-report" style="margin-bottom:16px; padding:24px; cursor:pointer; display:flex; align-items:center; gap:20px; border-left:4px solid #10B981;">
                            <div style="width:48px; height:48px; border-radius:12px; background:#10B98115; color:#10B981; display:flex; align-items:center; justify-content:center;">
                                <span class="material-icons-round">edit_note</span>
                            </div>
                            <div style="flex:1;">
                                <div style="font-weight:800; font-size:18px;">Yes, Sign Report</div>
                                <div style="color:var(--text-tertiary); font-size:14px;">Open signature pad and generate PDF</div>
                            </div>
                        </div>
                        <div class="card selection-card animate-enter" id="finish-no-report" style="padding:24px; cursor:pointer; display:flex; align-items:center; gap:20px; border-left:4px solid #CBD5E1;">
                            <div style="width:48px; height:48px; border-radius:12px; background:#CBD5E130; color:#475569; display:flex; align-items:center; justify-content:center;">
                                <span class="material-icons-round">done_all</span>
                            </div>
                            <div style="flex:1;">
                                <div style="font-weight:800; font-size:18px;">No, Save Now</div>
                                <div style="color:var(--text-tertiary); font-size:14px;">Submit changes without report</div>
                            </div>
                        </div>
                    `;
                    container.appendChild(list);

                    list.querySelector('#finish-no-report').onclick = () => { submitUpdate(); };
                    list.querySelector('#finish-with-report').onclick = async () => {
                        const reportResult = await this.showConfirmationReport({
                            documentNo,
                            R_Request_ID: updateState.R_Request_ID,
                            summary: updateState.summary,
                            result: updateState.result,
                            hoursSpent: updateState.hoursSpent,
                            hoursOvertime: updateState.hoursOvertime,
                            partnerName: ticket.PartnerName || 'Customer'
                        });
                        if (reportResult) {
                            updateState.confirmation = reportResult;
                            submitUpdate();
                        }
                    };
                }

                modal.querySelectorAll('.close-update').forEach(btn => {
                    btn.onclick = () => modal.remove();
                });
            };

            const submitUpdate = async () => {
                const submitBtn = document.createElement('div');
                submitBtn.style = "position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(255,255,255,0.9); z-index:3000; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:20px;";
                submitBtn.innerHTML = `
                    <div class="loader-spinner"></div>
                    <div style="font-weight:700; font-size:18px; color:var(--primary-color);">Finalizing Update...</div>
                `;
                document.body.appendChild(submitBtn);

                const updates = {
                    summary: updateState.summary,
                    result: updateState.result,
                    hoursSpent: updateState.hoursSpent,
                    hoursOvertime: updateState.hoursOvertime,
                    statusId: updateState.statusId,
                    requestTypeId: updateState.requestTypeId,
                    salesOrderId: updateState.salesOrderId,
                    confirmation: updateState.confirmation
                };

                try {
                    let success = false;
                    let errorMsg = "Update failed.";

                    if (mode === 'close') {
                        const res = await TicketService.closeTicket(documentNo, updates.result, updates.hoursSpent, updates.hoursOvertime);
                        success = res.success;
                    } else {
                        // If assigned to someone, move status to "In Progress" (1000001) instead of "Not Assigned"
                        if (updateState.newAssigneeId && updateState.statusId === "1000011") {
                            updates.statusId = "1000012";
                        }

                        const res = await TicketService.updateTicketDetails(documentNo, updates);
                        success = res.success;
                        if (res.message) errorMsg = res.message;

                        // Trigger Telegram notification if assignee is present
                        if (success && updateState.newAssigneeId) {
                            await TicketService.assignTicket(documentNo, updateState.newAssigneeId);
                        }
                    }

                    submitBtn.remove();
                    if (success) {
                        modal.remove();
                        appToast("Progress updated successfully!", 'success');
                        this.loadStats(this.container, user.AD_User_ID);
                    } else {
                        appAlert("Error", errorMsg, 'error');
                    }
                } catch (err) {
                    console.error("Submit error:", err);
                    submitBtn.remove();
                    appAlert("Error", "A connection error occurred.", 'error');
                }
            };

            await updateUI();
        } catch (e) {
            console.error(e);
            loadingOverlay.remove();
        }
    }

    renderQuickAction(icon, label, color, id) {
        return `
            <div id="action-${id}" style="display:flex; flex-direction:column; align-items:center; gap:8px; cursor:pointer;">
                <div style="width:56px; height:56px; border-radius:18px; background:${color}15; display:flex; align-items:center; justify-content:center; color:${color};">
                    <span class="material-icons-round" style="font-size:26px;">${icon}</span>
                </div>
                <div class="text-xs" style="text-align:center; font-weight:500;">${label}</div>
            </div>
        `;
    }

    showNewTicketForm() {
        const modal = document.createElement('div');
        modal.className = 'details-overlay animate-enter';
        modal.style = "position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:4000; display:flex; align-items:flex-end;";

        modal.innerHTML = `
            <div class="details-sheet animate-slide-up" id="creation-sheet" style="background:white; width:100%; border-radius:24px 24px 0 0; padding:32px 24px 48px; height:92vh; display:flex; flex-direction:column; overflow:hidden;">
                <div style="width:40px; height:4px; background:#E5E7EB; border-radius:2px; margin: 0 auto 24px;"></div>
                
                <div id="steps-container" style="flex:1; overflow-y:auto; padding-bottom:20px; display:flex; flex-direction:column;">
                    <div id="step-1">
                        <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:24px;">
                            <div>
                                <div style="font-size:12px; color:var(--text-tertiary); font-weight:700; text-transform:uppercase; margin-bottom:4px;">Step 1/6</div>
                                <h2 class="header-lg" style="margin:0;">Select Customer</h2>
                            </div>
                            <button class="close-modal" style="background:#F3F4F6; border:none; border-radius:50%; width:36px; height:36px; cursor:pointer;">
                                <span class="material-icons-round">close</span>
                            </button>
                        </div>

                        <div style="margin-bottom:24px;">
                            <div style="position:relative; margin-bottom:16px;">
                                <span class="material-icons-round" style="position:absolute; left:16px; top:50%; transform:translateY(-50%); color:var(--text-tertiary); pointer-events:none;">search</span>
                                <input type="text" id="partner-search" placeholder="Search customer name or ID..." style="width:100%; padding:18px 18px 18px 48px; border:2px solid var(--border-light); border-radius:16px; font-size:16px; font-weight:600; outline:none; transition:all 0.2s; background:#F9FAFB;" onfocus="this.style.borderColor='var(--primary-color)'; this.style.backgroundColor='white';" onblur="this.style.borderColor='var(--border-light)'; this.style.backgroundColor='#F9FAFB';">
                            </div>
                            <div id="partner-results" style="background:#FDFDFD; border-radius:16px; border:1px solid var(--border-light); display:none; max-height:50vh; overflow-y:auto; box-shadow:inset 0 2px 4px rgba(0,0,0,0.02);"></div>
                        </div>
                    </div>

                    <div id="step-2" style="display:none;">
                        <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:24px;">
                            <div>
                                <div style="font-size:12px; color:var(--text-tertiary); font-weight:700; text-transform:uppercase; margin-bottom:4px;">Step 2/6</div>
                                <h2 class="header-lg" style="margin:0;">Select Order</h2>
                            </div>
                            <button id="back-to-1" style="background:#F3F4F6; border:none; border-radius:50%; width:36px; height:36px; cursor:pointer;">
                                <span class="material-icons-round">arrow_back</span>
                            </button>
                        </div>

                        <div id="order-results" style="display:grid; gap:12px; margin-bottom:20px;">
                            <div style="text-align:center; padding:20px;"><div class="loader-spinner" style="margin:0 auto;"></div></div>
                        </div>
                    </div>

                    <div id="step-type" style="display:none;">
                        <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:24px;">
                            <div>
                                <div style="font-size:12px; color:var(--text-tertiary); font-weight:700; text-transform:uppercase; margin-bottom:4px;">Step 3/6</div>
                                <h2 class="header-lg" style="margin:0;">Request Type</h2>
                            </div>
                            <button id="back-to-2" style="background:#F3F4F6; border:none; border-radius:50%; width:36px; height:36px; cursor:pointer;">
                                <span class="material-icons-round">arrow_back</span>
                            </button>
                        </div>
                        <div id="type-results" style="display:grid; gap:12px; margin-bottom:20px;">
                            <!-- Types go here -->
                            <div style="text-align:center; grid-column:span 2; padding:20px;"><div class="loader-spinner" style="margin:0 auto;"></div></div>
                        </div>
                    </div>

                    <div id="step-contact" style="display:none;">
                        <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:24px;">
                            <div>
                                <div style="font-size:12px; color:var(--text-tertiary); font-weight:700; text-transform:uppercase; margin-bottom:4px;">Step 4/6</div>
                                <h2 class="header-lg" style="margin:0;">Select Contact</h2>
                            </div>
                            <button id="back-to-type" style="background:#F3F4F6; border:none; border-radius:50%; width:36px; height:36px; cursor:pointer;">
                                <span class="material-icons-round">arrow_back</span>
                            </button>
                        </div>
                        <div style="position:relative; margin-bottom:12px;">
                            <span class="material-icons-round" style="position:absolute; left:14px; top:50%; transform:translateY(-50%); color:var(--text-tertiary); pointer-events:none; font-size:20px;">search</span>
                            <input type="text" id="contact-search" placeholder="Search contact name or email..." style="width:100%; padding:14px 14px 14px 44px; border:2px solid var(--border-light); border-radius:14px; font-size:14px; font-weight:600; outline:none; background:#F9FAFB;" onfocus="this.style.borderColor='var(--primary-color)'; this.style.backgroundColor='white';" onblur="this.style.borderColor='var(--border-light)'; this.style.backgroundColor='#F9FAFB';">
                        </div>
                        <div id="contact-results" style="display:grid; gap:12px; margin-bottom:20px;">
                            <!-- Contacts go here -->
                            <div style="text-align:center; padding:20px;"><div class="loader-spinner" style="margin:0 auto;"></div></div>
                        </div>
                    </div>

                    <div id="step-assign" style="display:none;">
                        <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:24px;">
                            <div>
                                <div style="font-size:12px; color:var(--text-tertiary); font-weight:700; text-transform:uppercase; margin-bottom:4px;">Step 5/6</div>
                                <h2 class="header-lg" style="margin:0;">Assign Task</h2>
                            </div>
                            <button id="back-to-contact-from-assign" style="background:#F3F4F6; border:none; border-radius:50%; width:36px; height:36px; cursor:pointer;">
                                <span class="material-icons-round">arrow_back</span>
                            </button>
                        </div>
                        <div id="assign-results" style="display:grid; gap:12px; margin-bottom:20px;">
                            <div style="text-align:center; padding:20px;"><div class="loader-spinner" style="margin:0 auto;"></div></div>
                        </div>
                    </div>

                    <div id="step-final" style="display:none;">
                        <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:24px;">
                            <div>
                                <div style="font-size:12px; color:var(--text-tertiary); font-weight:700; text-transform:uppercase; margin-bottom:4px;">Step 6/6</div>
                                <h2 class="header-lg" style="margin:0;">Summary</h2>
                                <div id="final-ticket-info" style="font-size:13px; color:var(--primary-color); font-weight:600; margin-top:4px; line-height:1.4;"></div>
                            </div>
                            <button id="back-to-assign" style="background:#F3F4F6; border:none; border-radius:50%; width:36px; height:36px; cursor:pointer;">
                                <span class="material-icons-round">arrow_back</span>
                            </button>
                        </div>

                        <div style="margin-bottom:24px;">
                             <textarea id="ticket-summary" placeholder="Describe the issue or symptoms..." style="width:100%; height:160px; padding:20px; border:2px solid var(--border-light); border-radius:20px; font-size:16px; font-weight:600; outline:none; resize:none; font-family:inherit; background:#F9FAFB;" onfocus="this.style.borderColor='var(--primary-color)'; this.style.backgroundColor='white';" onblur="this.style.borderColor='var(--border-light)'; this.style.backgroundColor='#F9FAFB';"></textarea>
                        </div>

                        <button id="submit-ticket-btn" style="width:100%; padding:18px; background:var(--primary-color); color:white; border:none; border-radius:16px; font-size:16px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:12px; box-shadow:var(--shadow-lg);">
                            <span class="material-icons-round">check_circle</span>
                            Finish & Create Request
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        let selectedPartnerId = null;
        let selectedPartnerName = null;
        let selectedOrderId = null;
        let selectedOrderNo = null;
        let selectedTypeId = null;
        let selectedTypeName = null;
        let selectedContactId = null;
        let selectedContactName = null;
        let selectedAssigneeId = null;
        let selectedAssigneeName = null;

        const s1 = modal.querySelector('#step-1');
        const s2 = modal.querySelector('#step-2');
        const sType = modal.querySelector('#step-type');
        const sContact = modal.querySelector('#step-contact');
        const sAssign = modal.querySelector('#step-assign');
        const sFinal = modal.querySelector('#step-final');

        const currentUser = AuthService.getUser();
        const isManager = currentUser.roles.some(r => ROLES.ADMIN.includes(r) || ROLES.PROJECT_MANAGER.includes(r));

        modal.querySelectorAll('.close-modal').forEach(b => b.onclick = () => modal.remove());
        modal.querySelector('#back-to-1').onclick = () => { s2.style.display = 'none'; s1.style.display = 'block'; };
        modal.querySelector('#back-to-2').onclick = () => { sType.style.display = 'none'; s2.style.display = 'block'; };
        modal.querySelector('#back-to-type').onclick = () => { sContact.style.display = 'none'; sType.style.display = 'block'; };
        modal.querySelector('#back-to-contact-from-assign').onclick = () => { sAssign.style.display = 'none'; sContact.style.display = 'block'; };
        modal.querySelector('#back-to-assign').onclick = () => { sFinal.style.display = 'none'; sAssign.style.display = 'block'; };

        // Step 1: Partner Search
        const pSearch = modal.querySelector('#partner-search');
        const pResults = modal.querySelector('#partner-results');

        pSearch.oninput = async (e) => {
            const query = e.target.value.toLowerCase();
            if (query.length < 2) { pResults.style.display = 'none'; return; }

            const customers = await CustomerService.searchCustomers(query);
            const filtered = (customers || []).filter(c =>
                (c.Name || "").toLowerCase().includes(query) ||
                (c.Value || "").toLowerCase().includes(query)
            );

            if (filtered.length > 0) {
                pResults.innerHTML = filtered.map(c => `
                    <div class="partner-item" data-id="${c.C_BPartner_ID}" data-name="${c.Name}" style="padding:16px; cursor:pointer; border-bottom:1px solid #F1F5F9;">
                        <div style="font-weight:700; color:var(--text-primary);">${c.Name}</div>
                        <div style="font-size:12px; color:var(--text-tertiary);">ID: ${c.Value || ''}</div>
                    </div>
                `).join('');
                pResults.style.display = 'block';

                pResults.querySelectorAll('.partner-item').forEach(item => {
                    item.onclick = () => {
                        selectedPartnerId = item.dataset.id;
                        selectedPartnerName = item.dataset.name;
                        s1.style.display = 'none';
                        s2.style.display = 'block';
                        this.loadOrders(modal, selectedPartnerId, (order) => {
                            selectedOrderId = order.C_Order_ID;
                            selectedOrderNo = order.DocumentNo;
                            s2.style.display = 'none';
                            sType.style.display = 'block';
                            this.loadTypes(modal, (type) => {
                                selectedTypeId = type.id;
                                selectedTypeName = type.name;
                                sType.style.display = 'none';
                                sContact.style.display = 'block';
                                this.loadContacts(modal, selectedPartnerId, (contact) => {
                                    selectedContactId = contact.id;
                                    selectedContactName = contact.name;
                                    sContact.style.display = 'none';
                                    sAssign.style.display = 'block';
                                    this.loadProjectUsers(modal, (assignee) => {
                                        selectedAssigneeId = assignee.id;
                                        selectedAssigneeName = assignee.name;
                                        sAssign.style.display = 'none';
                                        sFinal.style.display = 'block';
                                        modal.querySelector('#final-ticket-info').innerHTML = `
                                            <strong>${selectedPartnerName}</strong><br>
                                            Order: ${selectedOrderNo} • Type: ${selectedTypeName}<br>
                                            Contact: ${selectedContactName} • Assigned: ${selectedAssigneeName}
                                        `;
                                    });
                                });
                            });
                        });
                    };
                });
            } else {
                pResults.style.display = 'block';
                pResults.innerHTML = `<div style="padding:14px 16px; color:var(--text-tertiary); font-size:13px;">No customers found for "${query}".</div>`;
            }
        };

        // Step 5: Final Submission
        const submitBtn = modal.querySelector('#submit-ticket-btn');
        submitBtn.onclick = async () => {
            const summary = modal.querySelector('#ticket-summary').value;

            if (!summary.trim()) { appToast("Please enter summary", 'warning'); return; }

            submitBtn.innerHTML = '<div class="loader-spinner" style="width:20px; height:20px; border-color:rgba(255,255,255,0.3); border-top-color:white;"></div>';
            submitBtn.disabled = true;

            const extraData = {
                requestTypeId: selectedTypeId,
                contactId: selectedContactId,
                assignedTo: selectedAssigneeId
            };

            const res = await TicketService.createTicket(selectedPartnerId, summary, selectedOrderId, extraData);
            if (res.success) {
                modal.remove();
                appToast("Request Created Successfully!", 'success');
                this.loadStats(this.container, AuthService.getUser().AD_User_ID);
            } else {
                appAlert("Creation Failed", res.message || "Failed to create request", 'error');
                submitBtn.innerHTML = 'Finish & Create Request';
                submitBtn.disabled = false;
            }
        };
    }

    async loadTypes(modal, onSelect) {
        const typeResults = modal.querySelector('#type-results');
        typeResults.innerHTML = '<div style="text-align:center; padding:20px;"><div class="loader-spinner" style="margin:0 auto;"></div></div>';

        const types = await TicketService.getRequestTypes();

        const getIcon = (name) => {
            const n = name.toLowerCase();
            if (n.includes('in-scope')) return 'verified';
            if (n.includes('out-of-scope')) return 'report_problem';
            if (n.includes('task')) return 'assignment';
            if (n.includes('incident')) return 'emergency';
            return 'inventory_2';
        };

        const getColor = (name) => {
            const n = name.toLowerCase();
            if (n.includes('in-scope')) return '#059669';
            if (n.includes('out-of-scope')) return '#DC2626';
            if (n.includes('task')) return '#0284C7';
            return 'var(--primary-color)';
        };

        typeResults.innerHTML = types.map(t => {
            const icon = getIcon(t.Name);
            const color = getColor(t.Name);
            return `
                <div class="type-item card animate-enter" data-id="${t.R_RequestType_ID}" data-name="${t.Name}" style="padding:16px; cursor:pointer; border:1px solid var(--border-light); display:flex; align-items:center; gap:16px;">
                    <div style="width:48px; height:48px; background:${color}10; color:${color}; border-radius:12px; display:flex; align-items:center; justify-content:center;">
                        <span class="material-icons-round" style="font-size:28px;">${icon}</span>
                    </div>
                    <div style="flex:1;">
                        <div style="font-size:15px; font-weight:700; color:var(--text-primary);">${t.Name}</div>
                        <div style="font-size:12px; color:var(--text-tertiary); font-weight:600;">Request Category</div>
                    </div>
                    <span class="material-icons-round" style="color:var(--border-light);">chevron_right</span>
                </div>
            `;
        }).join('');

        typeResults.querySelectorAll('.type-item').forEach(item => {
            item.onclick = () => onSelect({ id: item.dataset.id, name: item.dataset.name });
        });
    }

    async loadProjectUsers(modal, onSelect) {
        const assignResults = modal.querySelector('#assign-results');
        assignResults.innerHTML = '<div style="text-align:center; padding:20px;"><div class="loader-spinner" style="margin:0 auto;"></div></div>';

        const users = await AuthService.getRoleUsers('1000031'); // Pool from ERP (often truncated by Odoo HR visibility for the API user)
        const current = AuthService.getUser();
        const list = [...users];
        if (current?.AD_User_ID && !list.some((u) => String(u.AD_User_ID) === String(current.AD_User_ID))) {
            list.unshift({ AD_User_ID: current.AD_User_ID, Name: current.Name, assignSubtitle: 'You' });
        }

        assignResults.innerHTML = list.map((u) => {
            const subtitle = u.assignSubtitle || 'Technical Personnel';
            const initial = (u.Name || '?').charAt(0);
            return `
            <div class="assign-item card animate-enter" data-id="${u.AD_User_ID}" data-name="${u.Name}" style="padding:16px; cursor:pointer; border:1px solid var(--border-light); display:flex; align-items:center; gap:16px;">
                <div style="width:48px; height:48px; background:var(--primary-color)10; color:var(--primary-color); border-radius:14px; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:18px;">${initial}</div>
                <div style="flex:1;">
                    <div style="font-size:15px; font-weight:700; color:var(--text-primary);">${u.Name}</div>
                    <div style="font-size:12px; color:var(--text-tertiary); font-weight:600;">${subtitle}</div>
                </div>
                <span class="material-icons-round" style="color:var(--border-light);">chevron_right</span>
            </div>`;
        }).join('');

        assignResults.querySelectorAll('.assign-item').forEach(item => {
            item.onclick = () => onSelect({ id: item.dataset.id, name: item.dataset.name });
        });
    }

    async loadContacts(modal, partnerId, onSelect) {
        const contactResults = modal.querySelector('#contact-results');
        const contactSearch = modal.querySelector('#contact-search');
        contactResults.innerHTML = '<div style="text-align:center; padding:20px;"><div class="loader-spinner" style="margin:0 auto;"></div></div>';

        const contacts = await CustomerService.getPartnerContacts(partnerId);
        if (contacts.length === 0) {
            contactResults.innerHTML = `
                <div style="text-align:center; padding:20px; color:var(--text-tertiary);">No contacts found.</div>
                <button id="skip-contact" class="btn-primary" style="margin-top:12px; width:100%;">Proceed with default contact</button>
            `;
            contactResults.querySelector('#skip-contact').onclick = () => onSelect({ id: null, name: 'Default Contact' });
            return;
        }

        const renderContacts = (list) => {
            contactResults.innerHTML = list.map(c => `
                <div class="contact-item card animate-enter" data-id="${c.AD_User_ID}" data-name="${c.Name}" style="padding:16px; cursor:pointer; border:1px solid var(--border-light); display:flex; align-items:center; gap:12px;">
                    <div style="width:44px; height:44px; background:var(--primary-color)10; color:var(--primary-color); border-radius:12px; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:18px;">${(c.Name || '?').charAt(0)}</div>
                    <div style="flex:1;">
                        <div style="font-size:15px; font-weight:700; color:var(--text-primary);">${c.Name || 'Unknown'}</div>
                        <div style="font-size:12px; color:var(--text-secondary);">${c.EMail || 'No Email'}</div>
                    </div>
                    <span class="material-icons-round" style="color:var(--border-light);">chevron_right</span>
                </div>
            `).join('');

            contactResults.querySelectorAll('.contact-item').forEach(item => {
                item.onclick = () => onSelect({ id: item.dataset.id, name: item.dataset.name });
            });
        };

        renderContacts(contacts);

        if (contactSearch) {
            contactSearch.value = '';
            contactSearch.oninput = (e) => {
                const q = (e.target.value || '').toLowerCase().trim();
                const filtered = contacts.filter(c =>
                    (c.Name || '').toLowerCase().includes(q) ||
                    (c.EMail || '').toLowerCase().includes(q)
                );
                if (filtered.length === 0) {
                    contactResults.innerHTML = `<div style="text-align:center; padding:16px; color:var(--text-tertiary); font-size:13px;">No contacts found for "${q}".</div>`;
                    return;
                }
                renderContacts(filtered);
            };
        }
    }

    async loadPartnerHistory(modal, partnerId) {
        const listEl = modal.querySelector('#partner-history-list');
        listEl.innerHTML = '<div style="text-align:center; padding:20px;"><div class="loader-spinner" style="margin:0 auto;"></div></div>';

        const tickets = await CustomerService.getPartnerTickets(partnerId);
        if (tickets.length === 0) {
            listEl.innerHTML = `<div style="text-align:center; padding:30px; border:1px dashed var(--border-light); border-radius:12px; color:var(--text-tertiary); font-size:13px;">No existing tickets found for this client. You can proceed safely.</div>`;
        } else {
            listEl.innerHTML = `
                <div style="font-size:12px; font-weight:600; margin-bottom:12px; color:var(--danger);">Note: Found ${tickets.length} existing tickets for this client.</div>
                ${tickets.map(t => {
                const status = STATUS_MAP[String(t.R_Status_ID)] || 'Unknown';
                const isClosed = ['Closed', 'Done', 'Final Close'].includes(status);
                return `
                        <div style="background:#F9FAFB; padding:12px; border-radius:10px; border:1px solid var(--border-light); margin-bottom:8px;">
                            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                                <span style="font-weight:700; color:var(--primary-color); font-size:13px;">${t.DocumentNo}</span>
                                <span style="font-size:9px; font-weight:700; padding:2px 6px; border-radius:4px; background:${isClosed ? '#ECFDF5' : '#FEF2F2'}; color:${isClosed ? '#059669' : '#DC2626'};">${status}</span>
                            </div>
                            <div style="font-size:12px; color:var(--text-primary); line-height:1.4;">${t.Summary}</div>
                        </div>
                    `;
            }).join('')}
            `;
        }
    }

    async loadOrders(modal, partnerId, onSelect) {
        const orderResults = modal.querySelector('#order-results');
        orderResults.innerHTML = '<div style="text-align:center; padding:20px;"><div class="loader-spinner" style="margin:0 auto;"></div></div>';

        const orders = await TicketService.getSalesOrders(partnerId);

        if (orders.length === 0) {
            orderResults.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-tertiary);">No sales orders found for this customer.</div>
            <button id="skip-order" style="width:100%; padding:14px; background:#F3F4F6; border:none; border-radius:12px; font-weight:600;">Continue without Order</button>`;

            orderResults.querySelector('#skip-order').onclick = () => onSelect({ C_Order_ID: null, DocumentNo: 'N/A' });
            return;
        }

        const now = new Date();

        // Process and categorize orders
        const categorized = orders.map(o => {
            const description = (o.Description || "").toUpperCase();
            const isSLA = description.includes("SLA");

            // Handle iDempiere date format (YYYY-MM-DD HH:MM:SS)
            const promisedRaw = o.DatePromised ? o.DatePromised.split(' ')[0].replace(/-/g, '/') : null;
            const orderedRaw = o.DateOrdered ? o.DateOrdered.split(' ')[0].replace(/-/g, '/') : null;

            const promised = promisedRaw ? new Date(promisedRaw + " 23:59:59") : null;
            const ordered = orderedRaw ? new Date(orderedRaw + " 00:00:00") : null;

            const isExpired = promised && promised < now;
            const isFuture = ordered && ordered > now;

            let rank = 4; // Default Standard SO
            if (isSLA) {
                if (isExpired) rank = 3; // Expired SLA
                else if (isFuture) rank = 2; // Valid but hasn't started yet
                else rank = 1; // Currently Valid SLA
            }

            return { ...o, isSLA, isExpired, isFuture, rank };
        }).sort((a, b) => a.rank - b.rank);

        orderResults.innerHTML = categorized.map(o => {
            let badge = '';
            let style = 'border:1px solid var(--border-light);';

            if (o.isSLA) {
                if (o.isExpired) {
                    badge = `<span style="font-size:10px; font-weight:700; background:#FEE2E2; color:#B91C1C; padding:2px 8px; border-radius:6px;">EXPIRED SLA</span>`;
                    style = 'border:1px solid #FECACA; background:#FFF5F5; opacity:0.8;';
                } else if (o.isFuture) {
                    badge = `<span style="font-size:10px; font-weight:700; background:#FEF3C7; color:#92400E; padding:2px 8px; border-radius:6px;">FUTURE SLA</span>`;
                    style = 'border:1px solid #FDE68A; background:#FFFBEB;';
                } else {
                    badge = `<span style="font-size:10px; font-weight:700; background:#D1FAE5; color:#047857; padding:2px 8px; border-radius:6px;">ACTIVE SLA</span>`;
                    style = 'border:2px solid #34D399; background:#F0FDF4; box-shadow: 0 4px 12px rgba(52, 211, 153, 0.1);';
                }
            }

            return `
                <div class="order-item card" data-id="${o.C_Order_ID}" data-no="${o.DocumentNo}" style="padding:16px; cursor:pointer; ${style} position:relative; margin-bottom:8px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom: 8px; align-items:center;">
                        <span style="font-weight:700; color:var(--primary-color); font-size:15px;">${o.DocumentNo}</span>
                        ${badge}
                    </div>
                    <div style="font-size:13px; color:var(--text-primary); font-weight:600; margin-bottom:4px;">${o.Description || 'No description'}</div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
                        <div style="font-size:12px; color:var(--text-secondary);">Total: <span style="font-weight:700; color:var(--text-primary);">${o.GrandTotal} JOD</span></div>
                        <div style="font-size:11px; color:var(--text-tertiary);">Status: ${o.DocStatus}</div>
                    </div>
                </div>
            `;
        }).join('') + `
            <button id="skip-order" style="width:100%; margin-top:12px; padding:16px; background:none; border:2px dashed var(--border-light); border-radius:12px; font-size:14px; font-weight:600; color:var(--text-secondary); cursor:pointer;">Continue without linking order</button>
        `;

        orderResults.querySelectorAll('.order-item').forEach(item => {
            item.onclick = () => onSelect({ C_Order_ID: item.dataset.id, DocumentNo: item.dataset.no });
        });

        orderResults.querySelector('#skip-order').onclick = () => onSelect({ C_Order_ID: null, DocumentNo: 'N/A' });
    }

    async showConfirmationReport(data) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'details-overlay animate-enter';
            modal.style = "position:fixed; top:0; left:0; right:0; bottom:0; background:#F8FAFC; z-index:4000; display:flex; flex-direction:column; overflow-y:auto; overflow-x:hidden;";

            const totalHours = (data.hoursSpent || 0) + (data.hoursOvertime || 0);
            const user = AuthService.getUser();

            modal.innerHTML = `
                <style>
                    .report-preview-body {
                        padding: 10px;
                        width: 100%;
                        display: flex;
                        justify-content: center;
                    }
                    #pdf-content {
                        width: 100%;
                        max-width: 750px;
                        background: white;
                        padding: 20px;
                        box-shadow: 0 10px 25px rgba(0,0,0,0.05);
                        border-radius: 12px;
                        box-sizing: border-box;
                    }
                    .report-grid {
                        display: grid;
                        grid-template-columns: 1fr;
                        gap: 15px;
                    }
                    .report-header {
                        flex-direction: column;
                        align-items: center;
                        text-align: center;
                        gap: 15px;
                    }
                    
                    @media (min-width: 650px) {
                        .report-preview-body { padding: 40px 20px; }
                        #pdf-content { padding: 40px; }
                        .report-grid { grid-template-columns: 1fr 1fr; gap: 30px; }
                        .report-header { flex-direction: row; text-align: left; }
                    }

                    /* PDF Force Mode - Aggressive Overrides */
                    .pdf-mode #pdf-content {
                        width: 750px !important;
                        min-width: 750px !important;
                        max-width: 750px !important;
                        padding: 40px !important;
                        border-radius: 0 !important;
                        box-shadow: none !important;
                        margin: 0 !important;
                    }
                    .pdf-mode .report-grid { 
                        display: grid !important; 
                        grid-template-columns: 1fr 1fr !important; 
                        gap: 30px !important; 
                    }
                    .pdf-mode .report-header { 
                        display: flex !important; 
                        justify-content: center !important; 
                        text-align: center !important; 
                        width: 100% !important;
                    }
                    .pdf-mode .report-preview-body { padding: 0 !important; display: block !important; }
                    .pdf-mode #btn-empl-sign, .pdf-mode #btn-cust-sign { border-style: solid !important; }
                </style>

                <div class="report-preview-body">
                    <div id="pdf-content" style="position:relative; font-family:'Inter', sans-serif; color:#000000; min-height:1000px; overflow:hidden; padding-top:10px;">
                        <!-- Background Pattern -->
                        <div style="position:absolute; top:0; left:0; right:0; bottom:0; background-image: url('assets/bg-pattern.png'); background-repeat: no-repeat; background-position: center; background-size: contain; opacity:0.04; pointer-events:none;"></div>
                        
                        <!-- Header Section -->
                        <div class="report-header" style="position:relative; z-index:1; display:flex; justify-content:center; align-items:center; margin-bottom:20px; width:100%;">
                            <img src="assets/logo.png" style="height:120px; width:auto; object-fit:contain;" onerror="this.style.display='none';">
                        </div>
        
                        <div style="position:relative; z-index:1; text-align:left; margin-bottom:30px; border-bottom: 2px solid #000;">
                            <h1 style="font-size:18px; font-weight:900; color:#000000; margin:0; padding-bottom:10px; text-transform:uppercase; letter-spacing:1px;">${data.DocumentNo || data.documentNo || 'RT-XXXX'}</h1>
                        </div>
        
                        <!-- Customer & Product Info -->
                        <div style="position:relative; z-index:1; margin-bottom:20px;">
                            <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
                                <span style="font-size:13px; font-weight:800; text-transform:uppercase; color:#000000; white-space:nowrap;">Customer Name:</span>
                                <div style="flex:1; border-bottom:1px dotted #000000; font-size:15px; font-weight:700; padding-bottom:2px;">${data.PartnerName || data.partnerName || 'Unknown Customer'}</div>
                            </div>
                            <div class="report-grid">
                                <div style="display:flex; align-items:center; gap:10px;">
                                    <span style="font-size:13px; font-weight:800; text-transform:uppercase; color:#000000; white-space:nowrap;">Product:</span>
                                    <div id="display-product" style="flex:1; border-bottom:1px solid #000000; min-height:24px;">
                                        <input type="text" id="report-product" placeholder="Enter product name..." style="width:100%; border:none; font-size:14px; font-weight:600; padding:4px 0; outline:none; background:transparent; color:#000000;">
                                    </div>
                                </div>
                                <div style="display:flex; align-items:center; gap:10px;">
                                    <span style="font-size:13px; font-weight:800; text-transform:uppercase; color:#000000; white-space:nowrap;">Date:</span>
                                    <div style="flex:1; border-bottom:1px solid #000000; font-size:14px; font-weight:600; padding:4px 0;">${new Date().toLocaleDateString('en-GB')}</div>
                                </div>
                            </div>
                        </div>
        
                        <!-- Visit Type -->
                        <div style="position:relative; z-index:1; background:#F8FAFC; border:1px solid #000000; border-radius:12px; padding:15px; margin-bottom:25px;">
                            <div style="font-size:11px; font-weight:800; color:#000000; text-transform:uppercase; margin-bottom:12px; display:flex; align-items:center; gap:8px;">
                                <span class="material-icons-round" style="font-size:14px;">info</span> Visit Type Details
                            </div>
                            <div style="display:flex; gap:15px; flex-wrap:wrap; align-items:center;">
                                <label style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:700; cursor:pointer;">
                                    <input type="checkbox" name="visitType" value="Warranty" style="width:18px; height:18px;"> Warranty
                                </label>
                                <label style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:700; cursor:pointer;">
                                    <input type="checkbox" name="visitType" value="Maintenance" style="width:18px; height:18px;"> Maintenance Contract
                                </label>
                                <label style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:700; cursor:pointer;">
                                    <input type="checkbox" name="visitType" value="Chargeable" style="width:18px; height:18px;"> Chargeable Visit
                                </label>
                                <label style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:700; cursor:pointer;">
                                    <input type="checkbox" name="visitType" value="Others" style="width:18px; height:18px;"> Others
                                </label>
                            </div>
                        </div>
        
                        <!-- Content Boxes -->
                        <div class="report-grid" style="position:relative; z-index:1; border:2px solid #000000; border-radius:12px; overflow:hidden; margin-bottom:30px; gap:0;">
                            <div style="padding:20px; border-right:2px solid #000000; border-bottom:2px solid #000000; min-height:220px;">
                                <label style="display:block; font-size:12px; font-weight:900; color:#000000; text-transform:uppercase; margin-bottom:12px; border-left:4px solid #000000; padding-left:10px;">Problem Description</label>
                                <div style="font-size:14px; line-height:1.7; color:#000000; white-space:pre-wrap;">${data.Summary || data.summary || 'No description provided.'}</div>
                            </div>
                            <div style="padding:20px; background:#FDFDFD; min-height:220px; border-bottom:2px solid #000000;">
                                <label style="display:block; font-size:12px; font-weight:900; color:#000000; text-transform:uppercase; margin-bottom:12px; border-left:4px solid #000000; padding-left:10px;">Action Taken</label>
                                <div style="font-size:14px; line-height:1.7; color:#000000; white-space:pre-wrap;">${data.Result || data.result || 'Technician to document final actions.'}</div>
                            </div>
                        </div>
        
                        <!-- Logistics -->
                        <div class="report-grid" style="position:relative; z-index:1; border:2px solid #000000; border-radius:12px; overflow:hidden; margin-bottom:35px; background:white; gap:0;">
                            <div style="padding:15px; border-right:2px solid #000000;">
                                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                                    <div>
                                        <label style="display:block; font-size:10px; font-weight:900; color:#000000; text-transform:uppercase; margin-bottom:5px;">Start Time</label>
                                        <div id="display-start-time" style="min-height:30px;">
                                            <input type="time" id="report-start-time" style="width:100%; border:1px solid #000000; border-radius:6px; padding:5px; font-size:14px; font-weight:700; color:#000000;">
                                        </div>
                                    </div>
                                    <div>
                                        <label style="display:block; font-size:10px; font-weight:900; color:#000000; text-transform:uppercase; margin-bottom:5px;">End Time</label>
                                        <div id="display-end-time" style="min-height:30px;">
                                            <input type="time" id="report-end-time" style="width:100%; border:1px solid #000000; border-radius:6px; padding:5px; font-size:14px; font-weight:700; color:#000000;">
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div style="padding:15px; background:#F1F5F9; display:flex; gap:20px; align-items:center; justify-content:center;">
                                <div style="text-align:center; border-right:2px solid #000000; padding-right:20px;">
                                    <label style="display:block; font-size:10px; font-weight:900; color:#000000; text-transform:uppercase;">Total Hours</label>
                                    <div style="font-size:22px; font-weight:900; color:#000000;">${totalHours} <small style="font-size:12px;">HRS</small></div>
                                </div>
                                <div style="text-align:center;">
                                    <label style="display:block; font-size:10px; font-weight:900; color:#000000; text-transform:uppercase;">Visit Status</label>
                                    <div style="font-size:18px; font-weight:900; color:#000000;">On-Site</div>
                                </div>
                            </div>
                        </div>
        
                        <!-- Signatures -->
                        <div class="report-grid" style="position:relative; z-index:1;">
                            <div id="btn-empl-sign" style="border:2px dashed #000000; border-radius:15px; padding:20px; text-align:center; background:rgba(255,255,255,0.8); cursor:pointer;">
                                <div id="empl-placeholder" style="padding:15px 0;">
                                    <span class="material-icons-round" style="font-size:48px; color:#000000;">fingerprint</span>
                                    <div style="font-size:12px; color:#000000; font-weight:800; text-transform:uppercase; margin-top:5px;">Technician Sign</div>
                                </div>
                                <div id="empl-img-container" style="display:none; padding:10px 0;">
                                    <img id="empl-sign-img" style="max-height:90px; width:auto; mix-blend-mode:multiply;">
                                </div>
                                <div style="border-top:2px solid #000000; margin-top:10px; padding-top:8px;">
                                    <div style="font-size:13px; font-weight:900; color:#000000; letter-spacing:0.5px; text-transform:uppercase;">Artelco Representative</div>
                                    <div style="font-size:14px; font-weight:700; color:#000000; margin-top:2px;">${user.Name}</div>
                                </div>
                            </div>
                            <div id="btn-cust-sign" style="border:2px dashed #000000; border-radius:15px; padding:20px; text-align:center; background:rgba(255,255,255,0.8); cursor:pointer;">
                                <div id="cust-placeholder" style="padding:15px 0;">
                                    <span class="material-icons-round" style="font-size:48px; color:#000000;">history_edu</span>
                                    <div style="font-size:12px; color:#000000; font-weight:800; text-transform:uppercase; margin-top:5px;">Customer Approval</div>
                                </div>
                                <div id="cust-img-container" style="display:none; padding:10px 0;">
                                    <img id="cust-sign-img" style="max-height:90px; width:auto; mix-blend-mode:multiply;">
                                </div>
                                <div style="border-top:2px solid #000000; margin-top:10px; padding-top:8px;">
                                    <div style="font-size:13px; font-weight:900; color:#000000; letter-spacing:0.5px; text-transform:uppercase; margin-bottom:5px;">Customer Approval</div>
                                    <div id="display-cust-name">
                                        <input type="text" id="report-cust-name" placeholder="Person Name..." style="width:100%; border:none; border-bottom:1px solid #000000; font-size:13px; font-weight:700; text-align:center; padding:2px 0; outline:none; background:transparent; color:#000000;">
                                    </div>
                                </div>
                            </div>
                        </div>
        
                        <!-- Footer Details -->
                        <div style="position:absolute; bottom:15px; right:40px; font-size:10px; font-weight:900; color:#000000; letter-spacing:1px; z-index:1;">
                            QPF 13-02-5 Rev.a
                        </div>
                    </div>
                </div>
        
                <!-- Sticky Controls -->
                <div style="padding:20px 24px calc(24px + var(--safe-area-bottom)); background:white; border-top:1px solid #F1F5F9; display:grid; grid-template-columns: 100px 1fr; gap:16px; position:sticky; bottom:0; z-index:100;">
                    <button id="cancel-report" style="padding:18px; background:#F1F5F9; color:#000000; border:none; border-radius:16px; font-size:16px; font-weight:700;">Cancel</button>
                    <button id="save-report" disabled style="padding:18px; background:var(--primary-color); opacity:0.5; color:white; border:none; border-radius:16px; font-size:16px; font-weight:800; box-shadow:0 8px 16px var(--primary-color)40;">Confirm & Prepare Report</button>
                </div>
            `;

            document.body.appendChild(modal);

            let emplSign = null;
            let custSign = null;

            const updatePreview = () => {
                if (emplSign) {
                    modal.querySelector('#empl-sign-img').src = emplSign;
                    modal.querySelector('#empl-img-container').style.display = 'block';
                    modal.querySelector('#empl-placeholder').style.display = 'none';
                    modal.querySelector('#btn-empl-sign').style.borderStyle = 'solid';
                    modal.querySelector('#btn-empl-sign').style.borderColor = 'var(--primary-color)40';
                }
                if (custSign) {
                    modal.querySelector('#cust-sign-img').src = custSign;
                    modal.querySelector('#cust-img-container').style.display = 'block';
                    modal.querySelector('#cust-placeholder').style.display = 'none';
                    modal.querySelector('#btn-cust-sign').style.borderStyle = 'solid';
                    modal.querySelector('#btn-cust-sign').style.borderColor = 'var(--primary-color)40';
                }

                const signBtn = modal.querySelector('#save-report');
                if (emplSign && custSign) {
                    signBtn.disabled = false;
                    signBtn.style.opacity = '1';
                }
            };

            modal.querySelector('#btn-empl-sign').onclick = async (e) => {
                if (e.target.tagName === 'INPUT') return;
                const sign = await appSignaturePad('Technician Signature');
                if (sign) { emplSign = sign; updatePreview(); }
            };

            modal.querySelector('#btn-cust-sign').onclick = async (e) => {
                if (e.target.tagName === 'INPUT') return;
                const sign = await appSignaturePad('Customer Signature');
                if (sign) { custSign = sign; updatePreview(); }
            };

            // Prevent signature pad from opening when focusing the name input
            modal.querySelector('#report-cust-name').addEventListener('click', (e) => e.stopPropagation());
            modal.querySelector('#report-cust-name').addEventListener('mousedown', (e) => e.stopPropagation());

            modal.querySelector('#cancel-report').onclick = () => {
                modal.remove();
                resolve(null);
            };

            modal.querySelector('#save-report').onclick = async () => {
                const btn = modal.querySelector('#save-report');
                const cancelBtn = modal.querySelector('#cancel-report');

                // Read manual field values before PDF generation
                const product = modal.querySelector('#report-product').value || 'Unspecified';
                const custRepName = modal.querySelector('#report-cust-name').value || 'Authorized Signatory';
                const startTime = modal.querySelector('#report-start-time').value || '--:--';
                const endTime = modal.querySelector('#report-end-time').value || '--:--';

                // Convert inputs to static text for final capture
                modal.querySelector('#display-product').innerHTML = `<div style="font-size:15px; font-weight:700; color:#000000;">${product}</div>`;
                modal.querySelector('#display-cust-name').innerHTML = `<div style="font-size:14px; font-weight:700; color:#000000; margin-top:2px;">${custRepName}</div>`;
                modal.querySelector('#display-start-time').innerHTML = `<div style="font-size:14px; font-weight:700; color:#000000;">${startTime}</div>`;
                modal.querySelector('#display-end-time').innerHTML = `<div style="font-size:14px; font-weight:700; color:#000000;">${endTime}</div>`;

                // Handle Checkboxes (make them permanent visual markers)
                modal.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                    const parent = cb.parentElement;
                    const isChecked = cb.checked;
                    parent.innerHTML = `<span style="display:inline-block; width:16px; height:16px; border:1px solid #000000; margin-right:6px; text-align:center; line-height:14px; font-size:12px; font-weight:900;">${isChecked ? '✓' : ''}</span> ${parent.innerText.trim()}`;
                });

                // FORCE PDF LAYOUT
                modal.classList.add('pdf-mode');

                btn.disabled = true;
                btn.innerHTML = '<div class="loader-spinner" style="width:20px; height:20px; border-top-color:white; margin:0 auto;"></div>';
                cancelBtn.style.visibility = 'hidden';

                try {
                    // CREATE A HIDDEN CLONE FOR PDF GENERATION (Forces Desktop/A4 Layout)
                    const original = modal.querySelector('#pdf-content');
                    const cloneContainer = document.createElement('div');
                    cloneContainer.style.position = 'absolute';
                    cloneContainer.style.left = '-9999px';
                    cloneContainer.style.top = '0';
                    cloneContainer.style.width = '794px';

                    const clone = original.cloneNode(true);
                    clone.style.width = '794px';
                    clone.style.margin = '0';
                    clone.style.padding = '40px';
                    clone.style.display = 'block';
                    clone.style.background = 'white';

                    // Force side-by-side layout in the clone (inline overrides for capture)
                    clone.querySelectorAll('.report-grid').forEach(grid => {
                        grid.style.display = 'grid';
                        grid.style.gridTemplateColumns = '1fr 1fr';
                        grid.style.gap = '30px';
                    });

                    const header = clone.querySelector('.report-header');
                    if (header) {
                        header.style.display = 'flex';
                        header.style.justifyContent = 'center';
                        header.style.width = '100%';
                    }

                    cloneContainer.appendChild(clone);
                    document.body.appendChild(cloneContainer);

                    const todayDate = new Date().toISOString().split('T')[0];
                    const cleanPartnerName = (data.PartnerName || 'Unknown').replace(/[^a-z0-9]/gi, '_');
                    const srFilename = `SR_${cleanPartnerName}_${todayDate}.pdf`;

                    const opt = {
                        margin: 0,
                        filename: srFilename,
                        image: { type: 'jpeg', quality: 1.0 },
                        html2canvas: {
                            scale: 3,
                            useCORS: true,
                            letterRendering: true,
                            backgroundColor: '#ffffff',
                            width: 794
                        },
                        jsPDF: { unit: 'px', format: [794, 1123], orientation: 'portrait' }
                    };

                    await html2pdf().set(opt).from(clone).save();

                    // --- NEW: UPLOAD TO ERP ---
                    try {
                        // Use .output('datauristring') which is standard for html2pdf
                        const pdfBase64 = await html2pdf().set(opt).from(clone).output('datauristring');
                        const ticketId = data.R_Request_ID || data.RECORDID;

                        console.log("[ERP] Attachment Data Check:", { ticketId, filename: srFilename, hasData: !!pdfBase64 });

                        if (ticketId && pdfBase64) {
                            appToast("Uploading report to ERP...", 'info');
                            const uploadRes = await TicketService.uploadAttachment(
                                ticketId,
                                srFilename,
                                pdfBase64
                            );
                            if (uploadRes.success) {
                                console.log("[ERP] Attachment uploaded successfully");
                            }
                        } else {
                            console.error("[ERP] Missing data for upload:", { ticketId, hasData: !!pdfBase64 });
                        }
                    } catch (uploadErr) {
                        console.warn("[ERP] PDF Upload process error:", uploadErr);
                    }
                    // --------------------------

                    cloneContainer.remove();
                    modal.remove();
                    resolve({
                        data,
                        emplSign,
                        custSign,
                        manualFields: { product, custRepName, startTime, endTime },
                        timestamp: new Date().toISOString()
                    });
                } catch (err) {
                    console.error("PDF Export failed:", err);
                    appAlert("Export Error", "Could not generate PDF. Please try again.", 'error');
                    btn.disabled = false;
                    btn.innerText = "Confirm & Prepare Report";
                    cancelBtn.style.visibility = 'visible';
                }
            };
        });
    }

    async showCopyTicketForm() {
        const modal = document.createElement('div');
        modal.className = 'details-overlay animate-enter';
        modal.style = "position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:4000; display:flex; align-items:flex-end;";

        modal.innerHTML = `
                <div class="details-sheet animate-slide-up">
                <div style="width:40px; height:4px; background:#E5E7EB; border-radius:2px; margin: 0 auto 24px;"></div>
                <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:24px;">
                    <div>
                        <div style="font-size:12px; color:var(--text-tertiary); font-weight:700; text-transform:uppercase; margin-bottom:4px;">Action</div>
                        <h2 class="header-lg" style="margin:0;">Copy from Old</h2>
                    </div>
                    <button class="close-modal" style="background:#F3F4F6; border:none; border-radius:50%; width:36px; height:36px; cursor:pointer;">
                        <span class="material-icons-round">close</span>
                    </button>
                </div>
                <p style="text-align:center; padding:40px; color:var(--text-tertiary);">Search and select a recent ticket to copy its details.</p>
            </div>
                `;
        document.body.appendChild(modal);
        modal.querySelector('.close-modal').onclick = () => modal.remove();
    }
}
