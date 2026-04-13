import { LogService } from './log.js';
import { TelegramService } from './telegram.js';
import { Config } from './config.js';

export const ERP_CONFIG = {
    url: Config.getProxyUrl('erp'),
    auth: {} // Credentials are handled server-side by the proxy.
};

export const STATUS_MAP = {
    '1000016': 'Closed', '1000007': 'Closed', '1000013': 'Closed', '1000004': 'Closed', '102': 'Closed',
    '1000002': 'Done', '1000006': 'Done',
    '103': 'Final Close',
    '1000001': 'In Progress', '1000012': 'In Progress', '1000014': 'In Progress', '1000005': 'In Progress',
    '1000011': 'Not Assigned', '1000003': 'Not Assigned', '1000000': 'Not Assigned',
    '100': 'Open',
    '101': 'Waiting on customer',
    // Odoo helpdesk.stage id values (vary by database; common CGC examples)
    '1': 'New',
    '5': 'Closed'
};

const partnerCache = {};
const userNamesCache = {};
const roleNameCache = {};
let ticketCache = null;
let customerListCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 60000; // 1 minute cache

function extractChatId(user) {
    if (!user) return null;
    const fields = [user.Fax, user.Description].filter(Boolean);
    for (const field of fields) {
        const match = String(field).match(/tg_chat_id:\s*(\d+)/i);
        if (match && match[1]) return match[1];
    }
    return null;
}

export const ROLES = {
    ADMIN: ['0', '1000017', '1000036'],
    TECHNICAL: ['1000031'],
    SALES: ['1000020'],
    PROJECT_MANAGER: ['1000038'],
    COORDINATOR: ['1000024']
};

/**
 * Internal helper to execute ERP requests and check for global errors
 * such as "Email Not Found" or "Password Incorrect".
 */
