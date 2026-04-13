function toLegacyWhere(where = []) {
    if (!Array.isArray(where)) return [];
    return where
        .filter(w => w && w.name && w.opertor)
        .map(w => [w.name, w.opertor, w.value]);
}

function mapOdooOperator(op) {
    const raw = String(op || '=').trim().toUpperCase();
    if (raw === 'LIKE') return 'ilike';
    if (raw === 'NOT LIKE') return 'not ilike';
    return String(op || '=').trim();
}

function maybeMany2OneId(v) {
    return Array.isArray(v) ? v[0] : v;
}

function mapUserToLegacy(user) {
    const linkedUser = maybeMany2OneId(user.user_id);
    return {
        AD_User_ID: String(user.id ?? ''),
        ResUsersId: linkedUser != null ? String(linkedUser) : '',
        Name: user.name || '',
        Phone: user.phone || '',
        Phone2: user.mobile || '',
        EMail: user.email || '',
        IsActive: user.active ? 'Y' : 'N',
        Description: user.comment || '',
        C_BPartner_ID: String(maybeMany2OneId(user.parent_id) || ''),
        Title: '',
        Fax: user.function || ''
    };
}

/** Fields readable without HR Officer ACL on many Odoo DBs (avoid address_home_id, notes). */
const HR_EMPLOYEE_READ_FIELDS = ['id', 'name', 'work_phone', 'mobile_phone', 'work_email', 'active', 'job_title', 'user_id'];

function mapEmployeeToLegacy(emp, cBPartnerId = '') {
    const resUsersId = maybeMany2OneId(emp.user_id);
    return {
        AD_User_ID: String(emp.id ?? ''),
        ResUsersId: resUsersId != null ? String(resUsersId) : '',
        Name: emp.name || '',
        Phone: emp.work_phone || '',
        Phone2: emp.mobile_phone || '',
        EMail: emp.work_email || '',
        IsActive: emp.active ? 'Y' : 'N',
        Description: emp.notes || '',
        C_BPartner_ID: String(cBPartnerId || ''),
        Title: emp.job_title || '',
        Fax: ''
    };
}

async function partnerIdsForEmployeeUsers(url, auth, uid, employeeRows) {
    const userIds = [...new Set((employeeRows || []).map((e) => {
        const id = maybeMany2OneId(e.user_id);
        const n = id != null ? Number(id) : NaN;
        return Number.isFinite(n) && n > 0 ? n : null;
    }).filter(Boolean))];
    if (userIds.length === 0) return new Map();
    const users = await odooExecuteKw(url, auth, uid, 'res.users', 'search_read', [[['id', 'in', userIds]]], {
        fields: ['id', 'partner_id'],
        limit: Math.min(500, userIds.length)
    });
    const map = new Map();
    for (const u of users || []) {
        const pid = maybeMany2OneId(u.partner_id);
        if (pid) map.set(u.id, String(pid));
    }
    return map;
}

function mapEmployeesWithPartners(employees, partnerByUserId) {
    return (employees || []).map((e) => {
        const uidPart = maybeMany2OneId(e.user_id);
        const pid = uidPart != null ? partnerByUserId.get(Number(uidPart)) : '';
        return mapEmployeeToLegacy(e, pid || '');
    });
}

function buildEmployeeDomain(where = []) {
    if (!Array.isArray(where) || where.length === 0) return [];

    // Login uses AD_User queries by Phone/Phone2; search both employee phone fields.
    if (where.length === 1 && where[0]?.name && where[0]?.opertor && ['Phone', 'Phone2'].includes(where[0].name)) {
        const rawValue = String(where[0].value ?? '');
        const digits = rawValue.replace(/\D/g, '');
        const tail = digits.length > 7 ? digits.slice(-7) : digits;
        const needle = tail || rawValue;
        return ['|', ['work_phone', 'ilike', needle], ['mobile_phone', 'ilike', needle]];
    }

    const mapped = [];
    where.forEach(w => {
        const op = mapOdooOperator(w?.opertor || '=');
        const value = w?.value;
        switch (w?.name) {
            case 'AD_User_ID':
                mapped.push(['id', op, value]);
                break;
            case 'ResUsersId': {
                const n = Number(value);
                if (Number.isFinite(n) && n > 0) {
                    mapped.push(['user_id', op, n]);
                }
                break;
            }
            case 'Name':
                mapped.push(['name', op, value]);
                break;
            case 'EMail':
                mapped.push(['work_email', op, value]);
                break;
            case 'Phone':
                mapped.push(['work_phone', op, value]);
                break;
            case 'Phone2':
                mapped.push(['mobile_phone', op, value]);
                break;
            case 'IsActive':
                mapped.push(['active', op, String(value).toUpperCase() === 'Y']);
                break;
            default:
                break;
        }
    });

    return mapped;
}

