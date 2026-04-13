
import { CustomerService, TicketService, STATUS_MAP } from '../services/api.js';

export default class CustomersView {
    constructor() {
        this.allClients = [];
        this.filteredClients = [];
        this.loading = true;
    }

    async render() {
        const container = document.createElement('div');
        container.className = 'view-customers';
        this.container = container;

        container.innerHTML = `
            <div style="background:var(--primary-color); padding: 20px 24px 24px; color:white; position:sticky; top:0; z-index:100;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                    <h1 class="header-lg" style="color:white; margin:0;">Customers</h1>
                    <button id="refresh-cust" style="background:none; border:none; color:white; cursor:pointer;">
                        <span class="material-icons-round">sync</span>
                    </button>
                </div>
                <div style="background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.2); border-radius:12px; padding:12px 16px; display:flex; align-items:center; gap:12px;">
                    <span class="material-icons-round" style="color:rgba(255,255,255,0.7);">search</span>
                    <input type="text" id="cust-search" placeholder="Search by name, ID, Arabic, or Sales Rep..." style="border:none; background:none; outline:none; font-size:15px; color:white; width:100%; font-family:inherit;">
                </div>
            </div>

            <div id="clients-list" style="padding: 24px;">
                <div style="text-align:center; padding:40px;">
                    <div class="loader-spinner" style="margin:0 auto; border-top-color:var(--primary-color);"></div>
                </div>
            </div>
        `;

        this.fetchData();
        return container;
    }

    async fetchData(force = false) {
        if (force) {
            const list = this.container.querySelector('#clients-list');
            list.innerHTML = '<div style="text-align:center; padding:40px;"><div class="loader-spinner" style="margin:0 auto;"></div></div>';
        }

        const { AuthService } = await import('../services/api.js');
        this.allClients = await CustomerService.fetchAllPartners(force);

        // Pre-resolve all Sales Rep names for searching
        const uniqueRepIds = [...new Set(this.allClients.map(c => c.SalesRep_ID).filter(id => id))];
        await Promise.all(uniqueRepIds.map(id => AuthService.getUserName(id)));

        // Attach resolved names to clients for fast filtering
        for (const client of this.allClients) {
            client._repName = (await AuthService.getUserName(client.SalesRep_ID)).toLowerCase();
        }

        this.filteredClients = this.allClients;
        this.loading = false;
        this.updateUI();

        // Triple Search Implementation (Name, ID, Rep)
        const searchInput = this.container.querySelector('#cust-search');
        searchInput.oninput = (e) => {
            const query = e.target.value.toLowerCase();
            this.filteredClients = this.allClients.filter(c => {
                const name = (c.Name || "").toLowerCase();
                const name2 = (c.Name2 || "").toLowerCase();
                const value = (c.Value || "").toLowerCase();
                const repName = c._repName || "";

                return name.includes(query) ||
                    name2.includes(query) ||
                    value.includes(query) ||
                    repName.includes(query);
            });
            this.updateUI();
        };

        const refreshBtn = this.container.querySelector('#refresh-cust');
        if (refreshBtn) refreshBtn.onclick = () => this.fetchData(true);
    }

    updateUI() {
        const list = this.container.querySelector('#clients-list');

        if (this.filteredClients.length === 0) {
            list.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-tertiary);">No customers found</div>`;
            return;
        }

        list.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                <h2 class="header-md" style="margin:0;">Accounts (${this.filteredClients.length})</h2>
                <span class="text-xs" style="color:var(--text-tertiary); font-weight:600;">Tap for History</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:16px;">
                ${this.filteredClients.map((c, i) => this.renderClientCard(c, i)).join('')}
            </div>
        `;

        list.querySelectorAll('.card').forEach(el => {
            el.onclick = () => this.showClientDetails(el.dataset.id);
        });
    }

    renderClientCard(c, index) {
        const balance = c.TotalOpenBalance || "0.00";
        const isActive = c.IsActive === 'Y';
        const rating = c.Rating || "Standard";
        const repName = c._repName || "Unassigned";

        return `
            <div class="card animate-enter" data-id="${c.C_BPartner_ID}" style="animation-delay:${(index < 20 ? index * 0.03 : 0)}s; padding:20px; cursor:pointer;">
                <div style="display:flex; gap:16px; align-items:start; margin-bottom:12px;">
                    <div style="width:48px; height:48px; min-width:48px; background:var(--primary-color)10; border-radius:14px; display:flex; align-items:center; justify-content:center; font-weight:700; color:var(--primary-color); font-size:18px;">
                        ${c.Name.substring(0, 1)}
                    </div>
                    <div style="flex:1;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <h3 style="margin:0; font-size:16px; font-weight:700; color:var(--text-primary);">${c.Name}</h3>
                            <div style="width:8px; height:8px; border-radius:50%; background:${isActive ? 'var(--success)' : 'var(--border-dark)'};"></div>
                        </div>
                        <div style="font-size:13px; color:var(--text-secondary); margin-top:2px;">${c.Name2 || ''}</div>
                        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">
                            <span style="font-size:10px; font-weight:700; background:#F3F4F6; color:var(--text-secondary); padding:2px 8px; border-radius:6px; border:1px solid var(--border-light);">ID: ${c.Value}</span>
                            <span style="font-size:10px; font-weight:700; background:#E0E7FF; color:#4338CA; padding:2px 8px; border-radius:6px; border:1px solid #C7D2FE;">Rep: ${repName}</span>
                            <span style="font-size:10px; font-weight:700; background:#FDF2F8; color:#BE185D; padding:2px 8px; border-radius:6px; border:1px solid #FCE7F3;">${rating}</span>
                        </div>
                    </div>
                </div>
                <div style="text-align:right;">
                    <div style="font-weight:700; font-size:14px; color:${parseFloat(balance) > 0 ? 'var(--danger)' : 'var(--success)'}">${balance} <span style="font-size:10px;">JOD</span></div>
                    <div class="text-xs" style="margin-top:4px;">Balance</div>
                </div>
            </div>
        `;
    }

    async showClientDetails(partnerId) {
        const client = this.allClients.find(c => c.C_BPartner_ID === partnerId);
        if (!client) return;

        // Resolve Sales Rep Name
        const { AuthService } = await import('../services/api.js');
        const salesRepName = await AuthService.getUserName(client.SalesRep_ID);

        const modal = document.createElement('div');
        modal.className = 'details-overlay animate-enter';
        modal.style = "position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:4000; display:flex; align-items:flex-end;";

        modal.innerHTML = `
            <div class="details-sheet animate-slide-up" style="background:white; width:100%; border-radius:24px 24px 0 0; padding:32px 24px 48px; max-height:90vh; overflow-y:auto;">
                <div style="width:40px; height:4px; background:#E5E7EB; border-radius:2px; margin: 0 auto 24px;"></div>
                