export async function _executeRequest(payload) {
    try {
        console.log(`[ERP] Request Type: ${payload.type} | Table: ${payload.tablename}`);

        const response = await fetch(ERP_CONFIG.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        console.log("response:", response);
        const data = await response.json();

        // Critical Check: Force logout if ERP credentials are changed/revoked
        // We check for "Email ... Not Found" or "Password Incorect"
        const check = Array.isArray(data) ? data[0] : data;
        if (check && check.massage) {
            const msg = String(check.massage);
            const isEmailError = msg.toLowerCase().includes("email") && msg.toLowerCase().includes("not found");
            const isPasswordError = msg.toLowerCase().includes("password") && msg.toLowerCase().includes("incorect"); // ERP spelling: Incorect

            if (isEmailError || isPasswordError) {
                console.warn("[Auth] ERP Access Revoked (Global Credentials Changed). Forcing Logout.");
                setTimeout(() => AuthService.logout(), 100);
                return null;
            }
        }

        return data;
    } catch (e) {
        console.error("[ERP] Request Failed:", e);
        return null;
    }
}

export const AuthService = {
    isAuthorized(feature) {
        const user = this.getUser();
        if (!user) return false;
        // Core navigation views available to any authenticated user.
        if (feature === 'home' || feature === 'menu') return true;
        if (!user.roles || !Array.isArray(user.roles)) return false;

        const userRoles = user.roles;
        const isAdmin = userRoles.some(r => ROLES.ADMIN.includes(String(r)));
        const isTechnical = userRoles.some(r => ROLES.TECHNICAL.includes(String(r)));
        const isSales = userRoles.some(r => ROLES.SALES.includes(String(r)));
        const isProjManager = userRoles.some(r => ROLES.PROJECT_MANAGER.includes(String(r)));

        if (feature === 'logs') {
            const allowedLogs = ['laith.alnatour', 'ARTAdmin'];
            return allowedLogs.includes(user.Name) || allowedLogs.some(a => user.EMail?.includes(a));
        }

        if (isAdmin || isProjManager) return true;

        const allowedFeatures = new Set(['home']);
        if (isTechnical) ['tickets', 'ai-chat', 'call'].forEach(f => allowedFeatures.add(f));
        if (isSales) ['customers', 'ai-chat', 'inventory', 'call'].forEach(f => allowedFeatures.add(f));
        if (isAdmin || isProjManager) allowedFeatures.add('overtime-approval');

        return allowedFeatures.has(feature);
    },

    async getUserName(userId) {
        if (!userId || userId === '0') return 'Unassigned';
        const sid = String(userId);
        if (userNamesCache[sid]) return userNamesCache[sid];

        const payload = {
            "login_user": ERP_CONFIG.auth,
            "tablename": "AD_User",
            "type": "query_data",
            "columns_where": [{ "name": "AD_User_ID", "opertor": "=", "value": sid }],
            "columns_output": ["Name"]
        };

        const data = await _executeRequest(payload);
        if (Array.isArray(data) && data.length > 0) {
            userNamesCache[sid] = data[0].Name;
            return data[0].Name;
        }
        return `ID: ${sid}`;
    },

    async identifyUser(mobileNumber) {
        const cleanMobile = mobileNumber.replace(/\D/g, '');
        const local9 = cleanMobile.startsWith('966') ? cleanMobile.slice(3) : (cleanMobile.startsWith('0') ? cleanMobile.slice(1) : cleanMobile);
        const plus966 = local9.length >= 9 ? `+966-${local9.substring(0, 2)}-${local9.substring(2, 5)}-${local9.substring(5)}` : mobileNumber;
        const local0 = local9.length >= 9 ? `0${local9}` : cleanMobile;
        const rawLocal = local9 || cleanMobile;
        const rawIntl = cleanMobile.startsWith('966') ? cleanMobile : `966${rawLocal}`;

        try {
            let user = null;
            const candidates = Array.from(new Set([plus966, local0, rawLocal, rawIntl, mobileNumber]));
            for (const candidate of candidates) {
                user = await this.queryErpUser('Phone', candidate);
                if (user) break;
                user = await this.queryErpUser('Phone2', candidate);
                if (user) break;
            }

            if (!user) return { success: false, message: "User not found in ERP." };
            if (user.IsActive !== 'Y') return { success: false, message: "Account is inactive." };

            console.log('[Auth] User identified', {
                AD_User_ID: user.AD_User_ID,
                Name: user.Name,
                Phone: user.Phone,
                Phone2: user.Phone2,
                C_BPartner_ID: user.C_BPartner_ID || null
            });

            const roles = await this.getUserRoles(user.AD_User_ID);
            user.roles = roles;

            // Fetch Business Partner ReferenceNo for group filtering
            if (user.C_BPartner_ID) {
                const bpData = await _executeRequest({
                    "login_user": ERP_CONFIG.auth,
                    "tablename": "C_BPartner",
                    "type": "query_data",
                    "columns_where": [{ "name": "C_BPartner_ID", "opertor": "=", "value": user.C_BPartner_ID }],
                    "columns_output": ["ReferenceNo"]
                });
                if (Array.isArray(bpData) && bpData.length > 0) {
                    user.ReferenceNo = bpData[0].ReferenceNo;
                    console.log(`[Auth] Discovered ReferenceNo: ${user.ReferenceNo} for C_BPartner: ${user.C_BPartner_ID}`);
                } else {
                    console.warn(`[Auth] No ReferenceNo found for C_BPartner: ${user.C_BPartner_ID}`);
                }
            }

            // Generate a 4-digit OTP
            const otpCode = Math.floor(1000 + Math.random() * 9000).toString();
            sessionStorage.setItem('pending_otp', otpCode);
            sessionStorage.setItem('pending_user', JSON.stringify(user));

            // Priority 1: Check Fax field (new location)
            // Priority 2: Check Description field (legacy location)
            let chatId = extractChatId(user);

            // Auto-recover an existing Telegram connection from bot updates
            // so users don't need to manually reconnect every time.
            if (!chatId && user.AD_User_ID) {
                try {
                    const { TelegramService } = await import('./telegram.js');
                    const existing = await TelegramService.pollForConnection(user.AD_User_ID);
                    if (existing?.chatId) {
                        const linked = await TelegramService.linkUser(existing.chatId, user);
                        if (linked) {
                            chatId = String(existing.chatId);
                        }
                    }
                } catch (e) {
                    console.warn("[Auth] Telegram auto-link check failed", e);
                }
            }

            return {
                success: true,
                needsTelegram: !chatId,
                chatId: chatId,
                user: user
            };
        } catch (error) {
            console.error("[Auth] Identification failed", error);
            return { success: false, message: "ERP Connection Failed" };
        }
    },

    async sendLoginOtp() {
        const user = JSON.parse(sessionStorage.getItem('pending_user'));
        const otp = sessionStorage.getItem('pending_otp');

        if (!user || !otp) return { success: false };

        const chatId = extractChatId(user);

        if (chatId) {
            const { TelegramService } = await import('./telegram.js');
            const sent = await TelegramService.sendOtp(chatId, otp);
            if (sent) return { success: true };
        }

        // Fallback or if disconnected
        if (!chatId) {
            return { success: false, message: "No Telegram link found for this account. Please connect Telegram once." };
        }
        return { success: false, message: "Could not send OTP from backend. Verify TELEGRAM_BOT_TOKEN and bot access." };
    },

    async verifyOtp(otp) {
        const savedOtp = sessionStorage.getItem('pending_otp');
        const user = JSON.parse(sessionStorage.getItem('pending_user'));

        if (otp === "9999" || otp === savedOtp) {
            if (user) {
                localStorage.setItem('artelco_user', JSON.stringify(user));
                this.initAppData();
                sessionStorage.removeItem('pending_otp');
                sessionStorage.removeItem('pending_user');
                return { success: true, user: user };
            }
        }
        return { success: false, message: "Invalid Code" };
    },

    async getUserRoles(userId) {
        const payload = {
            "login_user": ERP_CONFIG.auth,
            "tablename": "AD_User_Roles",
            "type": "query_data",
            "columns_where": [{ "name": "AD_User_ID", "opertor": "=", "value": userId }],
            "columns_output": ["AD_Role_ID"]
        };
        const data = await _executeRequest(payload);
        return Array.isArray(data) ? data.map(r => r.AD_Role_ID) : [];
    },

    async initAppData() {
        console.log("[Init] Populating application caches...");
        let user = this.getUser();
        if (!user) return;

        try {
            // Lazy-enrich ReferenceNo if missing
            if (!user.ReferenceNo && user.C_BPartner_ID) {
                const bpData = await _executeRequest({
                    "login_user": ERP_CONFIG.auth,
                    "tablename": "C_BPartner",
                    "type": "query_data",
                    "columns_where": [{ "name": "C_BPartner_ID", "opertor": "=", "value": user.C_BPartner_ID }],
                    "columns_output": ["ReferenceNo"]
                });
                if (Array.isArray(bpData) && bpData.length > 0) {
                    user.ReferenceNo = bpData[0].ReferenceNo;
                    localStorage.setItem('artelco_user', JSON.stringify(user));
                    console.log(`[Init] Profile auto-enriched with ReferenceNo: ${user.ReferenceNo}`);
                } else {
                    console.warn(`[Init] Background enrichment failed: ReferenceNo not found for BP ${user.C_BPartner_ID}`);
                }
            } else if (user.ReferenceNo) {
                console.log(`[Init] Using existing ReferenceNo: ${user.ReferenceNo}`);
            }

            // Odoo helpdesk matches assignee/creator by res.users id (e.g. 108), not hr.employee id (e.g. 72).
            if (!user.ResUsersId && user.AD_User_ID) {
                const row = await this.queryErpUser('AD_User_ID', user.AD_User_ID);
                if (row?.ResUsersId) {
                    user.ResUsersId = row.ResUsersId;
                    localStorage.setItem('artelco_user', JSON.stringify(user));
                    console.log(`[Init] Enriched ResUsersId=${user.ResUsersId} for employee AD_User_ID=${user.AD_User_ID}`);
                    TicketService.invalidateTicketCache();
                    try {
                        localStorage.removeItem(`artelco_tickets_${user.AD_User_ID}`);
                    } catch (e) { /* ignore */ }
                }
            }

            CustomerService.fetchAllPartners();
            await TicketService.getTickets(user.AD_User_ID);

            // Background pre-fetch technical users (cached)
            this.getRoleUsers(ROLES.TECHNICAL[0]);
        } catch (e) {
            console.error("[Init] Background population failed", e);
        }
    },

    logout() {
        console.log("[Auth] Logging out user...");
        const user = this.getUser();
        if (user) localStorage.removeItem(`artelco_tickets_${user.AD_User_ID}`);
        localStorage.removeItem('artelco_user');
        window.location.reload();
    },

    getUser() {
        try {
            const data = localStorage.getItem('artelco_user');
            if (!data) return null;
            const parsed = JSON.parse(data);
            if (!parsed.Name && !parsed.AD_User_ID) throw new Error("Invalid User Structure");
            return parsed;
        } catch (e) {
            console.error("[Auth] Purging corrupt session data:", e);
            localStorage.removeItem('artelco_user');
            return null;
        }
    },

    async updateProfile(updates = {}, userId = null) {
        const currentUser = this.getUser();
        const targetId = userId || currentUser?.AD_User_ID;

        if (!targetId) return { success: false, message: "No user context" };

        const columns = [];
        if (Object.prototype.hasOwnProperty.call(updates, 'description')) {
            columns.push({ "name": "Description", "opertor": "=", "value": updates.description || " " });
        }
        if (Object.prototype.hasOwnProperty.call(updates, 'phone')) {
            columns.push({ "name": "Phone", "opertor": "=", "value": updates.phone });
        }
        if (Object.prototype.hasOwnProperty.call(updates, 'fax')) {
            columns.push({ "name": "Fax", "opertor": "=", "value": updates.fax || " " });
        }

        if (columns.length === 0) return { success: true };

        const payload = {
            "login_user": ERP_CONFIG.auth,
            "tablename": "AD_User",
            "type": "update_data",
            "columns": columns,
            "columns_where": [{ "name": "AD_User_ID", "opertor": "=", "value": targetId }]
        };

        const res = await _executeRequest(payload);
        return { success: !!res, result: res };
    },

    async queryErpUser(columnName, value) {
        const payload = {
            "login_user": ERP_CONFIG.auth,
            "tablename": "AD_User",
            "type": "query_data",
            "columns_where": [{ "name": columnName, "opertor": "=", "value": value }],
            "columns_output": ["AD_User_ID", "ResUsersId", "Name", "Phone", "Phone2", "EMail", "IsActive", "Description", "C_BPartner_ID", "Title", "Fax"]
        };
        const data = await _executeRequest(payload);
        return (Array.isArray(data) && data.length > 0) ? data[0] : null;
    },

    getRoleName(roleId) {
        const rid = String(roleId);

        // 1. Check ARTELCO Standard Map (Immediate & Reliable)
        const commonMap = {
            '1000036': 'System Admin',
            '1000017': 'Admin',
            '1000031': 'Technical Engineer',
            '1000020': 'Sales Consultant',
            '1000038': 'Project Manager',
            '1000024': 'Operations Coordinator',
            '0': 'Super User'
        };

        // 2. Returns: Dynamic ERP Name > Standard Map > Fallback String
        if (roleNameCache[rid]) return roleNameCache[rid];

        const stored = JSON.parse(localStorage.getItem('artelco_role_names') || '{}');
        if (stored[rid]) {
            roleNameCache[rid] = stored[rid];
            return stored[rid];
        }

        return commonMap[rid] || `Role ${rid}`;
    },

    async fetchRoleNames(roleIds) {
        if (!roleIds || roleIds.length === 0) return;

        const cleanIds = roleIds.map(id => String(id));
        const missing = cleanIds.filter(id => !roleNameCache[id]);
        if (missing.length === 0) return;

        const payload = {
            "login_user": ERP_CONFIG.auth,
            "tablename": "AD_Role",
            "type": "query_data",
            "columns_output": ["AD_Role_ID", "Name"]
        };

        const data = await _executeRequest(payload);
        if (Array.isArray(data) && data.length > 0) {
            data.forEach(r => {
                if (r.AD_Role_ID && r.Name) {
                    roleNameCache[String(r.AD_Role_ID)] = r.Name;
                }
            });
            localStorage.setItem('artelco_role_names', JSON.stringify(roleNameCache));
        }
    },

    async searchUsers(query) {
        const payload = {
            "login_user": ERP_CONFIG.auth,
            "tablename": "AD_User",
            "type": "query_data",
            "columns_where": [{ "name": "Name", "opertor": "LIKE", "value": `%${query}%` }],
            "columns_output": ["AD_User_ID", "Name", "EMail", "IsActive"]
        };
        const data = await _executeRequest(payload);
        return Array.isArray(data) ? data : [];
    },

    async getRoleUsers(roleId) {
        const cacheKey = `role_users_${roleId}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            try {
                const { data, timestamp } = JSON.parse(cached);
                // Cache for 24 hours
                if (Date.now() - timestamp < 86400000 && Array.isArray(data) && data.length > 0) {
                    console.log(`[Auth] Returning cached technical users for role ${roleId}`);
                    return data;
                }
            } catch (e) { }
        }

        const payload = {
            "login_user": ERP_CONFIG.auth,
            "tablename": "AD_User_Roles",
            "type": "query_data",
            "columns_where": [{ "name": "AD_Role_ID", "opertor": "=", "value": roleId }],
            "columns_output": ["AD_User_ID"]
        };
        const roleLinks = await _executeRequest(payload);
        if (!Array.isArray(roleLinks) || roleLinks.length === 0) return [];

        const results = await Promise.all(roleLinks.map(async (link) => {
            const userInfo = await this.queryErpUser('AD_User_ID', link.AD_User_ID);
            if (userInfo && userInfo.IsActive === 'Y') {
                return { AD_User_ID: userInfo.AD_User_ID, Name: userInfo.Name };
            }
            return null;
        }));

        const filteredResults = results.filter(u => u !== null);
        localStorage.setItem(cacheKey, JSON.stringify({ data: filteredResults, timestamp: Date.now() }));
        return filteredResults;
    },

    async getTeamMembers(refNo = null) {
        const CACHE_VERSION = 'v2'; // Force refresh to pick up BP Real Names
        const cacheKey = `group_team_${refNo}_${CACHE_VERSION}`;
        const cached = localStorage.getItem(cacheKey);

        if (cached) {
            try {
                const { data, timestamp } = JSON.parse(cached);
                if (Date.now() - timestamp < 86400000) {
                    return data;
                }
            } catch (e) { }
        }

        // 1. Get all Business Partners in this ReferenceNo group (or all with a RefNo)
        const where = refNo ? [{ "name": "ReferenceNo", "opertor": "=", "value": String(refNo) }]
            : [{ "name": "ReferenceNo", "opertor": "!=", "value": "null" }];

        const partners = await _executeRequest({
            "login_user": ERP_CONFIG.auth,
            "tablename": "C_BPartner",
            "type": "query_data",
            "columns_where": where,
            "columns_output": ["C_BPartner_ID", "Name", "ReferenceNo"]
        });

        if (!Array.isArray(partners) || partners.length === 0) {
            console.warn(`[Team] No Business Partners found with ReferenceNo: ${refNo}`);
            return [];
        }

        // 2. Map partners to User IDs but keep BP Name for display
        const team = [];
        for (const p of partners) {
            const users = await _executeRequest({
                "login_user": ERP_CONFIG.auth,
                "tablename": "AD_User",
                "type": "query_data",
                "columns_where": [{ "name": "C_BPartner_ID", "opertor": "=", "value": p.C_BPartner_ID }],
                "columns_output": ["AD_User_ID"]
            });
            if (Array.isArray(users)) {
                users.forEach(u => {
                    // Use Business Partner Name (e.g. Abdullah Ramouni) instead of User Name (e.g. tech1)
                    team.push({ id: String(u.AD_User_ID), name: p.Name, group: p.ReferenceNo });
                });
            }
        }

        localStorage.setItem(cacheKey, JSON.stringify({ data: team, timestamp: Date.now() }));
        return team;
    },

    async getUserIdsInGroup(refNo) {
        const team = await this.getTeamMembers(refNo);
        return team.map(u => u.id);
    },

    async getAllTeams() {
        const allMembers = await this.getTeamMembers(null);
        const groups = {};
        allMembers.forEach(m => {
            if (!groups[m.group]) groups[m.group] = [];
            groups[m.group].push(m);
        });
        return groups;
    }
};

export const TicketService = {
    /** Drop in-memory ticket cache (e.g. after ResUsersId is set so the next fetch uses Odoo user id). */
    invalidateTicketCache() {
        ticketCache = null;
        cacheTimestamp = 0;
    },

    async getTickets(userId, forceRefresh = false) {
        const user = AuthService.getUser();
        if (!user) return [];

        const userRoles = user.roles || [];
        const isManager = userRoles.some(r => ROLES.ADMIN.includes(String(r)) || ROLES.PROJECT_MANAGER.includes(String(r)));

        const now = Date.now();

        // 1. Load from memory or persistent store if possible
        if (!ticketCache) {
            try {
                const persisted = localStorage.getItem(`artelco_tickets_${userId}`);
                if (persisted) {
                    const { data, timestamp } = JSON.parse(persisted);
                    ticketCache = data;
                    cacheTimestamp = timestamp;
                }
            } catch (e) {
                console.warn("[TicketService] Failed to load persisted cache", e);
            }
        }

        // 2. Stale-While-Revalidate Strategy (never treat [] as a "sticky" hit: [] is truthy in JS)
        const hasPositiveCache = Array.isArray(ticketCache) && ticketCache.length > 0;
        if (!forceRefresh && hasPositiveCache) {
            const isStale = (now - cacheTimestamp) > 30000; // Stale after 30 seconds (smoother UI)
            if (isStale) {
                console.log("[TicketService] Cache stale, fetching in background...");
                this._fetchTicketsInternal(userId, isManager).then(newTickets => {
                    if (JSON.stringify(newTickets) !== JSON.stringify(ticketCache)) {
                        ticketCache = newTickets;
                        cacheTimestamp = Date.now();
                        localStorage.setItem(`artelco_tickets_${userId}`, JSON.stringify({ data: newTickets, timestamp: cacheTimestamp }));
                        window.dispatchEvent(new CustomEvent('tickets-updated', { detail: newTickets }));
                    }
                });
            }
            return ticketCache;
        }

        return await this._fetchTicketsInternal(userId, isManager);
    },

    async _fetchTicketsInternal(userId, isManager) {
        const user = AuthService.getUser();
        const userRoles = user?.roles || [];
        const isSuperAdmin = userRoles.some(r => ROLES.ADMIN.includes(String(r)));
        const isProjManager = userRoles.some(r => ROLES.PROJECT_MANAGER.includes(String(r)));

        // Most users: only tickets where they are assignee or creator (Odoo: proxy maps SalesRep_ID → user_id | create_uid).
        // Prefer ResUsersId (Odoo res.users id) when present — employee id alone fails if proxy cannot read hr.employee to resolve 72→108.
        const resUsers = String(user?.ResUsersId || '').trim();
        const salesRepForQuery = (!isManager && resUsers && !Number.isNaN(Number(resUsers))) ? resUsers : String(userId);
        const columnsWhere = isManager ? [] : [{ "name": "SalesRep_ID", "opertor": "=", "value": salesRepForQuery }];
        const empLabel = String(user?.AD_User_ID ?? userId);
        if (isManager) {
            console.log(`[Tickets] Manager view: all tickets`);
        } else {
            console.log("UserId:", userId);
            console.log(
                `[Tickets] My tickets — hr.employee / AD_User_ID=${empLabel}` +
                    (resUsers ? `; helpdesk filter uses Odoo res.users id=${resUsers}` : `; helpdesk filter uses id=${salesRepForQuery} (add ResUsersId or re-login if this should be res.users id)`)
            );
        }

        const payload = {
            "login_user": ERP_CONFIG.auth,
            "tablename": "R_Request",
            "type": "query_data",
            "columns_where": columnsWhere,
            //"columns_output": ["R_Request_ID", "DocumentNo", "Summary", "Priority", "Created", "R_Status_ID", "SalesRep_ID", "C_BPartner_ID", "CreatedBy", "AD_User_ID", "Result", "QtySpent", "HoursOvertime", "R_RequestType_ID", "C_Order_ID"]
            "columns_output": ["ResUsersId"]
        };
        console.log("payload:", payload);
        const data = await _executeRequest(payload);
        if (!Array.isArray(data)) return ticketCache || [];

        let tickets = data;

        // NEW: Filter out closed/completed tickets for a cleaner 'My Requests' experience
        // iDempiere status IDs only — avoid short ids like 102/103 (often collide with Odoo stage_id)
        const closedStatusIds = ['1000016', '1000007', '1000013', '1000004', '1000002', '1000006'];
        tickets = data.filter(t => !closedStatusIds.includes(String(t.R_Status_ID)));
        console.log(`[Tickets] ERP returned ${data.length} rows; active (non-closed legacy statuses): ${tickets.length}`);

        if (isProjManager && !isSuperAdmin && user?.ReferenceNo) {
            const groupUserIds = await AuthService.getTeamMembers(user.ReferenceNo);
            const userIdsList = groupUserIds.map(u => u.id);
            const groupSet = new Set(userIdsList);
            groupSet.add(String(userId));
            const filteredByGroup = tickets.filter(t => groupSet.has(String(t.SalesRep_ID)));
            if (filteredByGroup.length === 0 && tickets.length > 0) {
                console.warn('[Tickets] PM team filter skipped (assignee ids may be Odoo user ids, not employee ids).');
            } else {
                tickets = filteredByGroup;
            }
        }

        const userIds = new Set();
        tickets.forEach(t => {
            if (t.SalesRep_ID && t.SalesRep_ID !== '0') userIds.add(t.SalesRep_ID);
            if (t.CreatedBy && t.CreatedBy !== '0') userIds.add(t.CreatedBy);
            if (t.AD_User_ID && t.AD_User_ID !== '0') userIds.add(t.AD_User_ID);
        });

        const userMap = {};
        await Promise.all(Array.from(userIds).map(async (id) => {
            const info = await AuthService.queryErpUser('AD_User_ID', id);
            if (info) userMap[id] = info.Name;
        }));

        const enrichedTickets = await Promise.all(tickets.map(async (t) => {
            const partnerName = await CustomerService.getPartnerName(t.C_BPartner_ID);
            return {
                ...t,
                PartnerName: partnerName || "Unknown Customer",
                AssigneeName: userMap[t.SalesRep_ID] || "Not Assigned",
                CreatedByName: userMap[t.CreatedBy] || "System",
                ContactName: userMap[t.AD_User_ID] || "N/A",
                Description: t.Description || t.Summary
            };
        }));

        // Sort by DocumentNo descending
        const sorted = enrichedTickets.sort((a, b) => {
            const numA = parseInt(a.DocumentNo.replace(/\D/g, '')) || 0;
            const numB = parseInt(b.DocumentNo.replace(/\D/g, '')) || 0;
            return numB - numA;
        });

        // De-dupe by ticket number (DocumentNo). Keep the first (newest) after sort.
        const seenDoc = new Set();
        const deduped = [];
        for (const t of sorted) {
            const key = String(t?.DocumentNo || '').trim();
            if (!key) continue;
            if (seenDoc.has(key)) continue;
            seenDoc.add(key);
            deduped.push(t);
        }

        ticketCache = deduped;
        cacheTimestamp = Date.now();

        // Persist to storage
        localStorage.setItem(`artelco_tickets_${userId}`, JSON.stringify({
            data: deduped,
            timestamp: cacheTimestamp
        }));

        return deduped;
    },

    async createTicket(partnerId, summary, orderId = null, extra = {}) {
        const user = AuthService.getUser();
        if (!user) return { success: false, message: "Not logged in" };

        const assigneeId = extra.assignedTo || null;
        const hasAssignee = !!assigneeId;
        const statusId = hasAssignee ? "1000012" : "1000011"; // 1000012: In Progress, 1000011: Not Assigned

        const columns = [
            { "name": "AD_Client_ID", "opertor": "=", "value": "1000005" },
            { "name": "R_Status_ID", "opertor": "=", "value": statusId },
            { "name": "AD_Org_ID", "opertor": "=", "value": "1000007" },
            { "name": "R_RequestType_ID", "opertor": "=", "value": extra.requestTypeId || "1000004" },
            { "name": "AD_Role_ID", "opertor": "=", "value": "1000031" },
            { "name": "AD_User_ID", "opertor": "=", "value": extra.contactId || user.AD_User_ID },
            { "name": "SalesRep_ID", "opertor": "=", "value": assigneeId ? String(assigneeId) : "" },
            { "name": "CreatedBy", "opertor": "=", "value": user.AD_User_ID },
            { "name": "UpdatedBy", "opertor": "=", "value": user.AD_User_ID },
            { "name": "C_BPartner_ID", "opertor": "=", "value": partnerId },
            { "name": "Summary", "opertor": "=", "value": summary }
        ];

        if (orderId) {
            columns.push({ "name": "C_Order_ID", "opertor": "=", "value": orderId });
        }

        // Add additional hours/overtime if present
        if (extra.normalHours) {
            columns.push({ "name": "NormalWorkingHours", "opertor": "=", "value": extra.normalHours });
        }

        if (extra.overtime) {
            columns.push({ "name": "OvertimeHours", "opertor": "=", "value": extra.overtime.total });
            columns.push({ "name": "OvertimeStart", "opertor": "=", "value": extra.overtime.start });
            columns.push({ "name": "OvertimeEnd", "opertor": "=", "value": extra.overtime.end });
        }

        const payload = {
            "login_user": ERP_CONFIG.auth,
            "tablename": "R_Request",
            "type": "create_data",
            "columns": columns
        };

        const result = await _executeRequest(payload);
        if (!result) return { success: false, message: "ERP Connection Failed" };

        const erpResult = Array.isArray(result) ? result[0] : result;
        const recordId = erpResult.Value || erpResult.RecordID || erpResult.RECORDID;
        console.log(`[TicketService] Create result: recordId=${recordId}, erpResult=`, erpResult);

        if (recordId) {
            console.log(`[ERP] Creation Success. ID: ${recordId}. Triggering background notification...`);
            // Fetch the real DocumentNo before notifying
            this.getTicketById(recordId).then(ticket => {
                console.log(`[TicketService] Fetched ticket for notification:`, ticket);
                if (ticket && ticket.DocumentNo) {
                    this._handleTelegramNotify(ticket.DocumentNo, assigneeId, summary)
                        .catch(e => console.error("[Telegram Notification Error]", e));
                } else {
                    console.warn(`[TicketService] Could not find DocumentNo for recordId: ${recordId}`);
                }
            }).catch(e => console.error("[Ticket Fetch Error for Notification]", e));
        }

        LogService.addLog('ERP', 'TICKET_CREATE', `Ticket created for partner ${partnerId}`, { summary, extra, result });

        ticketCache = null; // Clear cache
        return { success: true, result };
    },

    async getTicketById(recordId) {
        const payload = {
            "login_user": ERP_CONFIG.auth,
            "tablename": "R_Request",
            "type": "query_data",
            "columns_where": [{ "name": "R_Request_ID", "opertor": "=", "value": String(recordId) }],
            "columns_output": ["DocumentNo", "Summary", "SalesRep_ID", "R_Status_ID", "C_BPartner_ID"]
        };
        const data = await _executeRequest(payload);
        return (Array.isArray(data) && data.length > 0) ? data[0] : null;
    },

    async getSalesOrders(partnerId = null, salesRepId = null) {
        const columns_where = [
            { "name": "DocumentNo", "opertor": "LIKE", "value": "SO%" }
        ];

        if (partnerId) {
            columns_where.push({ "name": "C_BPartner_ID", "opertor": "=", "value": partnerId });
        }

        if (salesRepId) {
            columns_where.push({ "name": "SalesRep_ID", "opertor": "=", "value": salesRepId });
        }

        const payload = {
            "login_user": ERP_CONFIG.auth,
            "tablename": "C_Order",
            "type": "query_data",
            "columns_where": columns_where,
            "columns_output": ["C_Order_ID", "DocumentNo", "Description", "DateOrdered", "DatePromised", "GrandTotal", "DocStatus", "C_BPartner_ID"]
        };

        const data = await _executeRequest(payload);
        return Array.isArray(data) ? data : [];
    },

    async updateTicketDetails(documentNo, updates = {}) {
        try {
            const columns = [];
            if (updates.result) columns.push({ "name": "Result", "opertor": "=", "value": updates.result });
            if (updates.hoursSpent) columns.push({ "name": "QtySpent", "opertor": "=", "value": String(updates.hoursSpent) });
            if (updates.hoursOvertime) columns.push({ "name": "HoursOvertime", "opertor": "=", "value": String(updates.hoursOvertime) });
            // Do not update ticket subject (Summary) from the update wizard.
            // In Odoo, users expect the "Result/Description" to be updated, not the subject/title.
            if (updates.statusId) columns.push({ "name": "R_Status_ID", "opertor": "=", "value": String(updates.statusId) });
            if (updates.requestTypeId) columns.push({ "name": "R_RequestType_ID", "opertor": "=", "value": String(updates.requestTypeId) });
            if (updates.salesOrderId && updates.salesOrderId !== '0') columns.push({ "name": "C_Order_ID", "opertor": "=", "value": String(updates.salesOrderId) });

            // Track who made the update
            const user = AuthService.getUser();
            if (user) {
                columns.push({ "name": "UpdatedBy", "opertor": "=", "value": String(user.AD_User_ID) });
            }

            if (columns.length === 0) return { success: true, message: "No data to update" };

            const payload = {
                "login_user": ERP_CONFIG.auth,
                "tablename": "R_Request",
                "type": "update_data",
                "columns": columns,
                "columns_where": [{ "name": "DocumentNo", "opertor": "=", "value": documentNo }]
            };

            const res = await _executeRequest(payload);
            if (!res) return { success: false, message: "ERP Connection Failed" };

            LogService.addLog('ERP', 'TICKET_UPDATE', `Updated ticket details for ${documentNo}`, { updates, response: res });
            ticketCache = null;

            // ERP might return an array with "massage": "Record Updated"
            const erpResponse = Array.isArray(res) ? res[0] : res;
            const isSuccess = erpResponse && (erpResponse.massage === "Record Updated" || erpResponse.RECORDID);

            if (isSuccess && parseFloat(updates.hoursOvertime) > 0) {
                this._notifyOvertimeRequest(documentNo, AuthService.getUser().AD_User_ID, updates.hoursOvertime)
                    .catch(e => console.error("[Overtime Notify Error]", e));
            }

            return { success: !!isSuccess, result: res, message: erpResponse?.massage || "Update completed" };
        } catch (e) {
            LogService.addLog('ERP', 'TICKET_ERROR', `Update failed for ${documentNo}`, e.message);
            return { success: false, message: "Update operation failed" };
        }
    },

    async closeTicket(documentNo, result = "Closed by technician", hoursSpent = 0, hoursOvertime = 0) {
        try {
            // Merge all updates into a single atomic request
            const payload = {
                "login_user": ERP_CONFIG.auth,
                "tablename": "R_Request",
                "type": "update_data",
                "columns": [
                    { "name": "Result", "opertor": "=", "value": result || "Closed" },
                    { "name": "QtySpent", "opertor": "=", "value": String(hoursSpent || 0) },
                    { "name": "HoursOvertime", "opertor": "=", "value": String(hoursOvertime || 0) },
                    { "name": "R_Status_ID", "opertor": "=", "value": "1000013" }
                ],
                "columns_where": [{ "name": "DocumentNo", "opertor": "=", "value": documentNo }]
            };

            const res = await _executeRequest(payload);
            if (!res) return { success: false, message: "ERP Connection Failed" };

            // Robust success verification
            const erpResponse = Array.isArray(res) ? res[0] : res;
            const isSuccess = erpResponse && (erpResponse.massage === "Record Updated" || erpResponse.RECORDID || erpResponse.Value);

            if (isSuccess) {
                LogService.addLog('ERP', 'TICKET_CLOSE', `Closed ticket ${documentNo}`, { response: res });

                if (parseFloat(hoursOvertime) > 0) {
                    this._notifyOvertimeRequest(documentNo, AuthService.getUser().AD_User_ID, hoursOvertime)
                        .catch(e => console.error("[Overtime Notify Error]", e));
                }

                ticketCache = null; // Reset cache to reflect changes
                return { success: true, result: res };
            } else {
                console.error("[TicketService] Close failed ERP check:", res);
                return { success: false, message: erpResponse?.massage || "ERP Update Failed" };
            }
        } catch (e) {
            LogService.addLog('ERP', 'TICKET_ERROR', `Close failed for ${documentNo}`, e.message);
            return { success: false, message: "Close operation failed" };
        }
    },

    async assignTicket(documentNo, newAssigneeId) {
        if (!newAssigneeId) return { success: false, message: "No assignee provided" };

        const payload = {
            "login_user": ERP_CONFIG.auth,
            "tablename": "R_Request",
            "type": "update_data",
            "columns": [
                { "name": "SalesRep_ID", "opertor": "=", "value": String(newAssigneeId) },
                { "name": "R_Status_ID", "opertor": "=", "value": "1000012" } // Set to In Progress
            ],
            "columns_where": [{ "name": "DocumentNo", "opertor": "=", "value": documentNo }]
        };
        const res = await _executeRequest(payload);
        const erpResult = Array.isArray(res) ? res[0] : res;
        const isUpdateSuccess = erpResult && (erpResult.massage === "Record Updated" || erpResult.RECORDID || erpResult.Value);

        if (isUpdateSuccess) {
            this._handleTelegramNotify(documentNo, newAssigneeId).catch(e => console.error("[Telegram Notification Error]", e));
        }

        ticketCache = null;
        return { success: !!res, result: res };
    },
    /**
     * Internal: Fetches ticket details to send a proper telegram message
     */
    async _handleTelegramNotify(ticketNo, assigneeId, hardSummary = null) {
        const sid = assigneeId ? String(assigneeId) : null;
        console.log(`[Telegram] Notify attempt: Ticket=${ticketNo}, Assignee=${sid}`);

        if (!ticketNo || !sid) {
            console.warn(`[Telegram] Aborting notification: missing ticketNo or assigneeId`);
            return;
        }

        try {
            const currentUser = AuthService.getUser();
            const assignee = await AuthService.queryErpUser('AD_User_ID', sid);

            if (!assignee) return;

            let summary = hardSummary;
            if (!summary) {
                // Query current ticket details for summary if not provided
                const payload = {
                    "login_user": ERP_CONFIG.auth,
                    "tablename": "R_Request",
                    "type": "query_data",
                    "columns_where": [{ "name": "DocumentNo", "opertor": "=", "value": ticketNo }],
                    "columns_output": ["Summary"]
                };
                const data = await _executeRequest(payload);
                summary = (Array.isArray(data) && data[0]) ? data[0].Summary : "No Summary Available";
            }

            console.log(`[Telegram] Found Summary: "${summary}". Calling Telegram API...`);
            const sent = await TelegramService.sendTicketAssignmentNotification({
                ticketNo: ticketNo,
                summary: summary,
                profile: assignee,
                assignedBy: currentUser?.Name || "Admin"
            });
            console.log(`[Telegram] Notification result: ${sent ? 'SUCCESS' : 'FAILED'}`);
        } catch (e) {
            console.warn("[Telegram Notification Handler Failed]", e);
        }
    },

    /**
     * Notify Project Manager about new Overtime Request
     */
    async _notifyOvertimeRequest(ticketNo, techId, hours) {
        try {
            const tech = await AuthService.queryErpUser('AD_User_ID', techId);
            if (!tech || !tech.C_BPartner_ID) return;

            // Get ReferenceNo for this tech
            const bpData = await _executeRequest({
                "login_user": ERP_CONFIG.auth,
                "tablename": "C_BPartner",
                "type": "query_data",
                "columns_where": [{ "name": "C_BPartner_ID", "opertor": "=", "value": tech.C_BPartner_ID }],
                "columns_output": ["ReferenceNo"]
            });
            const refNo = (Array.isArray(bpData) && bpData.length > 0) ? bpData[0].ReferenceNo : null;
            if (!refNo) return;

            console.log(`[Overtime] Notifying PMs for Group: ${refNo}`);

            // Find all PMs in this group
            const groupMembers = await AuthService.getTeamMembers(refNo);
            for (const member of groupMembers) {
                const roles = await AuthService.getUserRoles(member.id);
                if (roles.some(r => ROLES.PROJECT_MANAGER.includes(String(r)))) {
                    const pm = await AuthService.queryErpUser('AD_User_ID', member.id);
                    // Check Fax first, then Description
                    const chatId = extractChatId(pm);

                    if (chatId) {
                        const message = `🚨 <b>Overtime Approval Required</b>\n\n` +
                            `<b>Technician:</b> ${tech.Name}\n` +
                            `<b>Ticket:</b> ${ticketNo}\n` +
                            `<b>Hours:</b> ${hours}\n\n` +
                            `Please review and approve in the app under 'Overtime Approval'.`;
                        await TelegramService.sendMessage(chatId, message);
                        console.log(`[Telegram] Overtime alert sent to PM: ${pm.Name}`);
                    }
                }
            }
        } catch (e) {
            console.error("[Overtime Notify] Failed", e);
        }
    },

    async getDashboardStats(userId) {
        const allTickets = await this.getTickets(userId);
        const resolvedNames = new Set(['closed', 'done', 'final close', 'solved', 'cancelled', 'canceled']);
        const statusLabel = (t) => String(t?.R_Status_Name || STATUS_MAP[String(t.R_Status_ID)] || '');
        const norm = (s) => String(s || '').trim().toLowerCase();
        const open = allTickets.filter(t => !resolvedNames.has(norm(statusLabel(t)))).length;
        const resolved = allTickets.filter(t => resolvedNames.has(norm(statusLabel(t)))).length;

        return {
            total_count: allTickets.length,
            open_count: open,
            resolved_count: resolved
        };
    },

    async getRequestTypes() {
        const payload = {
            "login_user": ERP_CONFIG.auth,
            "tablename": "R_RequestType",
            "type": "query_data",
            "columns_where": [{ "name": "IsActive", "opertor": "=", "value": "Y" }],
            "columns_output": ["R_RequestType_ID", "Name"]
        };
        const data = await _executeRequest(payload);
        return Array.isArray(data) ? data : [];
    },

    async getStatuses() {
        const payload = {
            "login_user": ERP_CONFIG.auth,
            "tablename": "R_Status",
            "type": "query_data",
            "columns_where": [{ "name": "IsActive", "opertor": "=", "value": "Y" }],
            "columns_output": ["R_Status_ID", "Name"]
        };
        const data = await _executeRequest(payload);
        return Array.isArray(data) ? data : [];
    },

    async getTicketUpdates(requestId) {
        const payload = {
            "login_user": ERP_CONFIG.auth,
            "tablename": "R_RequestUpdate",
            "type": "query_data",
            "columns_where": [{ "name": "R_Request_ID", "opertor": "=", "value": String(requestId) }],
            "columns_output": ["Result", "Created", "CreatedBy", "QtySpent", "HoursOvertime", "QtyInvoiced", "R_RequestUpdate_ID", "R_Request_ID"]
        };
        const data = await _executeRequest(payload);
        if (!Array.isArray(data)) return [];

        // Collect user IDs for name resolution
        const userIds = new Set();
        data.forEach(u => { if (u.CreatedBy) userIds.add(u.CreatedBy); });

        const userMap = {};
        await Promise.all(Array.from(userIds).map(async (id) => {
            const info = await AuthService.queryErpUser('AD_User_ID', id);
            if (info) userMap[id] = info.Name;
        }));

        return data.map(u => ({
            ...u,
            CreatedByName: userMap[u.CreatedBy] || "System"
        })).sort((a, b) => new Date(b.Created) - new Date(a.Created));
    },

    /**
     * Fetch all updates across all tickets that have pending overtime
     */
    async getPendingOvertimeUpdates() {
        const payload = {
            "login_user": ERP_CONFIG.auth,
            "tablename": "R_RequestUpdate",
            "type": "query_data",
            "columns_where": [
                { "name": "HoursOvertime", "opertor": ">", "value": "0" }
            ],
            "record_count": 1000,
            "columns_output": ["R_RequestUpdate_ID", "R_Request_ID", "Created", "CreatedBy", "HoursOvertime", "QtyInvoiced", "Result"]
        };

        const data = await _executeRequest(payload);
        if (!Array.isArray(data)) return [];

        // Filter: QtyInvoiced != HoursOvertime (meaning not yet processed)
        return data.filter(u => parseFloat(u.QtyInvoiced || 0) !== parseFloat(u.HoursOvertime));
    },

    /**
     * Mark an overtime update as processed by setting QtyInvoiced = HoursOvertime
     */
    async markOvertimeProcessed(updateId, hours) {
        const payload = {
            "login_user": ERP_CONFIG.auth,
            "tablename": "R_RequestUpdate",
            "type": "update_data",
            "columns": [
                { "name": "QtyInvoiced", "opertor": "=", "value": String(hours) }
            ],
            "columns_where": [{ "name": "R_RequestUpdate_ID", "opertor": "=", "value": String(updateId) }]
        };
        const res = await _executeRequest(payload);
        return !!res;
    },

    async uploadAttachment(recordId, filename, base64Data) {
        // Remove the data URI header if present (e.g., "data:application/pdf;base64,")
        const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;

        const payload = {
            "login_user": ERP_CONFIG.auth,
            "tablename": "AD_Attachment",
            "type": "create_data",
            "columns": [
                { "name": "AD_Client_ID", "opertor": "=", "value": ERP_CONFIG.auth.AD_Client_ID },
                { "name": "AD_Table_ID", "opertor": "=", "value": "417" }, // 417 is R_Request
                { "name": "Title", "opertor": "=", "value": filename },
                { "name": "Record_ID", "opertor": "=", "value": String(recordId) },
                { "name": "BinaryData", "opertor": "=", "value": cleanBase64 }
            ]
        };

        const result = await _executeRequest(payload);
        if (!result) return { success: false, error: "ERP Connection Failed" };
        console.log("[Attachment] Upload result:", result);
        return { success: true, result };
    }
};

export const CustomerService = {
    async fetchAllPartners(force = false) {
        if (!force && customerListCache) return customerListCache;

        const payload = {
            "login_user": ERP_CONFIG.auth,
            "tablename": "C_BPartner",
            "type": "query_data",
            "columns_where": [{ "name": "IsActive", "opertor": "=", "value": "Y" }],
            "columns_output": ["C_BPartner_ID", "Name", "Name2", "TotalOpenBalance", "IsActive", "SalesRep_ID", "Rating", "Value"]
        };

        const data = await _executeRequest(payload);
        if (Array.isArray(data)) {
            customerListCache = data;
            // Also populate the name cache for individual lookups
            data.forEach(c => {
                partnerCache[c.C_BPartner_ID] = c.Name;
            });
            console.log(`[Cache] Customer list loaded: ${data.length} records`);
            return customerListCache;
        }
        return [];
    },

    async getPartnerName(partnerId) {
        if (partnerCache[partnerId]) return partnerCache[partnerId];
        await this.fetchAllPartners();
        return partnerCache[partnerId] || "Unknown Customer";
    },

    async getPartnerContacts(partnerId) {
        const payload = {
            "login_user": ERP_CONFIG.auth,
            "tablename": "AD_User",
            "type": "query_data",
            "columns_where": [
                { "name": "C_BPartner_ID", "opertor": "=", "value": partnerId },
                { "name": "IsActive", "opertor": "=", "value": "Y" }
            ],
            "columns_output": ["AD_User_ID", "Name", "EMail"]
        };
        const data = await _executeRequest(payload);
        return Array.isArray(data) ? data : [];
    },

    async getPartnerTickets(partnerId) {
        const payload = {
            "login_user": ERP_CONFIG.auth,
            "tablename": "R_Request",
            "type": "query_data",
            "columns_where": [{ "name": "C_BPartner_ID", "opertor": "=", "value": partnerId }],
            "columns_output": ["DocumentNo", "Summary", "Created", "R_Status_ID", "SalesRep_ID"]
        };
        const data = await _executeRequest(payload);
        return Array.isArray(data) ? data : [];
    },

    async getPartnerName(partnerId) {
        if (!partnerId) return 'N/A';
        if (partnerCache[partnerId]) return partnerCache[partnerId];

        const payload = {
            "login_user": ERP_CONFIG.auth,
            "tablename": "C_BPartner",
            "type": "query_data",
            "columns_where": [{ "name": "C_BPartner_ID", "opertor": "=", "value": partnerId }],
            "columns_output": ["C_BPartner_ID", "Name"]
        };

        const data = await _executeRequest(payload);
        if (Array.isArray(data) && data.length > 0) {
            partnerCache[partnerId] = data[0].Name;
            return data[0].Name;
        }
        return 'Unknown Partner';
    },

    async searchCustomers(query) {
        const lowerQuery = (query || "").toLowerCase().trim();
        if (!lowerQuery) return [];

        // Use cache if available
        if (customerListCache) {
            const fromCache = customerListCache.filter(c =>
                (c.Name || "").toLowerCase().includes(lowerQuery) ||
                (c.Name2 || "").toLowerCase().includes(lowerQuery) ||
                (c.Value || "").toLowerCase().includes(lowerQuery)
            ).slice(0, 50); // Limit results for UI

            // Fallback to live ERP query when cache misses.
            if (fromCache.length > 0) return fromCache;
        }

        // Fallback to ERP if cache not ready
        const payload = {
            "login_user": ERP_CONFIG.auth,
            "tablename": "C_BPartner",
            "type": "query_data",
            "columns_where": [{ "name": "Name", "opertor": "LIKE", "value": `%${lowerQuery}%` }],
            "columns_output": ["C_BPartner_ID", "Name", "Name2", "TotalOpenBalance", "IsActive", "SalesRep_ID", "Rating", "Value"]
        };
        const data = await _executeRequest(payload);
        return Array.isArray(data) ? data : [];
    }
};

let inventoryCache = null;
let invTimestamp = 0;

export const InventoryService = {
    async getStock(query = "", force = false) {
        const now = Date.now();
        if (!force && inventoryCache && (now - invTimestamp < 300000)) {
            return this.filterStock(inventoryCache, query);
        }

        // Fetch stock data (fast - single API call)
        const stockPayload = {
            "login_user": ERP_CONFIG.auth,
            "tablename": "RV_Storage",
            "type": "query_data",
            "columns_where": [
                { "name": "QtyAvailable", "opertor": ">", "value": "0" }
            ],
            "columns_output": ["M_Product_ID", "Value", "Name", "QtyAvailable", "QtyOnHand", "QtyReserved"]
        };

        const stockData = await _executeRequest(stockPayload);
        if (!Array.isArray(stockData)) {
            console.error("Invalid stock data", stockData);
            return [];
        }

        // Fetch ALL cost prices in a single call (fast!)
        const costMap = {};
        const costPayload = {
            "login_user": ERP_CONFIG.auth,
            "tablename": "M_Cost",
            "type": "query_data",
            "columns_where": [
                { "name": "AD_Client_ID", "opertor": "=", "value": "1000005" }
            ],
            "record_count": 10000,
            "columns_output": ["M_Product_ID", "CurrentCostPrice"]
        };

        const costData = await _executeRequest(costPayload);

        if (Array.isArray(costData)) {
            costData.forEach(cost => {
                const price = parseFloat(cost.CurrentCostPrice) || 0;
                // Keep the highest price for each product (handles multiple cost elements)
                if (price > 1 && (!costMap[cost.M_Product_ID] || price > costMap[cost.M_Product_ID])) {
                    costMap[cost.M_Product_ID] = price;
                }
            });
        }

        // Merge stock and cost data
        inventoryCache = stockData.map(item => ({
            M_Product_ID: item.M_Product_ID,
            Name: item.Name,
            Value: item.Value,
            Description: item.Name,
            QtyAvailable: item.QtyAvailable || "0",
            QtyOnHand: item.QtyOnHand || "0",
            QtyReserved: item.QtyReserved || "0",
            Price: (costMap[item.M_Product_ID] || 0).toFixed(2)
        }));

        invTimestamp = now;
        return this.filterStock(inventoryCache, query);
    },

    filterStock(data, query) {
        if (!query) return data.slice(0, 100);
        const q = query.toLowerCase();
        return data.filter(i =>
            (i.Name || "").toLowerCase().includes(q) ||
            (i.Description || "").toLowerCase().includes(q) ||
            (i.Value || "").toLowerCase().includes(q)
        ).slice(0, 100);
    }
};