function buildPartnerDomain(where = []) {
    if (!Array.isArray(where) || where.length === 0) return [];

    if (where.length === 1 && where[0]?.name && where[0]?.opertor && ['Phone', 'Phone2'].includes(where[0].name)) {
        const rawValue = String(where[0].value ?? '');
        const digits = rawValue.replace(/\D/g, '');
        const tail = digits.length > 7 ? digits.slice(-7) : digits;
        const local = digits.startsWith('966') ? digits.slice(3) : (digits.startsWith('0') ? digits.slice(1) : digits);
        const withZero = local ? `0${local}` : '';
        const with966 = local ? `966${local}` : '';
        const withPlus966 = local ? `+966${local}` : '';
        const needles = [rawValue, tail, local, withZero, with966, withPlus966].filter(Boolean);

        const orDomain = [];
        needles.forEach(n => {
            orDomain.push(['phone', 'ilike', n], ['mobile', 'ilike', n]);
        });
        if (orDomain.length === 0) return [];
        return Array(orDomain.length - 1).fill('|').concat(orDomain);
    }

    const mapped = [];
    where.forEach(w => {
        const op = mapOdooOperator(w?.opertor || '=');
        const value = w?.value;
        switch (w?.name) {
            case 'AD_User_ID':
                mapped.push(['id', op, value]);
                break;
            case 'Name':
                mapped.push(['name', op, value]);
                break;
            case 'EMail':
                mapped.push(['email', op, value]);
                break;
            case 'Phone':
                mapped.push(['phone', op, value]);
                break;
            case 'Phone2':
                mapped.push(['mobile', op, value]);
                break;
            case 'IsActive':
                mapped.push(['active', op, String(value).toUpperCase() === 'Y']);
                break;
            default:
                break;
        }
    });
    return mapped;
}

function mapPartnerToLegacy(partner) {
    return {
        C_BPartner_ID: String(partner.id ?? ''),
        Name: partner.name || '',
        Name2: partner.display_name || partner.name || '',
        TotalOpenBalance: '0',
        IsActive: partner.active ? 'Y' : 'N',
        SalesRep_ID: String(maybeMany2OneId(partner.user_id) || ''),
        Rating: '',
        Value: partner.ref || ''
    };
}

function mapTicketToLegacy(ticket) {
    return {
        R_Request_ID: String(ticket.id ?? ''),
        // Prefer Odoo's ticket reference/sequence (e.g. RT20004555) when available.
        DocumentNo: String(ticket.ticket_ref || `RT${String(ticket.id ?? '').trim()}`),
        Summary: ticket.name || '',
        Priority: ticket.priority || '',
        Created: ticket.create_date || '',
        R_Status_ID: String(maybeMany2OneId(ticket.stage_id) || ''),
        R_Status_Name: String(Array.isArray(ticket.stage_id) ? (ticket.stage_id[1] || '') : ''),
        SalesRep_ID: String(maybeMany2OneId(ticket.user_id) || ''),
        C_BPartner_ID: String(maybeMany2OneId(ticket.partner_id) || ''),
        CreatedBy: String(maybeMany2OneId(ticket.create_uid) || ''),
        AD_User_ID: String(maybeMany2OneId(ticket.partner_id) || ''),
        Result: '',
        QtySpent: String(ticket.x_qty_spent || 0),
        HoursOvertime: String(ticket.x_hours_overtime || 0),
        R_RequestType_ID: '',
        C_Order_ID: ''
    };
}

function mapOrderToLegacy(order) {
    return {
        C_Order_ID: String(order.id ?? ''),
        DocumentNo: order.name || '',
        Description: order.note || '',
        DateOrdered: order.date_order || '',
        DatePromised: order.commitment_date || order.date_order || '',
        GrandTotal: String(order.amount_total ?? 0),
        DocStatus: order.state || '',
        C_BPartner_ID: String(maybeMany2OneId(order.partner_id) || '')
    };
}

function mapProductToLegacy(product) {
    return {
        M_Product_ID: String(product.id ?? ''),
        Value: product.default_code || '',
        Name: product.name || '',
        QtyAvailable: String(product.qty_available ?? 0),
        QtyOnHand: String(product.qty_available ?? 0),
        QtyReserved: String(product.outgoing_qty ?? 0)
    };
}

