
import { TicketService, AuthService, STATUS_MAP } from '../services/api.js';

export default class TicketsView {
    constructor() {
        this.allTickets = [];
        this.filteredTickets = [];
        this.currentFilter = 'open'; // 'open' | 'closed' | 'all'
        this.searchQuery = '';
    }

    async render() {
        const container = document.createElement('div');
        container.className = 'view-tickets';
        this.container = container;

        container.innerHTML = `
            <div style="background:white; padding: 20px 24px 8px; border-bottom:1px solid var(--border-light); position:sticky; top:0; z-index:100;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                    <h1 class="header-lg" style="margin:0;">Requests</h1>
                    <button id="refresh-btn" style="background:none; border:none; color:var(--primary-color); cursor:pointer;">
                        <span class="material-icons-round">sync</span>
                    </button>
                </div>
                
                <div style="background:var(--bg-body); border-radius:12px; padding:10px 16px; display:flex; align-items:center; gap:12px; margin-bottom:16px;">
                    <span class="material-icons-round" style="color:var(--text-tertiary);">search</span>
                    <input type="text" id="ticket-search" placeholder="Search customer or ID..." style="border:none; background:none; outline:none; font-size:14px; width:100%; font-family:inherit;">
                </div>

                <div style="display:flex; gap:8px; margin-bottom:8px;">
                    <button class="filter-chip ${this.currentFilter === 'open' ? 'active' : ''}" data-filter="open">Open Requests</button>
                    <button class="filter-chip ${this.currentFilter === 'closed' ? 'active' : ''}" data-filter="closed">Closed</button>
                    <button class="filter-chip ${this.currentFilter === 'all' ? 'active' : ''}" data-filter="all">Show All</button>
                </div>
            </div>

            <div id="tickets-list" style="padding: 16px; min-height: 200px;">
                <div style="text-align:center; padding:40px; color:var(--text-tertiary);">
                    <div class="loader-spinner" style="margin:0 auto 16px;"></div>
                    Syncing with ERP...
                </div>
            </div>
        `;

        this.applyEvents();

        // Listen for background updates from TicketService
        this._onTicketsUpdate = (e) => {
            console.log("[TicketsView] Background sync finished, updating UI...");
            this.allTickets = e.detail;
            this.updateUI();
        };
        window.addEventListener('tickets-updated', this._onTicketsUpdate);

        this.fetchData();
        return container;
    }

    applyEvents() {
        const searchInput = this.container.querySelector('#ticket-search');
        searchInput.oninput = (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.updateUI();
        };

        this.container.querySelectorAll('.filter-chip').forEach(btn => {
            btn.onclick = () => {
                this.container.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentFilter = btn.dataset.filter;
                this.updateUI();
            };
        });

        this.container.querySelector('#refresh-btn').onclick = () => this.fetchData(true);
    }

    async fetchData(force = false) {
        const user = AuthService.getUser();
        if (!user) return;

        const list = this.container.querySelector('#tickets-list');
        // Only show loader if we have absolutely no data yet
        if (this.allTickets.length === 0) {
            list.innerHTML = `<div style="text-align:center; padding:40px;"><div class="loader-spinner" style="margin:0 auto 16px;"></div><div style="font-size:13px; color:var(--text-tertiary);">Loading your requests...</div></div>`;
        }

        this.allTickets = await TicketService.getTickets(user.AD_User_ID, force);
        this.updateUI();
    }

    updateUI() {
        const listContainer = this.container.querySelector('#tickets-list');

        // 1. Filter by Status
        let filtered = this.allTickets.filter(t => {
            const statusName = STATUS_MAP[String(t.R_Status_ID)] || '';
            const isClosed = ['Closed', 'Done', 'Final Close'].includes(statusName);

            if (this.currentFilter === 'open') return !isClosed;
            if (this.currentFilter === 'closed') return isClosed;
            return true;
        });

        // 2. Filter by Search
        if (this.searchQuery) {
            filtered = filtered.filter(t => {
                const docNo = (t.DocumentNo || "").toLowerCase();
                const partner = (t.PartnerName || "").toLowerCase();
                const summary = (t.Summary || "").toLowerCase();

                return docNo.includes(this.searchQuery) ||
                    partner.includes(this.searchQuery) ||
                    summary.includes(this.searchQuery);
            });
        }

        // 3. Sort (Open first, then by date)
        filtered.sort((a, b) => new Date(b.Created) - new Date(a.Created));

        if (filtered.length === 0) {
            listContainer.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-secondary);">No records match your criteria.</div>`;
            return;
        }