                <div style="text-align:center; margin-bottom:32px;">
                    <div style="width:64px; height:64px; background:var(--primary-color); border-radius:20px; display:flex; align-items:center; justify-content:center; color:white; font-size:24px; font-weight:700; margin: 0 auto 16px;">
                        ${client.Name.substring(0, 1)}
                    </div>
                    <h2 class="header-lg" style="margin:0;">${client.Name}</h2>
                    <p style="color:var(--text-secondary); margin:4px 0;">${client.Name2 || ''}</p>
                </div>

                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px; margin-bottom:32px;">
                    <div style="background:#F9FAFB; padding:16px; border-radius:16px;">
                        <div class="text-xs" style="color:var(--text-tertiary); font-weight:700; text-transform:uppercase;">Sales Rep</div>
                        <div style="font-weight:600; margin-top:4px;">${salesRepName}</div>
                    </div>
                    <div style="background:#F9FAFB; padding:16px; border-radius:16px;">
                        <div class="text-xs" style="color:var(--text-tertiary); font-weight:700; text-transform:uppercase;">Rating</div>
                        <div style="font-weight:600; margin-top:4px;">${client.Rating || 'Standard'}</div>
                    </div>
                </div>

                <h3 class="header-md" style="margin-bottom:16px;">Historical Requests (Global)</h3>
                <div id="partner-tickets" style="display:grid; gap:12px;">
                    <div style="text-align:center; padding:20px;"><div class="loader-spinner" style="margin:0 auto;"></div></div>
                </div>

                <button id="close-details" style="width:100%; margin-top:32px; padding:18px; background:#F3F4F6; border:none; border-radius:16px; font-weight:700; color:var(--text-secondary);">Close View</button>
            </div>
        `;

        document.body.appendChild(modal);
        modal.querySelector('#close-details').onclick = () => modal.remove();

        // Fetch Global Tickets for this Partner
        const tickets = await CustomerService.getPartnerTickets(partnerId);
        const ticketsEl = modal.querySelector('#partner-tickets');

        if (tickets.length === 0) {
            ticketsEl.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-tertiary); border:1px dashed var(--border-light); border-radius:12px;">No ticket history found.</div>`;
        } else {
            // Render tickets and resolve their rep names in parallel
            const ticketCards = await Promise.all(tickets.map(async t => {
                const status = String(t?.R_Status_Name || STATUS_MAP[String(t.R_Status_ID)] || 'Unknown');
                const norm = status.trim().toLowerCase();
                const isClosed = ['closed', 'done', 'final close', 'solved', 'cancelled', 'canceled'].includes(norm);
                const repName = await AuthService.getUserName(t.SalesRep_ID);

                return `
                    <div style="background:#F9FAFB; padding:16px; border-radius:12px; border:1px solid var(--border-light);">
                        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                            <span style="font-weight:700; color:var(--primary-color);">${t.DocumentNo}</span>
                            <span style="font-size:10px; font-weight:700; padding:2px 8px; border-radius:6px; background:${isClosed ? '#ECFDF5' : '#FEF2F2'}; color:${isClosed ? '#059669' : '#DC2626'}; text-transform:uppercase;">${status}</span>
                        </div>
                        <div style="font-size:13px; color:var(--text-primary); font-weight:500;">${t.Summary}</div>
                        <div style="display:flex; justify-content:space-between; margin-top:8px; font-size:11px; color:var(--text-tertiary);">
                            <span>Created: ${t.Created.split(' ')[0]}</span>
                            <span>Rep: ${repName}</span>
                        </div>
                    </div>
                `;
            }));
            ticketsEl.innerHTML = ticketCards.join('');
        }
    }
}