async function callOdoo(url, payload) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (data.error) {
        throw new Error(data.error?.data?.message || data.error?.message || 'Odoo error');
    }
    return data.result;
}

async function odooAuthenticate(url, auth) {
    return callOdoo(url, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
            service: 'common',
            method: 'authenticate',
            args: [auth.db, auth.login, auth.password, {}]
        },
        id: Date.now()
    });
}

/**
 * When phone search on hr.employee returns nothing, res.partner may still match — but the app
 * expects hr.employee id as AD_User_ID. If partner rows carry the same email as work_email on
 * one active employee, return that employee instead of the contact partner.
 */
async function bridgeEmployeesFromPartnerUserLink(url, auth, uid, partners, employeeFields, limit) {
    for (const p of partners || []) {
        const pid = Number(p.id);
        if (!pid) continue;
        const rows = await odooExecuteKw(url, auth, uid, 'hr.employee', 'search_read', [[['user_id.partner_id', '=', pid]]], {
            fields: employeeFields || HR_EMPLOYEE_READ_FIELDS,
            limit: 2
        });
        if (Array.isArray(rows) && rows.length === 1) return rows;
    }
    return [];
}

async function bridgeEmployeesFromPartnerEmails(url, auth, uid, partners, employeeFields, limit) {
    const emails = [...new Set((partners || []).map(p => String(p.email || '').trim()).filter(Boolean))];
    for (const raw of emails) {
        const em = raw.toLowerCase();
        if (!em) continue;
        const bridged = await odooExecuteKw(url, auth, uid, 'hr.employee', 'search_read', [[
            ['active', '=', true],
            ['work_email', 'ilike', em]
        ]], {
            fields: employeeFields || HR_EMPLOYEE_READ_FIELDS,
            limit: Math.min(5, limit || 5)
        });
        if (Array.isArray(bridged) && bridged.length === 1) {
            return bridged;
        }
    }
    return [];
}

async function odooExecuteKw(url, auth, uid, model, method, args = [], kwargs = {}) {
    return callOdoo(url, {
        jsonrpc: '2.0',
        method: 'call',
        params: {
            service: 'object',
            method: 'execute_kw',
            args: [auth.db, uid, auth.password, model, method, args, kwargs]
        },
        id: Date.now() + 1
    });
}

/**
 * Legacy id may be hr.employee pk, res.partner pk (login sometimes stores contact partner id), or res.users pk.
 * Example: partner 7457 → user 108 → employee 72 (employee.id is never 7457).
 */
async function resolveHrEmployeeRowByLegacyId(url, auth, uid, legacyId, fields = ['id', 'user_id']) {
    const n = Number(legacyId);
    if (!legacyId || !Number.isFinite(n) || n <= 0) return null;

    let rows = [];
    try {
        rows = await odooExecuteKw(url, auth, uid, 'hr.employee', 'search_read', [[['id', '=', n]]], {
            fields,
            limit: 8
        });
        if (rows?.length >= 1) {
            if (rows.length > 1) console.warn('[Odoo] Multiple hr.employee rows for id=', n);
            return rows[0];
        }

        rows = await odooExecuteKw(url, auth, uid, 'hr.employee', 'search_read', [[['user_id.partner_id', '=', n]]], {
            fields,
            limit: 8
        });
        if (rows?.length >= 1) {
            if (rows.length > 1) console.warn('[Odoo] Multiple hr.employee for partner_id', n);
            return rows[0];
        }
    } catch (e) {
        // Common on many Odoo DBs: hr.employee is not readable by service account.
        console.warn('[Odoo] hr.employee read blocked during resolveHrEmployeeRowByLegacyId:', e?.message);
    }

    const users = await odooExecuteKw(url, auth, uid, 'res.users', 'search_read', [[['partner_id', '=', n]]], {
        fields: ['id'],
        limit: 2
    });
    if (users?.length >= 1) {
        const ouid = users[0].id;
        try {
            rows = await odooExecuteKw(url, auth, uid, 'hr.employee', 'search_read', [[['user_id', '=', ouid]]], {
                fields,
                limit: 8
            });
            if (rows?.length >= 1) return rows[0];
        } catch (e) {
            console.warn('[Odoo] hr.employee read blocked for user_id lookup:', e?.message);
        }
    }

    try {
        rows = await odooExecuteKw(url, auth, uid, 'hr.employee', 'search_read', [[['user_id', '=', n]]], {
            fields,
            limit: 8
        });
        if (rows?.length >= 1) return rows[0];
    } catch (e) {
        console.warn('[Odoo] hr.employee read blocked for direct user_id lookup:', e?.message);
    }

    return null;
}

