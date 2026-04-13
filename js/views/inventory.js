
import { InventoryService } from '../services/api.js';

export default class InventoryView {
    constructor() {
        this.items = [];
        this.searchQuery = '';
    }

    async render() {
        const container = document.createElement('div');
        container.className = 'view-inventory';
        this.container = container;

        container.innerHTML = `
            <div style="background:white; padding: 20px 24px 8px; border-bottom:1px solid var(--border-light); position:sticky; top:0; z-index:100;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                    <h1 class="header-lg" style="margin:0;">Stock List</h1>
                    <button id="refresh-stock" style="background:none; border:none; color:var(--primary-color); cursor:pointer;">
                        <span class="material-icons-round">sync</span>
                    </button>
                </div>
                
                <div style="background:var(--bg-body); border-radius:12px; padding:10px 16px; display:flex; align-items:center; gap:12px; margin-bottom:16px;">
                    <span class="material-icons-round" style="color:var(--text-tertiary);">search</span>
                    <input type="text" id="stock-search" placeholder="Search product or SKU..." style="border:none; background:none; outline:none; font-size:14px; width:100%; font-family:inherit;">
                </div>
            </div>

            <div id="stock-list" style="padding: 16px; min-height: 200px;">
                <div style="text-align:center; padding:40px; color:var(--text-tertiary);">
                    <div class="loader-spinner" style="margin:0 auto 16px;"></div>
                    Loading Inventory...
                </div>
            </div>
        `;

        this.applyEvents();
        this.fetchData();
        return container;
    }

    applyEvents() {
        const searchInput = this.container.querySelector('#stock-search');
        searchInput.oninput = (e) => {
            this.searchQuery = e.target.value;
            this.updateUI();
        };

        this.container.querySelector('#refresh-stock').onclick = () => this.fetchData(true);
    }

    async fetchData(force = false) {
        this.items = await InventoryService.getStock('', force);
        this.updateUI();
    }

    updateUI() {
        const list = this.container.querySelector('#stock-list');
        const filtered = InventoryService.filterStock(this.items, this.searchQuery);

        if (filtered.length === 0) {
            list.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-secondary);">No products found in stock.</div>`;
            return;
        }

        list.innerHTML = filtered.map((item, i) => `
            <div class="card animate-enter" style="animation-delay:${i * 0.05}s; margin-bottom:12px; padding:20px; border-radius:16px;">
                <div style="margin-bottom:8px;">
                    <span style="font-size:11px; font-weight:700; color:var(--text-tertiary); text-transform:uppercase; letter-spacing:0.5px;">${item.Value !== '-' ? item.Value : 'Stock Item'}</span>
                </div>
                <div style="font-weight:700; color:var(--text-primary); font-size:16px; line-height:1.4; margin-bottom:12px;">${item.Description || item.Name}</div>
                
                <div style="display:flex; align-items:center; gap:16px; padding-top:12px; border-top:1px solid #F1F5F9;">
                    <div style="color:#059669; font-weight:700; font-size:14px; display:flex; align-items:center; gap:4px;">
                        <span>Cost:</span>
                        <span style="font-size:16px;">${parseFloat(item.Price) > 0 ? parseFloat(item.Price).toFixed(3) : '0.000'}</span>
                    </div>
                    <div style="width:1px; height:14px; background:#E2E8F0;"></div>
                    <div style="color:#059669; font-weight:700; font-size:14px; display:flex; align-items:center; gap:4px;">
                        <span>Available:</span>
                        <span style="font-size:16px;">${parseInt(item.QtyOnHand) || 0}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }
}