        listContainer.innerHTML = filtered.map((t, i) => this.renderTicketCard(t, i)).join('');

        // Attach click listeners to cards for Details
        listContainer.querySelectorAll('.card').forEach(card => {
            card.onclick = () => this.showDetails(card.dataset.id);
        });
    }

    renderTicketCard(t, index) {
        const statusName = String(t?.R_Status_Name || STATUS_MAP[String(t.R_Status_ID)] || 'Unknown');
        const norm = statusName.trim().toLowerCase();
        const isClosed = ['closed', 'done', 'final close', 'solved', 'cancelled', 'canceled'].includes(norm);
        const statusClass = isClosed ? 'resolved' : (['Open', 'Not Assigned'].includes(statusName) ? 'open' : 'pending');

        return `
            <div class="card animate-enter" data-id="${t.DocumentNo}" style="animation-delay:${index * 0.05}s; cursor:pointer; margin-bottom:12px; transition:transform 0.2s active;">
                <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                    <span style="font-size:12px; color:var(--text-tertiary); font-weight:600;">#${t.DocumentNo}</span>
                    <span class="status-badge ${statusClass}">${statusName}</span>
                </div>
                <div style="font-weight:700; color:var(--text-primary); font-size:15px; margin-bottom:4px;">${t.PartnerName}</div>
                <div style="font-size:14px; font-weight:700; color:var(--text-primary); margin-bottom:4px;">${t.Summary}</div>
                <div style="font-size:12px; color:var(--text-tertiary); line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${t.Description || 'No detailed description.'}</div>
            </div>
        `;
    }

    showDetails(docNo) {
        const ticket = this.allTickets.find(t => t.DocumentNo === docNo);
        if (!ticket) return;

        const modal = document.createElement('div');
        modal.className = 'details-overlay animate-enter';
        modal.style = "position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:4000; display:flex; align-items:flex-end;";

        const statusName = String(ticket?.R_Status_Name || STATUS_MAP[String(ticket.R_Status_ID)] || 'Unknown');
        const norm = statusName.trim().toLowerCase();
        const isClosed = ['closed', 'done', 'final close', 'solved', 'cancelled', 'canceled'].includes(norm);

        modal.innerHTML = `
            <div class="details-sheet animate-slide-up">
                <div style="width:40px; height:4px; background:#E5E7EB; border-radius:2px; margin: 0 auto 24px;"></div>
                
                <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:24px;">
                    <div>
                        <div style="font-size:12px; color:var(--text-tertiary); font-weight:700; text-transform:uppercase; margin-bottom:4px;">Request Details</div>
                        <h2 class="header-lg" style="margin:0;">${ticket.DocumentNo}</h2>
                    </div>
                    <button id="close-modal" style="background:#F3F4F6; border:none; border-radius:50%; width:36px; height:36px; cursor:pointer;">
                        <span class="material-icons-round">close</span>
                    </button>
                </div>

                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:24px;">
                    <div class="card" style="background:var(--bg-body); border:none; padding:12px;">
                        <div style="font-size:10px; font-weight:700; color:var(--text-tertiary); text-transform:uppercase; margin-bottom:4px;">Customer</div>
                        <div style="font-size:14px; font-weight:700; color:var(--primary-color);">${ticket.PartnerName}</div>
                    </div>
                    <div class="card" style="background:var(--bg-body); border:none; padding:12px;">
                        <div style="font-size:10px; font-weight:700; color:var(--text-tertiary); text-transform:uppercase; margin-bottom:4px;">Contact Person</div>
                        <div style="font-size:14px; font-weight:700; color:var(--text-primary);">${ticket.ContactName || 'N/A'}</div>
                    </div>
                </div>

                <div style="margin-bottom:24px;">
                    <div style="font-size:11px; font-weight:700; color:var(--text-tertiary); text-transform:uppercase; margin-bottom:8px;">Summary</div>
                    <div style="font-size:15px; font-weight:600; color:var(--text-primary); margin-bottom:12px;">${ticket.Summary}</div>
                    
                </div>

                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-bottom:24px;">
                    <div style="background:#F9FAFB; padding:12px; border-radius:12px;">
                        <div style="font-size:10px; color:var(--text-tertiary); font-weight:700; text-transform:uppercase; margin-bottom:4px;">Created By</div>
                        <div style="font-size:13px; color:var(--text-primary); font-weight:600;">${ticket.CreatedByName}</div>
                    </div>
                    <div style="background:#F9FAFB; padding:12px; border-radius:12px;">
                        <div style="font-size:10px; color:var(--text-tertiary); font-weight:700; text-transform:uppercase; margin-bottom:4px;">Assigned To</div>
                        <div style="font-size:13px; color:var(--text-primary); font-weight:600;">${ticket.AssigneeName}</div>
                    </div>
                </div>

                <div style="margin-bottom:32px;">
                    <div style="font-size:11px; font-weight:700; color:var(--text-tertiary); text-transform:uppercase; margin-bottom:16px;">Activity History</div>
                    <div id="timeline-container" style="display:flex; flex-direction:column; gap:20px; padding-left:4px;">
                        <div class="loader-spinner" style="margin:10px auto; width:20px; height:20px;"></div>
                    </div>
                </div>

                ${!isClosed ? `
                    <button id="update-status-btn" style="width:100%; padding:18px; background:var(--primary-color); color:white; border:none; border-radius:16px; font-size:16px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:12px; box-shadow:var(--shadow-md);">
                        <span class="material-icons-round">check_circle</span>
                        Close Request Now
                    </button>
                ` : `
                    <div style="text-align:center; padding:16px; background:#ECFDF5; color:#065F46; border-radius:16px; font-weight:600; font-size:14px;">
                        This request is already closed and archived.
                    </div>
                `}
            </div>
        `;

        document.body.appendChild(modal);

        // Fetch and Render Timeline
        TicketService.getTicketUpdates(ticket.R_Request_ID).then(updates => {
            const container = modal.querySelector('#timeline-container');
            if (!updates || updates.length === 0) {
                container.innerHTML = '<div style="font-size:13px; color:var(--text-tertiary); font-style:italic;">No updates recorded yet.</div>';
                return;
            }

            container.innerHTML = updates.map((u, index) => `
                <div style="display:flex; gap:16px; position:relative;">
                    ${index !== updates.length - 1 ? `<div style="position:absolute; left:7px; top:24px; bottom:-20px; width:1px; background:#E5E7EB;"></div>` : ''}
                    <div style="width:16px; height:16px; border-radius:50%; background:${index === 0 ? 'var(--primary-color)' : '#D1D5DB'}; margin-top:4px; z-index:1; border:3px solid white; box-shadow:0 0 0 1px #E5E7EB;"></div>
                    <div style="flex:1;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                            <div style="font-size:12px; font-weight:700; color:var(--text-primary);">${u.CreatedByName || 'Technician'}</div>
                            <div style="font-size:10px; color:var(--text-tertiary); font-weight:600;">${new Date(u.Created).toLocaleDateString()}</div>
                        </div>
                        <div style="font-size:13px; color:var(--text-secondary); line-height:1.5; background:#F8FAFC; padding:12px; border-radius:12px; border:1px solid #F1F5F9;">
                            ${u.Result || 'Updated status/details'}
                            ${(parseFloat(u.QtySpent) > 0 || parseFloat(u.HoursOvertime) > 0) ? `
                                <div style="margin-top:8px; padding-top:8px; border-top:1px dashed #E2E8F0; display:flex; gap:12px; font-size:11px; font-weight:700; color:var(--primary-color);">
                                    ${parseFloat(u.QtySpent) > 0 ? `<span><span class="material-icons-round" style="font-size:12px; vertical-align:middle;">schedule</span> ${u.QtySpent}h Normal</span>` : ''}
                                    ${parseFloat(u.HoursOvertime) > 0 ? `<span><span class="material-icons-round" style="font-size:12px; vertical-align:middle;">bolt</span> ${u.HoursOvertime}h OT</span>` : ''}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `).join('');
        });

        modal.querySelector('#close-modal').onclick = () => modal.remove();

        const updateBtn = modal.querySelector('#update-status-btn');
        if (updateBtn) {
            updateBtn.onclick = () => {
                // Show Closure Form instead of immediate update
                const sheet = modal.querySelector('.details-sheet');
                sheet.innerHTML = `
                    <div style="width:40px; height:4px; background:#E5E7EB; border-radius:2px; margin: 0 auto 24px;"></div>
                    <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:24px;">
                        <div>
                            <div style="font-size:12px; color:var(--text-tertiary); font-weight:700; text-transform:uppercase; margin-bottom:4px;">Final Resolution</div>
                            <h2 class="header-lg" style="margin:0;">Close Ticket</h2>
                        </div>
                        <button id="cancel-close" style="background:#F3F4F6; border:none; border-radius:50%; width:36px; height:36px; cursor:pointer;">
                            <span class="material-icons-round">close</span>
                        </button>
                    </div>

                    <div style="margin-bottom:20px;">
                        <label style="display:block; font-size:11px; font-weight:700; color:var(--text-tertiary); text-transform:uppercase; margin-bottom:8px;">Resolution Result</label>
                        <textarea id="final-result" placeholder="What was the final solution?..." style="width:100%; height:100px; padding:16px; border:1px solid var(--border-light); border-radius:12px; font-size:14px; outline:none; resize:none; font-family:inherit; background:#F9FAFB;"></textarea>
                    </div>

                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-bottom:32px;">
                        <div>
                            <label style="display:block; font-size:11px; font-weight:700; color:var(--text-tertiary); text-transform:uppercase; margin-bottom:8px;">Normal Hours</label>
                            <input type="number" id="hours-normal" value="0" style="width:100%; padding:14px; border:1px solid var(--border-light); border-radius:12px; font-size:14px; outline:none; background:#F9FAFB;">
                        </div>
                        <div>
                            <label style="display:block; font-size:11px; font-weight:700; color:var(--text-tertiary); text-transform:uppercase; margin-bottom:8px;">Overtime</label>
                            <input type="number" id="hours-overtime" value="0" style="width:100%; padding:14px; border:1px solid var(--border-light); border-radius:12px; font-size:14px; outline:none; background:#F9FAFB;">
                        </div>
                    </div>

                    <button id="confirm-close-btn" style="width:100%; padding:18px; background:var(--primary-color); color:white; border:none; border-radius:16px; font-size:16px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:12px; box-shadow:var(--shadow-md);">
                        <span class="material-icons-round">check_circle</span>
                        Submit & Close
                    </button>
                `;

                sheet.querySelector('#cancel-close').onclick = () => { modal.remove(); };

                const confirmBtn = sheet.querySelector('#confirm-close-btn');
                confirmBtn.onclick = async () => {
                    const resultText = sheet.querySelector('#final-result').value;
                    const hNormal = sheet.querySelector('#hours-normal').value;
                    const hOvertime = sheet.querySelector('#hours-overtime').value;

                    if (!resultText) {
                        appToast("Please provide resolution result.", 'warning');
                        return;
                    }

                    confirmBtn.innerHTML = '<div class="loader-spinner" style="width:20px; height:20px; border-color:rgba(255,255,255,0.3); border-top-color:white;"></div>';
                    confirmBtn.disabled = true;

                    const res = await TicketService.closeTicket(ticket.DocumentNo, resultText, hNormal, hOvertime);
                    if (res.success) {
                        modal.remove();
                        appToast("Ticket Closed Successfully!", 'success');
                        this.fetchData(true);
                    } else {
                        appAlert("Closure Failed", "Failed to close ticket. Please try again.", 'error');
                        confirmBtn.innerText = "Submit & Close";
                        confirmBtn.disabled = false;
                    }
                };
            };
        }
    }
}