/** App AD_User_ID / SalesRep_ID may be employee id, partner id, or user id — returns res.users id for helpdesk.user_id. */
async function employeeIdToOdooUserId(url, auth, uid, legacyId) {
    console.log("legacyId:", legacyId);
    const str = String(legacyId ?? '').trim();
    const n = Number(str);

    // 1) If legacyId is already a valid res.users id, use it.
    if (Number.isFinite(n) && n > 0) {
        try {
            const users = await odooExecuteKw(url, auth, uid, 'res.users', 'search_read', [[['id', '=', n]]], { fields: ['id'], limit: 1 });
            if (users?.length === 1) return n;
        } catch (e) {
            // ignore and try other strategies
        }
    }

    // 2) If legacyId is a res.partner id, resolve res.users via partner_id (common: partner 7457 -> user 108).
    if (Number.isFinite(n) && n > 0) {
        try {
            const users = await odooExecuteKw(url, auth, uid, 'res.users', 'search_read', [[['partner_id', '=', n]]], { fields: ['id'], limit: 1 });
            if (users?.length === 1 && users[0]?.id) return Number(users[0].id);
        } catch (e) {
            // ignore and try hr.employee
        }
    }

    // 3) hr.employee bridge (only works if hr.employee is readable).
    const row = await resolveHrEmployeeRowByLegacyId(url, auth, uid, str, ['id', 'user_id']);
    if (!row) return null;
    const uidPart = maybeMany2OneId(row.user_id);
    return uidPart ? Number(uidPart) : null;
}

async function buildHelpdeskTicketDomain(url, auth, uid, columnsWhere = []) {
    const raw = Array.isArray(columnsWhere) ? columnsWhere : [];
    const domain = [];

    for (const w of raw) {
        if (!w?.name || !w.opertor) continue;
        const op = mapOdooOperator(w.opertor);
        const v = w.value;

        switch (w.name) {
            case 'DocumentNo':
                // In Odoo UI the visible ticket number is often ticket_ref like "RT20004555".
                // Map equality on DocumentNo to ticket_ref first; fallback to name for legacy uses.
                if (op === '=' && String(v ?? '').trim()) {
                    domain.push(['ticket_ref', '=', String(v ?? '').trim()]);
                } else {
                    domain.push(['name', op, String(v)]);
                }
                break;
            case 'R_Request_ID':
                domain.push(['id', op, Number(v)]);
                break;
            case 'C_BPartner_ID':
                domain.push(['partner_id', op, Number(v)]);
                break;
            case 'SalesRep_ID': {
                const str = String(v ?? '').trim();
                if (!str) {
                    domain.push(['user_id', '=', false]);
                } else {
                    const odooUserId = await employeeIdToOdooUserId(url, auth, uid, str);
                    console.log('[Odoo][Tickets] SalesRep_ID legacy=', str, '→ resolved res.users id=', odooUserId);
                    const n = Number(str);
                    // Match assignee OR creator (Odoo UI often leaves user_id empty).
                    // Do not OR legacy n onto user_id — n may be res.partner id (e.g. 7457), not res.users.
                    const pushMineDomain = (uidVal) => {
                        const uidNum = Number(uidVal);
                        if (!Number.isFinite(uidNum) || uidNum <= 0) return false;
                        domain.push('|');
                        domain.push(['user_id', '=', uidNum]);
                        domain.push(['create_uid', '=', uidNum]);
                        return true;
                    };
                    if (odooUserId) {
                        pushMineDomain(odooUserId);
                    } else if (Number.isFinite(n) && n > 0) {
                        const users = await odooExecuteKw(url, auth, uid, 'res.users', 'search_read', [[['id', '=', n]]], {
                            fields: ['id'],
                            limit: 1
                        });
                        if (users?.length === 1) {
                            domain.push('|');
                            domain.push(['user_id', '=', n]);
                            domain.push(['create_uid', '=', n]);
                        } else {
                            domain.push(['id', '=', -1]);
                        }
                    } else {
                        domain.push(['id', '=', -1]);
                    }
                }
                break;
            }
            default:
                break;
        }
    }

    return domain;
}

