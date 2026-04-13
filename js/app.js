import AiChatView from './views/ai_chat.js';
import HomeView from './views/home.js';
import TicketsView from './views/tickets.js';
import CustomersView from './views/customers.js';
import InventoryView from './views/inventory.js';
import LoginView from './views/login.js';
import CallView from './views/call.js';
import LogsView from './views/logs.js';
import MenuView from './views/menu.js';
import OvertimeApprovalView from './views/overtime_approval.js';

class App {
    constructor() {
        this.router = new Router();
    }

    async init() {
        // --- Import UI Service for premium notifications ---
        await import('./services/ui.js');

        // --- FOREVER FIX: Versioning and Safety Boot ---
        const APP_VERSION = "1.0.8"; // Bump this to force clear everyone's stuck state
        const savedVersion = localStorage.getItem('artelco_app_version');

        if (savedVersion !== APP_VERSION) {
            console.warn("[App] Version mismatch. Clearing cache and resetting session.");
            localStorage.clear();
            localStorage.setItem('artelco_app_version', APP_VERSION);
            window.location.reload();
            return;
        }

        try {
            // Prevent default touch interactions
            document.addEventListener('dblclick', (e) => e.preventDefault());

            // Handle forced reset via URL if needed
            if (window.location.search.includes('force-reset')) {
                localStorage.clear();
                window.location.href = window.location.pathname;
                return;
            }

            // Import services to check auth
            const { AuthService } = await import('./services/api.js');
            const user = AuthService.getUser();

            this.startClock();

            if (user) {
                console.log("[Auth] Session found for", user.Name);
                try {
                    // Must finish before home: enriches ResUsersId (Odoo login id) so ticket queries use 108 not hr.employee 72.
                    await AuthService.initAppData();
                } catch (e) {
                    console.error("[App] Background init failed", e);
                }
                this.updateHeader(user.Name);
                await this.router.navigate('home');
            } else {
                await this.router.navigate('login');
            }
        } catch (fatalError) {
            console.error("[Fatal] App failed to boot. Emergency reset triggered.", fatalError);
            localStorage.removeItem('artelco_user');
            // If it keeps failing, we don't want an infinite reload loop 
            // but for now, a one-time clear usually fixes JS error-inducing state
            if (!window.location.search.includes('error')) {
                window.location.href = window.location.pathname + "?error=true";
            }
        }
    }

    startClock() {
        const updateTime = () => {
            const now = new Date();
            const dateStr = now.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
            const el = document.getElementById('header-date-time');
            if (el) el.innerText = dateStr;
        };
        updateTime();
        setInterval(updateTime, 60000); // Only needs to update daily really, but once per minute is safe
    }

    updateHeader(username) {
        const welcomeEl = document.getElementById('header-user-welcome');
        if (welcomeEl) {
            welcomeEl.innerText = username || 'User';
            welcomeEl.style.cursor = 'pointer';
            welcomeEl.style.padding = '8px 4px 8px 0'; // Increase click area
            welcomeEl.onclick = (e) => {
                e.preventDefault();
                console.log("[Nav] Profile click detected");
                if (this.router) this.router.navigate('menu');
            };
        }

        const logoutEl = document.getElementById('header-logout');
        if (logoutEl) {
            logoutEl.style.display = username ? 'flex' : 'none';
            logoutEl.onclick = async () => {
                const { AuthService } = await import('./services/api.js');
                if (await appConfirm("Logout", "Logout from ARTELCO?")) AuthService.logout();
            };
        }
    }
}

class Router {
    constructor() {
        this.routes = {
            'login': LoginView,
            'home': HomeView,
            'tickets': TicketsView,
            'ai-chat': AiChatView,
            'customers': CustomersView,
            'inventory': InventoryView,
            'menu': MenuView,
            'call': CallView,
            'logs': LogsView,
            'overtime-approval': OvertimeApprovalView
        };
        this.currentView = null;
        this.container = document.getElementById('view-container');
        this.dock = document.querySelector('.bottom-dock');
        this.header = document.getElementById('global-header');
    }