async function resolveTicketAssigneeUserId(url, auth, uid, legacySalesRepId) {
    const str = String(legacySalesRepId ?? '').trim();
    if (!str) return false;
    const resolved = await employeeIdToOdooUserId(url, auth, uid, str);
    if (resolved) return resolved;
    const n = Number(str);
    if (!Number.isFinite(n) || n <= 0) return false;
    const users = await odooExecuteKw(url, auth, uid, 'res.users', 'search_read', [[['id', '=', n]]], { fields: ['id'], limit: 1 });
    return users?.length === 1 ? n : false;
}

async function handleLegacyErpAsOdoo(url, payload) {
    const auth = payload.login_user || {};
    const uid = await odooAuthenticate(url, auth);
    if (!uid) {
        return [{ massage: 'Email Not Found or Password Incorect' }];
    }

    const tablename = payload.tablename;
    console.log("tablename:", tablename);
    const type = payload.type;
    const where = toLegacyWhere(payload.columns_where || []);
    const limit = payload.record_count ? Number(payload.record_count) : 200;

    if (type === 'query_data') {
        if (tablename === 'AD_User') {
            const whereRaw = Array.isArray(payload.columns_where) ? payload.columns_where : [];
            const partnerCond = whereRaw.find(w => w?.name === 'C_BPartner_ID');
            if (partnerCond?.value) {
                const partnerId = Number(partnerCond.value);
                const activeCond = whereRaw.find(w => w?.name === 'IsActive');
                const activeOnly = activeCond ? String(activeCond.value).toUpperCase() === 'Y' : false;

                const domain = [
                    '|',
                    ['id', '=', partnerId],
                    ['parent_id', '=', partnerId]
                ];
                if (activeOnly) domain.push(['active', '=', true]);

                const contacts = await odooExecuteKw(url, auth, uid, 'res.partner', 'search_read', [domain], {
                    fields: ['id', 'name', 'phone', 'mobile', 'email', 'active', 'comment', 'parent_id', 'function', 'user_id'],
                    limit: 500
                });
                return contacts.map(mapUserToLegacy);
            }

            const employeeWhere = buildEmployeeDomain(payload.columns_where || []);
            let employees = [];
            try {
                employees = await odooExecuteKw(url, auth, uid, 'hr.employee', 'search_read', [employeeWhere], {
                    fields: HR_EMPLOYEE_READ_FIELDS,
                    limit
                });
            } catch (e) {
                console.warn('[Odoo] hr.employee lookup failed, falling back to res.partner:', e?.message);
            }

            if (Array.isArray(employees) && employees.length > 0) {
                const partnerByUserId = await partnerIdsForEmployeeUsers(url, auth, uid, employees);
                return mapEmployeesWithPartners(employees, partnerByUserId);
            }

            // Fallback: phone may match res.partner but not hr.employee formatting — still wrong AD_User_ID if we stop here (partner id vs employee id).
            const partnerWhere = buildPartnerDomain(payload.columns_where || []);
            const partners = await odooExecuteKw(url, auth, uid, 'res.partner', 'search_read', [partnerWhere], {
                fields: ['id', 'name', 'phone', 'mobile', 'email', 'active', 'comment', 'parent_id', 'function', 'user_id'],
                limit
            });
            let bridged = await bridgeEmployeesFromPartnerUserLink(url, auth, uid, partners, HR_EMPLOYEE_READ_FIELDS, limit);
            if (bridged.length === 0) {
                bridged = await bridgeEmployeesFromPartnerEmails(url, auth, uid, partners, HR_EMPLOYEE_READ_FIELDS, limit);
            }
            if (bridged.length > 0) {
                const partnerByUserId = await partnerIdsForEmployeeUsers(url, auth, uid, bridged);
                return mapEmployeesWithPartners(bridged, partnerByUserId);
            }
            return (partners || []).map(mapUserToLegacy);
        }

        if (tablename === 'AD_User_Roles') {
            const whereRaw = Array.isArray(payload.columns_where) ? payload.columns_where : [];
            const byRole = whereRaw.find(w => w?.name === 'AD_Role_ID');
            const byUser = whereRaw.find(w => w?.name === 'AD_User_ID');

            // Used by getRoleUsers(roleId): return list of users for requested role.
            // Odoo role model differs, so we fallback to active employees as assignable pool.
            if (byRole?.value) {
                const employees = await odooExecuteKw(url, auth, uid, 'hr.employee', 'search_read', [[['active', '=', true]]], {
                    fields: ['id'],
                    limit: 500
                });
                return (employees || []).map(e => ({ AD_User_ID: String(e.id ?? '') }));
            }

            // Used by getUserRoles(userId): return at least one technical role.
            if (byUser?.value) {
                return [{ AD_Role_ID: '1000031' }];
            }

            return [{ AD_Role_ID: '1000031' }];
        }

        if (tablename === 'C_BPartner') {
            const partners = await odooExecuteKw(url, auth, uid, 'res.partner', 'search_read', [where], {
                fields: ['id', 'name', 'display_name', 'active', 'user_id', 'ref'],
                limit
            });
            return partners.map(mapPartnerToLegacy);
        }

        if (tablename === 'R_Request') {
            try {
                const ticketDomain = await buildHelpdeskTicketDomain(url, auth, uid, payload.columns_where || []);
                console.log('[Odoo][Tickets] helpdesk.ticket domain:', JSON.stringify(ticketDomain));
                const tickets = await odooExecuteKw(url, auth, uid, 'helpdesk.ticket', 'search_read', [ticketDomain], {
                    fields: ['id', 'name', 'ticket_ref', 'priority', 'create_date', 'stage_id', 'user_id', 'partner_id', 'create_uid'],
                    limit
                });
                console.log('[Odoo][Tickets] helpdesk.ticket rows:', Array.isArray(tickets) ? tickets.length : 'non-array');
                return tickets.map(mapTicketToLegacy);
            } catch (e) {
                console.warn('[Odoo] helpdesk.ticket read failed:', e?.message);
                return [];
            }
        }

        if (tablename === 'C_Order') {
            const orderWhere = (payload.columns_where || []).map(w => {
                const op = mapOdooOperator(w?.opertor || '=');
                if (w?.name === 'DocumentNo') return ['name', op, w.value];
                if (w?.name === 'C_BPartner_ID') return ['partner_id', op, Number(w.value)];
                if (w?.name === 'SalesRep_ID') return ['user_id', op, Number(w.value)];
                return null;
            }).filter(Boolean);

            const orders = await odooExecuteKw(url, auth, uid, 'sale.order', 'search_read', [orderWhere], {
                fields: ['id', 'name', 'note', 'date_order', 'commitment_date', 'amount_total', 'state', 'partner_id', 'user_id'],
                limit
            });
            return orders.map(mapOrderToLegacy);
        }

        if (tablename === 'R_RequestType') {
            // Primary mapping: Helpdesk Ticket Type
            try {
                const types = await odooExecuteKw(url, auth, uid, 'helpdesk.ticket.type', 'search_read', [where], {
                    fields: ['id', 'name', 'active'],
                    limit
                });
                if (Array.isArray(types) && types.length > 0) {
                    return types.map(t => ({
                        R_RequestType_ID: String(t.id ?? ''),
                        Name: t.name || ''
                    }));
                }
            } catch (e) {
                console.warn('[Odoo] helpdesk.ticket.type lookup failed:', e?.message);
            }

            // Fallback: Helpdesk tags
            try {
                const tags = await odooExecuteKw(url, auth, uid, 'helpdesk.tag', 'search_read', [[]], {
                    fields: ['id', 'name'],
                    limit
                });
                if (Array.isArray(tags) && tags.length > 0) {
                    return tags.map(t => ({
                        R_RequestType_ID: String(t.id ?? ''),
                        Name: t.name || ''
                    }));
                }
            } catch (e) {
                console.warn('[Odoo] helpdesk.tag fallback failed:', e?.message);
            }

            // Final fallback to keep Step 3 usable.
            return [
                { R_RequestType_ID: '1', Name: 'Support' },
                { R_RequestType_ID: '2', Name: 'Maintenance' },
                { R_RequestType_ID: '3', Name: 'Installation' }
            ];
        }

        if (tablename === 'RV_Storage') {
            const products = await odooExecuteKw(url, auth, uid, 'product.product', 'search_read', [where], {
                fields: ['id', 'default_code', 'name', 'qty_available', 'outgoing_qty'],
                limit
            });
            return products.map(mapProductToLegacy);
        }

        if (tablename === 'M_Cost') {
            const products = await odooExecuteKw(url, auth, uid, 'product.product', 'search_read', [[]], {
                fields: ['id', 'standard_price'],
                limit: 10000
            });
            return products.map(p => ({
                M_Product_ID: String(p.id),
                CurrentCostPrice: String(p.standard_price ?? 0)
            }));
        }

        return [];
    }

    if (type === 'create_data' && tablename === 'R_Request') {
        const colMap = {};
        (payload.columns || []).forEach(c => {
            colMap[c.name] = c.value;
        });

        const assignUid = await resolveTicketAssigneeUserId(url, auth, uid, colMap.SalesRep_ID);
        const vals = {
            name: colMap.Summary || 'New Ticket',
            description: colMap.Result || '',
            partner_id: colMap.C_BPartner_ID ? Number(colMap.C_BPartner_ID) : false,
            user_id: assignUid || false
        };

        const recordId = await odooExecuteKw(url, auth, uid, 'helpdesk.ticket', 'create', [vals], {});
        return [{ massage: 'Record Created', Value: String(recordId), RECORDID: String(recordId) }];
    }

    if (type === 'update_data' && tablename === 'R_Request') {
        const ticketDomain = await buildHelpdeskTicketDomain(url, auth, uid, payload.columns_where || []);
        const tickets = await odooExecuteKw(url, auth, uid, 'helpdesk.ticket', 'search_read', [ticketDomain], {
            fields: ['id'],
            limit: 1
        });
        if (!Array.isArray(tickets) || tickets.length === 0) {
            return [{ massage: 'Record Not Found' }];
        }

        const colMap = {};
        (payload.columns || []).forEach(c => {
            colMap[c.name] = c.value;
        });

        const vals = {};
        if (colMap.Summary) vals.name = colMap.Summary;
        if (colMap.Result !== undefined) vals.description = colMap.Result;
        if (colMap.SalesRep_ID !== undefined) {
            const str = String(colMap.SalesRep_ID ?? '').trim();
            vals.user_id = str ? await resolveTicketAssigneeUserId(url, auth, uid, str) : false;
        }
        if (colMap.C_BPartner_ID) vals.partner_id = Number(colMap.C_BPartner_ID);
        // iDempiere legacy status ids are large (e.g. 1000013). Odoo helpdesk.stage ids are usually small.
        // If a legacy id is provided, map it to an Odoo stage by name.
        async function resolveStageIdByNames(names) {
            for (const raw of (names || [])) {
                const name = String(raw || '').trim();
                if (!name) continue;
                try {
                    const rows = await odooExecuteKw(url, auth, uid, 'helpdesk.stage', 'search_read', [[['name', 'ilike', name]]], { fields: ['id', 'name'], limit: 1 });
                    if (Array.isArray(rows) && rows.length === 1 && rows[0]?.id) return Number(rows[0].id);
                } catch (e) {
                    // ignore and try next
                }
            }
            return null;
        }
        if (colMap.R_Status_ID !== undefined) {
            const raw = String(colMap.R_Status_ID ?? '').trim();
            const n = Number(raw);
            if (Number.isFinite(n) && n > 0 && n < 100000) {
                vals.stage_id = n;
            } else if (raw) {
                const closeLegacy = new Set(['1000013', '1000016', '1000007', '1000004', '1000002', '1000006']);
                const inProgressLegacy = new Set(['1000012', '1000001', '1000014', '1000005']);
                let stageId = null;
                if (closeLegacy.has(raw)) {
                    stageId = await resolveStageIdByNames(['Solved', 'Closed', 'Done']);
                } else if (inProgressLegacy.has(raw)) {
                    stageId = await resolveStageIdByNames(['In Progress', 'Progress', 'Working']);
                }
                if (stageId) vals.stage_id = stageId;
            }
        }

        await odooExecuteKw(url, auth, uid, 'helpdesk.ticket', 'write', [[tickets[0].id], vals], {});
        return [{ massage: 'Record Updated', RECORDID: String(tickets[0].id) }];
    }

    if (type === 'update_data' && tablename === 'AD_User') {
        const employeeWhere = buildEmployeeDomain(payload.columns_where || []);
        const users = await odooExecuteKw(url, auth, uid, 'hr.employee', 'search_read', [employeeWhere], {
            fields: ['id'],
            limit: 1
        });
        if (!Array.isArray(users) || users.length === 0) {
            return [{ massage: 'Record Not Found' }];
        }

        const colMap = {};
        (payload.columns || []).forEach(c => {
            colMap[c.name] = c.value;
        });

        const vals = {};
        if (colMap.Phone !== undefined) vals.work_phone = colMap.Phone;

        // Persist telegram tag in employee notes (e.g. "tg_chat_id:123456789")
        // and keep any plain description text.
        if (colMap.Description !== undefined || colMap.Fax !== undefined) {
            let currentNotes = '';
            try {
                const noteRows = await odooExecuteKw(url, auth, uid, 'hr.employee', 'read', [[users[0].id]], {
                    fields: ['notes']
                });
                if (Array.isArray(noteRows) && noteRows[0]) {
                    currentNotes = String(noteRows[0].notes || '');
                }
            } catch (e) {
                console.warn('[Odoo] employee notes not readable (ACL); merge may omit existing notes:', e?.message);
            }
            const noTag = currentNotes.replace(/tg_chat_id:\d+/g, '').trim();
            const base = (colMap.Description !== undefined ? String(colMap.Description || '') : noTag).trim();
            const tag = (colMap.Fax !== undefined ? String(colMap.Fax || '').match(/tg_chat_id:\d+/)?.[0] : null);
            vals.notes = [base, tag].filter(Boolean).join(' ').trim() || ' ';
        }

        await odooExecuteKw(url, auth, uid, 'hr.employee', 'write', [[users[0].id], vals], {});
        return [{ massage: 'Record Updated', RECORDID: String(users[0].id) }];
    }

    return [{ massage: 'Unsupported operation for Odoo adapter' }];
}