    async navigate(route) {
        const { AuthService } = await import('./services/api.js');
        const user = AuthService.getUser();

        // Update Header & Greet
        if (user && route !== 'login') {
            if (window.app && window.app.updateHeader) {
                window.app.updateHeader(user.Name);
            }
        }

        // Authorization Guard
        if (route !== 'login' && !AuthService.isAuthorized(route)) {
            console.warn(`[Auth] Blocked access to ${route}. Redirecting to safe route...`);
            if (route === 'home') return this.navigate('login');
            return this.navigate('home');
        }

        // Toggle Navbar & Dock Visibility
        if (route === 'login') {
            this.dock.style.display = 'none';
            this.header.style.display = 'none';
            this.container.style.paddingTop = '0';
            this.container.style.paddingBottom = '0';
        } else {
            this.dock.style.display = 'block';
            this.header.style.display = 'flex';
            this.container.style.paddingTop = '0';
            this.container.style.paddingBottom = 'calc(var(--nav-height) + 20px)';
        }

        // Special handling for views that want to hide elements (like AI Chat or Call)
        if (route === 'ai-chat' || route === 'call' || route === 'logs') {
            this.dock.style.display = 'none';
            this.header.style.display = 'none';
            this.container.style.paddingTop = '0';
            this.container.style.paddingBottom = '0';
        }

        // Dynamic Dock Reorganization
        this.updateDock(AuthService);

        // Update Nav State
        document.querySelectorAll('.nav-item').forEach(el => {
            el.classList.remove('active');
            if (el.dataset.view === route) el.classList.add('active');
        });

        // Load New View
        try {
            const ViewClass = this.routes[route];
            if (ViewClass) {
                this.container.innerHTML = '';
                const viewInstance = new ViewClass();
                this.currentView = viewInstance;
                const dom = await viewInstance.render();
                if (!dom) throw new Error(`View ${route} rendered nothing.`);
                dom.classList.add('animate-enter');
                this.container.appendChild(dom);
                if (viewInstance.afterRender) viewInstance.afterRender();
                this.container.scrollTop = 0;
            }
        } catch (renderError) {
            console.error(`[Router] Failed to render ${route}:`, renderError);
            this.container.innerHTML = `
                <div style="padding:40px; text-align:center;">
                    <span class="material-icons-round" style="font-size:48px; color:var(--danger); margin-bottom:16px;">error_outline</span>
                    <h2 class="header-lg">Something went wrong</h2>
                    <p class="text-secondary" style="margin-bottom:24px;">Failed to load this view.</p>
                    <button onclick="window.location.reload()" class="btn-primary" style="padding:12px 24px;">Reload App</button>
                    <button onclick="localStorage.clear(); window.location.reload();" style="margin-top:12px; background:none; border:none; color:var(--text-tertiary); font-size:12px; cursor:pointer; display:block; width:100%;">Clear All Cache & Reset</button>
                </div>
            `;
        }
    }

    updateDock(AuthService) {
        // Role check
        const user = AuthService.getUser();
        if (!user) return;

        const isTechnical = user.roles.some(r => ['1000031'].includes(r));
        const isSales = user.roles.some(r => ['1000020'].includes(r));
        const isAdmin = user.roles.some(r => ['0', '1000017', '1000036'].includes(r));

        const dockContent = this.dock.querySelector('.dock-content');

        // Buttons
        const btnHome = document.getElementById('nav-home');
        const btnTickets = document.getElementById('nav-tickets');
        const btnAI = this.dock.querySelector('.fab-wrapper');
        const btnStock = document.getElementById('nav-inventory');
        const btnClients = document.getElementById('nav-customers');
        const btnMenu = document.getElementById('nav-menu');
        if (btnMenu) btnMenu.style.display = 'none'; // Explicitly hide it

        // Reset visibility
        [btnHome, btnTickets, btnStock, btnClients, btnMenu, btnAI].forEach(b => { if (b) b.style.display = 'none'; });

        if (isAdmin || isSales) {
            // Show everything, normal order
            btnHome.style.display = 'flex';
            btnTickets.style.display = 'flex';
            btnAI.style.display = 'block';
            btnStock.style.display = 'flex';
            btnClients.style.display = 'flex';

            // Reorder for Sales/Admin if needed, but default is fine
            dockContent.appendChild(btnHome);
            dockContent.appendChild(btnTickets);
            dockContent.appendChild(btnAI);
            dockContent.appendChild(btnStock);
            dockContent.appendChild(btnClients);
        } else if (isTechnical) {
            // "left side home , middle the ai agent , most right tickets ."
            btnHome.style.display = 'flex';
            btnAI.style.display = 'block';
            btnTickets.style.display = 'flex';

            dockContent.innerHTML = ''; // Clear to reorder
            dockContent.appendChild(btnHome);
            dockContent.appendChild(btnAI);
            dockContent.appendChild(btnTickets);
        } else {
            // Default fallback
            btnHome.style.display = 'flex';
            dockContent.appendChild(btnHome);
        }
    }
}

window.app = new App();
window.app.init();