export default async function handler(req, res) {
    // Add CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const { target } = req.query;

    try {
        if (target === 'erp') {
            const ERP_URL = (process.env.ERP_URL || 'https://cgc-sa.odoo.com/jsonrpc').toString().trim();
            const payload = req.body;

            // Securely inject credentials from Environment Variables
            // Fallback to current hardcoded ones if not set yet
            const auth = {
                db: (process.env.ERP_DB || '').toString().trim(),
                login: (process.env.ERP_EMAIL || '').toString().trim(),
                password: (process.env.ERP_PASSWORD || '').toString().trim()
            };

            if (!auth.db || !auth.login || !auth.password) {
                return res.status(500).json([{ massage: 'ERP credentials are not configured on server' }]);
            }

            // Inject auth into every login_user spot in the payload
            if (payload.login_user) payload.login_user = auth;

            const data = await handleLegacyErpAsOdoo(ERP_URL, payload);
            return res.status(200).json(data);
        }

        if (target === 'openai-realtime') {
            const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
            
            const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${OPENAI_API_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    session: {
                        type: "realtime",
                        model: "gpt-4o-realtime-preview",
                        instructions: "You are a professional technical assistant at ARTELCO.",
                        audio: { output: { voice: "cedar" } }
                    }
                })
            });

            const data = await response.json();
            return res.status(response.status).json(data);
        }

        if (target === 'openai-transcriptions') {
            const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
            const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${OPENAI_API_KEY}`
                },
                body: req.body
            });
            const data = await response.json();
            return res.status(response.status).json(data);
        }

        if (target === 'openai-tts') {
            const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
            const response = await fetch("https://api.openai.com/v1/audio/speech", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${OPENAI_API_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(req.body)
            });
            const audioBuffer = await response.arrayBuffer();
            res.setHeader('Content-Type', 'audio/mpeg');
            return res.status(response.status).send(Buffer.from(audioBuffer));
        }

        if (target === 'gemini') {
            const GEMINI_KEY = process.env.GEMINI_API_KEY;
            const MODEL = "gemini-1.5-flash"; 
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`;

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(req.body)
            });

            const data = await response.json();
            return res.status(200).json(data);
        }

        if (target === 'telegram-updates') {
            const TELEGRAM_BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').toString().trim();
            if (!TELEGRAM_BOT_TOKEN) {
                return res.status(500).json({ error: 'Telegram token is not configured on server' });
            }

            const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=-10`);
            const data = await response.json();
            return res.status(response.status).json(data);
        }

        if (target === 'telegram-send') {
            const TELEGRAM_BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').toString().trim();
            if (!TELEGRAM_BOT_TOKEN) {
                return res.status(500).json({ error: 'Telegram token is not configured on server' });
            }

            const { chatId, text, replyMarkup } = req.body || {};
            if (!chatId || !text) {
                return res.status(400).json({ ok: false, error: 'chatId and text are required' });
            }

            const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: chatId,
                    text,
                    parse_mode: 'HTML',
                    ...(replyMarkup ? { reply_markup: replyMarkup } : {})
                })
            });
            const data = await response.json();
            return res.status(response.status).json(data);
        }

        res.status(400).json({ error: 'Invalid target' });
    } catch (error) {
        console.error('Proxy Error:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
}
