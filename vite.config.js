import { defineConfig } from 'vite';
import bodyParser from 'body-parser';

export default defineConfig({
    root: './',
    build: {
        outDir: 'dist',
        emptyOutDir: true,
    },
    plugins: [
        {
            name: 'local-proxy-plugin',
            configureServer(server) {
                console.log("[Vite] Local Proxy Plugin Initialized");
                server.middlewares.use(bodyParser.json());
                server.middlewares.use(async (req, res, next) => {
                    if (req.url.includes('/api/proxy')) {
                        const url = new URL(req.url, `http://${req.headers.host}`);
                        const target = url.searchParams.get('target');

                        try {
                            if (target === 'erp') {
                                const ERP_URL = (process.env.ERP_URL || 'https://cgc-sa.odoo.com/jsonrpc').toString().trim();
                                const payload = req.body;

                                const auth = {
                                    db: (process.env.ERP_DB || "asasat-advanced-systems-cgc-production-10193466").toString().trim(),
                                    login: (process.env.ERP_EMAIL || "rizvana.mohammed@cgc-sa.com").toString().trim(),
                                    password: (process.env.ERP_PASSWORD || "Shameemriz@123").toString().trim()
                                };

                                const callOdoo = async (body) => {
                                    const response = await fetch(ERP_URL, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify(body)
                                    });
                                    const data = await response.json();
                                    if (data.error) throw new Error(data.error?.data?.message || data.error?.message || "Odoo Error");
                                    return data.result;
                                };

                                /** Avoid hr.employee fields that require HR Officer ACL (address_home_id, notes). */
                                const HR_EMPLOYEE_READ_FIELDS = ['id', 'name', 'work_phone', 'mobile_phone', 'work_email', 'active', 'job_title', 'user_id'];
                                const batchUserPartnerIds = async (employeeRows) => {
                                    const userIds = [...new Set((employeeRows || []).map((r) => {
                                        const id = Array.isArray(r.user_id) ? r.user_id[0] : r.user_id;
                                        const n = id != null ? Number(id) : NaN;
                                        return Number.isFinite(n) && n > 0 ? n : null;
                                    }).filter(Boolean))];
                                    if (userIds.length === 0) return new Map();
                                    const urows = await callOdoo({
                                        jsonrpc: '2.0',
                                        method: 'call',
                                        params: {
                                            service: 'object',
                                            method: 'execute_kw',
                                            args: [auth.db, uid, auth.password, 'res.users', 'search_read', [[['id', 'in', userIds]]], {
                                                fields: ['id', 'partner_id'],
                                                limit: Math.min(500, userIds.length)
                                            }]
                                        },
                                        id: Date.now() + 50
                                    });
                                    const map = new Map();
                                    for (const u of urows || []) {
                                        const pid = Array.isArray(u.partner_id) ? u.partner_id[0] : u.partner_id;
                                        if (pid) map.set(u.id, String(pid));
                                    }
                                    return map;
                                };

                                const uid = await callOdoo({
                                    jsonrpc: '2.0',
                                    method: 'call',
                                    params: {
                                        service: 'common',
                                        method: 'authenticate',
                                        args: [auth.db, auth.login, auth.password, {}]
                                    },
                                    id: Date.now()
                                });

                                if (!uid) {
                                    res.setHeader('Content-Type', 'application/json');
                                    res.end(JSON.stringify([{ massage: 'Email Not Found or Password Incorect' }]));
                                    return;
                                }

                                const where = Array.isArray(payload.columns_where) ? payload.columns_where : [];
                                const digitFrom = (v) => String(v || '').replace(/\D/g, '');
                                const odooOp = (op) => {
                                    const raw = String(op || '=').trim().toUpperCase();
                                    if (raw === 'LIKE') return 'ilike';
                                    if (raw === 'NOT LIKE') return 'not ilike';
                                    return String(op || '=').trim();
                                };

                                if (payload.type === 'query_data' && payload.tablename === 'AD_User') {
                                    const partnerCond = where.find(w => w?.name === 'C_BPartner_ID');
                                    if (partnerCond?.value) {
                                        const partnerId = Number(partnerCond.value);
                                        const activeCond = where.find(w => w?.name === 'IsActive');
                                        const activeOnly = activeCond ? String(activeCond.value).toUpperCase() === 'Y' : false;

                                        const partnerContactsDomain = ['|', ['id', '=', partnerId], ['parent_id', '=', partnerId]];
                                        if (activeOnly) partnerContactsDomain.push(['active', '=', true]);

                                        const rows = await callOdoo({
                                            jsonrpc: '2.0',
                                            method: 'call',
                                            params: {
                                                service: 'object',
                                                method: 'execute_kw',
                                                args: [auth.db, uid, auth.password, 'res.partner', 'search_read', [partnerContactsDomain], {
                                                    fields: ['id', 'name', 'phone', 'mobile', 'email', 'active', 'comment', 'parent_id', 'function', 'user_id'],
                                                    limit: 500
                                                }]
                                            },
                                            id: Date.now() + 1
                                        });

                                        const data = (rows || []).map(r => {
                                            const ru = Array.isArray(r.user_id) ? r.user_id[0] : r.user_id;
                                            return {
                                                AD_User_ID: String(r.id ?? ''),
                                                ResUsersId: ru != null && ru !== false ? String(ru) : '',
                                                Name: r.name || '',
                                                Phone: r.phone || '',
                                                Phone2: r.mobile || '',
                                                EMail: r.email || '',
                                                IsActive: r.active ? 'Y' : 'N',
                                                Description: r.comment || '',
                                                C_BPartner_ID: String(Array.isArray(r.parent_id) ? (r.parent_id[0] || '') : (r.parent_id || '')),
                                                Title: '',
                                                Fax: r.function || ''
                                            };
                                        });
                                        res.setHeader('Content-Type', 'application/json');
                                        res.end(JSON.stringify(data));
                                        return;
                                    }

                                    let domain = [];
                                    let partnerDomain = [];
                                    if (where.length && ['Phone', 'Phone2'].includes(where[0]?.name)) {
                                        const rawValue = String(where[0].value || '');
                                        const digits = digitFrom(rawValue);
                                        const short = digits.length > 7 ? digits.slice(-7) : digits;
                                        const local = digits.startsWith('966') ? digits.slice(3) : (digits.startsWith('0') ? digits.slice(1) : digits);
                                        const withZero = local ? `0${local}` : '';
                                        const with966 = local ? `966${local}` : '';
                                        const withPlus966 = local ? `+966${local}` : '';
                                        const needles = [rawValue, short, local, withZero, with966, withPlus966].filter(Boolean);

                                        const empOr = [];
                                        const partnerOr = [];
                                        needles.forEach(n => {
                                            empOr.push(['work_phone', 'ilike', n], ['mobile_phone', 'ilike', n]);
                                            partnerOr.push(['phone', 'ilike', n], ['mobile', 'ilike', n]);
                                        });
                                        domain = empOr.length ? Array(empOr.length - 1).fill('|').concat(empOr) : [];
                                        partnerDomain = partnerOr.length ? Array(partnerOr.length - 1).fill('|').concat(partnerOr) : [];
                                    } else {
                                        domain = where.map(w => {
                                            if (w.name === 'AD_User_ID') return ['id', odooOp(w.opertor), w.value];
                                            if (w.name === 'Name') return ['name', odooOp(w.opertor), w.value];
                                            if (w.name === 'EMail') return ['work_email', odooOp(w.opertor), w.value];
                                            return null;
                                        }).filter(Boolean);
                                        partnerDomain = where.map(w => {
                                            if (w.name === 'AD_User_ID') return ['id', odooOp(w.opertor), w.value];
                                            if (w.name === 'Name') return ['name', odooOp(w.opertor), w.value];
                                            if (w.name === 'EMail') return ['email', odooOp(w.opertor), w.value];
                                            return null;
                                        }).filter(Boolean);
                                    }

                                    let rows = [];
                                    let fromPartnerFallback = false;
                                    try {
                                        rows = await callOdoo({
                                            jsonrpc: '2.0',
                                            method: 'call',
                                            params: {
                                                service: 'object',
                                                method: 'execute_kw',
                                                args: [auth.db, uid, auth.password, 'hr.employee', 'search_read', [domain], {
                                                    fields: HR_EMPLOYEE_READ_FIELDS,
                                                    limit: 30
                                                }]
                                            },
                                            id: Date.now() + 1
                                        });
                                    } catch (e) {
                                        console.warn("[Proxy] hr.employee lookup failed, trying res.partner", e?.message);
                                    }

                                    if (!Array.isArray(rows) || rows.length === 0) {
                                        rows = await callOdoo({
                                            jsonrpc: '2.0',
                                            method: 'call',
                                            params: {
                                                service: 'object',
                                                method: 'execute_kw',
                                                args: [auth.db, uid, auth.password, 'res.partner', 'search_read', [partnerDomain], {
                                                    fields: ['id', 'name', 'phone', 'mobile', 'email', 'active', 'comment', 'parent_id', 'user_id'],
                                                    limit: 30
                                                }]
                                            },
                                            id: Date.now() + 2
                                        });
                                        fromPartnerFallback = true;
                                    }

                                    if (fromPartnerFallback && Array.isArray(rows) && rows.length > 0) {
                                        for (const p of rows) {
                                            const pid = Number(p.id);
                                            if (!pid) continue;
                                            const byLink = await callOdoo({
                                                jsonrpc: '2.0',
                                                method: 'call',
                                                params: {
                                                    service: 'object',
                                                    method: 'execute_kw',
                                                    args: [auth.db, uid, auth.password, 'hr.employee', 'search_read', [[['user_id.partner_id', '=', pid]]], {
                                                        fields: HR_EMPLOYEE_READ_FIELDS,
                                                        limit: 2
                                                    }]
                                                },
                                                id: Date.now() + 25
                                            });
                                            if (Array.isArray(byLink) && byLink.length === 1) {
                                                rows = byLink;
                                                fromPartnerFallback = false;
                                                break;
                                            }
                                        }
                                    }

                                    if (fromPartnerFallback && Array.isArray(rows) && rows.length > 0) {
                                        const emails = [...new Set(rows.map((r) => String(r.email || '').trim()).filter(Boolean))];
                                        for (const raw of emails) {
                                            const em = raw.toLowerCase();
                                            if (!em) continue;
                                            const bridged = await callOdoo({
                                                jsonrpc: '2.0',
                                                method: 'call',
                                                params: {
                                                    service: 'object',
                                                    method: 'execute_kw',
                                                    args: [auth.db, uid, auth.password, 'hr.employee', 'search_read', [[
                                                        ['active', '=', true],
                                                        ['work_email', 'ilike', em]
                                                    ]], {
                                                        fields: HR_EMPLOYEE_READ_FIELDS,
                                                        limit: 5
                                                    }]
                                                },
                                                id: Date.now() + 3
                                            });
                                            if (Array.isArray(bridged) && bridged.length === 1) {
                                                rows = bridged;
                                                fromPartnerFallback = false;
                                                break;
                                            }
                                        }
                                    }

                                    const partnerByUser = await batchUserPartnerIds(rows);
                                    const data = (rows || []).map(r => {
                                        const uidPart = Array.isArray(r.user_id) ? r.user_id[0] : r.user_id;
                                        const fromUser = uidPart ? partnerByUser.get(Number(uidPart)) : '';
                                        const fromPartner = (Array.isArray(r.parent_id) ? r.parent_id[0] : r.parent_id) || '';
                                        return {
                                            AD_User_ID: String(r.id ?? ''),
                                            ResUsersId: uidPart != null && uidPart !== false ? String(uidPart) : '',
                                            Name: r.name || '',
                                            Phone: r.work_phone || r.phone || '',
                                            Phone2: r.mobile_phone || r.mobile || '',
                                            EMail: r.work_email || r.email || '',
                                            IsActive: r.active ? 'Y' : 'N',
                                            Description: r.notes || r.comment || '',
                                            C_BPartner_ID: String(fromUser || fromPartner || ''),
                                            Title: r.job_title || '',
                                            Fax: ''
                                        };
                                    });
                                    res.setHeader('Content-Type', 'application/json');
                                    res.end(JSON.stringify(data));
                                    return;
                                }

                                if (payload.type === 'update_data' && payload.tablename === 'AD_User') {
                                    const where = Array.isArray(payload.columns_where) ? payload.columns_where : [];
                                    const userIdCond = where.find(w => w?.name === 'AD_User_ID');
                                    if (!userIdCond?.value) {
                                        res.statusCode = 400;
                                        res.setHeader('Content-Type', 'application/json');
                                        res.end(JSON.stringify([{ massage: 'Record Not Found' }]));
                                        return;
                                    }

                                    const rows = await callOdoo({
                                        jsonrpc: '2.0',
                                        method: 'call',
                                        params: {
                                            service: 'object',
                                            method: 'execute_kw',
                                            args: [auth.db, uid, auth.password, 'hr.employee', 'search_read', [[['id', '=', Number(userIdCond.value)]]], {
                                                fields: ['id'],
                                                limit: 1
                                            }]
                                        },
                                        id: Date.now() + 2
                                    });

                                    if (!Array.isArray(rows) || rows.length === 0) {
                                        res.setHeader('Content-Type', 'application/json');
                                        res.end(JSON.stringify([{ massage: 'Record Not Found' }]));
                                        return;
                                    }

                                    const colMap = {};
                                    (payload.columns || []).forEach(c => { colMap[c.name] = c.value; });

                                    const vals = {};
                                    if (colMap.Phone !== undefined) vals.work_phone = colMap.Phone;
                                    if (colMap.Description !== undefined || colMap.Fax !== undefined) {
                                        let currentNotes = '';
                                        try {
                                            const noteRows = await callOdoo({
                                                jsonrpc: '2.0',
                                                method: 'call',
                                                params: {
                                                    service: 'object',
                                                    method: 'execute_kw',
                                                    args: [auth.db, uid, auth.password, 'hr.employee', 'read', [[rows[0].id]], {
                                                        fields: ['notes']
                                                    }]
                                                },
                                                id: Date.now() + 20
                                            });
                                            if (Array.isArray(noteRows) && noteRows[0]) {
                                                currentNotes = String(noteRows[0].notes || '');
                                            }
                                        } catch (e) {
                                            console.warn('[Proxy] employee notes not readable (ACL); merge may omit existing notes:', e?.message);
                                        }
                                        const noTag = currentNotes.replace(/tg_chat_id:\d+/g, '').trim();
                                        const base = (colMap.Description !== undefined ? String(colMap.Description || '') : noTag).trim();
                                        const tagMatch = colMap.Fax !== undefined ? String(colMap.Fax || '').match(/tg_chat_id:\d+/) : null;
                                        const tag = tagMatch ? tagMatch[0] : '';
                                        vals.notes = [base, tag].filter(Boolean).join(' ').trim() || ' ';
                                    }

                                    await callOdoo({
                                        jsonrpc: '2.0',
                                        method: 'call',
                                        params: {
                                            service: 'object',
                                            method: 'execute_kw',
                                            args: [auth.db, uid, auth.password, 'hr.employee', 'write', [[rows[0].id], vals], {}]
                                        },
                                        id: Date.now() + 3
                                    });

                                    res.setHeader('Content-Type', 'application/json');
                                    res.end(JSON.stringify([{ massage: 'Record Updated', RECORDID: String(rows[0].id) }]));
                                    return;
                                }

                                if (payload.type === 'query_data' && payload.tablename === 'AD_User_Roles') {
                                    const where = Array.isArray(payload.columns_where) ? payload.columns_where : [];
                                    const byRole = where.find(w => w?.name === 'AD_Role_ID');
                                    const byUser = where.find(w => w?.name === 'AD_User_ID');

                                    if (byRole?.value) {
                                        const rows = await callOdoo({
                                            jsonrpc: '2.0',
                                            method: 'call',
                                            params: {
                                                service: 'object',
                                                method: 'execute_kw',
                                                args: [auth.db, uid, auth.password, 'hr.employee', 'search_read', [[['active', '=', true]]], {
                                                    fields: ['id'],
                                                    limit: 500
                                                }]
                                            },
                                            id: Date.now() + 8
                                        });

                                        const data = (rows || []).map(r => ({ AD_User_ID: String(r.id ?? '') }));
                                        res.setHeader('Content-Type', 'application/json');
                                        res.end(JSON.stringify(data));
                                        return;
                                    }

                                    if (byUser?.value) {
                                        res.setHeader('Content-Type', 'application/json');
                                        res.end(JSON.stringify([{ AD_Role_ID: '1000031' }]));
                                        return;
                                    }

                                    res.setHeader('Content-Type', 'application/json');
                                    res.end(JSON.stringify([{ AD_Role_ID: '1000031' }]));
                                    return;
                                }

                                if (payload.type === 'query_data' && payload.tablename === 'C_BPartner') {
                                    const where = Array.isArray(payload.columns_where) ? payload.columns_where : [];
                                    const partnerDomain = where.map(w => {
                                        const op = odooOp(w?.opertor || '=');
                                        if (w?.name === 'C_BPartner_ID') return ['id', op, w.value];
                                        if (w?.name === 'Name') return ['name', op, w.value];
                                        if (w?.name === 'IsActive') return ['active', op, String(w.value).toUpperCase() === 'Y'];
                                        if (w?.name === 'ReferenceNo') return ['ref', op, w.value];
                                        return null;
                                    }).filter(Boolean);

                                    const rows = await callOdoo({
                                        jsonrpc: '2.0',
                                        method: 'call',
                                        params: {
                                            service: 'object',
                                            method: 'execute_kw',
                                            args: [auth.db, uid, auth.password, 'res.partner', 'search_read', [partnerDomain], {
                                                fields: ['id', 'name', 'display_name', 'active', 'user_id', 'ref'],
                                                limit: Number(payload.record_count || 200)
                                            }]
                                        },
                                        id: Date.now() + 4
                                    });

                                    const data = (rows || []).map(p => ({
                                        C_BPartner_ID: String(p.id ?? ''),
                                        Name: p.name || '',
                                        Name2: p.display_name || p.name || '',
                                        TotalOpenBalance: '0',
                                        IsActive: p.active ? 'Y' : 'N',
                                        SalesRep_ID: String(Array.isArray(p.user_id) ? (p.user_id[0] || '') : (p.user_id || '')),
                                        Rating: '',
                                        Value: p.ref || ''
                                    }));

                                    res.setHeader('Content-Type', 'application/json');
                                    res.end(JSON.stringify(data));
                                    return;
                                }

                                if (payload.type === 'query_data' && payload.tablename === 'C_Order') {
                                    const where = Array.isArray(payload.columns_where) ? payload.columns_where : [];
                                    const orderDomain = where.map(w => {
                                        const op = odooOp(w?.opertor || '=');
                                        if (w?.name === 'DocumentNo') return ['name', op, w.value];
                                        if (w?.name === 'C_BPartner_ID') return ['partner_id', op, Number(w.value)];
                                        if (w?.name === 'SalesRep_ID') return ['user_id', op, Number(w.value)];
                                        return null;
                                    }).filter(Boolean);

                                    const rows = await callOdoo({
                                        jsonrpc: '2.0',
                                        method: 'call',
                                        params: {
                                            service: 'object',
                                            method: 'execute_kw',
                                            args: [auth.db, uid, auth.password, 'sale.order', 'search_read', [orderDomain], {
                                                fields: ['id', 'name', 'note', 'date_order', 'commitment_date', 'amount_total', 'state', 'partner_id', 'user_id'],
                                                limit: Number(payload.record_count || 200)
                                            }]
                                        },
                                        id: Date.now() + 5
                                    });

                                    const data = (rows || []).map(o => ({
                                        C_Order_ID: String(o.id ?? ''),
                                        DocumentNo: o.name || '',
                                        Description: o.note || '',
                                        DateOrdered: o.date_order || '',
                                        DatePromised: o.commitment_date || o.date_order || '',
                                        GrandTotal: String(o.amount_total ?? 0),
                                        DocStatus: o.state || '',
                                        C_BPartner_ID: String(Array.isArray(o.partner_id) ? (o.partner_id[0] || '') : (o.partner_id || ''))
                                    }));

                                    res.setHeader('Content-Type', 'application/json');
                                    res.end(JSON.stringify(data));
                                    return;
                                }

                                if (payload.type === 'query_data' && payload.tablename === 'R_RequestType') {
                                    let data = [];
                                    try {
                                        const rows = await callOdoo({
                                            jsonrpc: '2.0',
                                            method: 'call',
                                            params: {
                                                service: 'object',
                                                method: 'execute_kw',
                                                args: [auth.db, uid, auth.password, 'helpdesk.ticket.type', 'search_read', [[]], {
                                                    fields: ['id', 'name', 'active'],
                                                    limit: Number(payload.record_count || 200)
                                                }]
                                            },
                                            id: Date.now() + 6
                                        });
                                        if (Array.isArray(rows) && rows.length > 0) {
                                            data = rows.map(r => ({
                                                R_RequestType_ID: String(r.id ?? ''),
                                                Name: r.name || ''
                                            }));
                                        }
                                    } catch (e) {
                                        console.warn('[Proxy] helpdesk.ticket.type lookup failed:', e?.message);
                                    }

                                    if (data.length === 0) {
                                        try {
                                            const rows = await callOdoo({
                                                jsonrpc: '2.0',
                                                method: 'call',
                                                params: {
                                                    service: 'object',
                                                    method: 'execute_kw',
                                                    args: [auth.db, uid, auth.password, 'helpdesk.tag', 'search_read', [[]], {
                                                        fields: ['id', 'name'],
                                                        limit: Number(payload.record_count || 200)
                                                    }]
                                                },
                                                id: Date.now() + 7
                                            });
                                            if (Array.isArray(rows) && rows.length > 0) {
                                                data = rows.map(r => ({
                                                    R_RequestType_ID: String(r.id ?? ''),
                                                    Name: r.name || ''
                                                }));
                                            }
                                        } catch (e) {
                                            console.warn('[Proxy] helpdesk.tag fallback failed:', e?.message);
                                        }
                                    }

                                    if (data.length === 0) {
                                        data = [
                                            { R_RequestType_ID: '1', Name: 'Support' },
                                            { R_RequestType_ID: '2', Name: 'Maintenance' },
                                            { R_RequestType_ID: '3', Name: 'Installation' }
                                        ];
                                    }

                                    res.setHeader('Content-Type', 'application/json');
                                    res.end(JSON.stringify(data));
                                    return;
                                }

                                if (payload.tablename === 'R_Request') {
                                    const m2o = (v) => (Array.isArray(v) ? v[0] : v);
                                    const colsWhere = Array.isArray(payload.columns_where) ? payload.columns_where : [];
                                    const lim = Number(payload.record_count || 200);

                                    const employeeIdToOdooUserId = async (legacyId) => {
                                        const str = String(legacyId ?? '').trim();
                                        const n = Number(str);
                                        if (!str || !Number.isFinite(n) || n <= 0) return null;

                                        // 1) If the legacyId is already a res.users id, use it (avoids hr.employee ACL issues).
                                        try {
                                            const chkUser = await callOdoo({
                                                jsonrpc: '2.0',
                                                method: 'call',
                                                params: {
                                                    service: 'object',
                                                    method: 'execute_kw',
                                                    args: [auth.db, uid, auth.password, 'res.users', 'search_read', [[['id', '=', n]]], {
                                                        fields: ['id'],
                                                        limit: 1
                                                    }]
                                                },
                                                id: Date.now() + 80
                                            });
                                            if (chkUser?.length === 1) return n;
                                        } catch (e) {
                                            // ignore and continue
                                        }

                                        // 2) If legacyId is a partner id, resolve res.users via partner_id (e.g. 7457 -> 108).
                                        try {
                                            const byPartner = await callOdoo({
                                                jsonrpc: '2.0',
                                                method: 'call',
                                                params: {
                                                    service: 'object',
                                                    method: 'execute_kw',
                                                    args: [auth.db, uid, auth.password, 'res.users', 'search_read', [[['partner_id', '=', n]]], {
                                                        fields: ['id'],
                                                        limit: 1
                                                    }]
                                                },
                                                id: Date.now() + 81
                                            });
                                            if (byPartner?.length === 1 && byPartner[0]?.id) return Number(byPartner[0].id);
                                        } catch (e) {
                                            // ignore and continue
                                        }

                                        // 3) hr.employee bridge (works only when hr.employee is readable).
                                        const uidRow = async (domain, rid) => {
                                            try {
                                                const rows = await callOdoo({
                                                    jsonrpc: '2.0',
                                                    method: 'call',
                                                    params: {
                                                        service: 'object',
                                                        method: 'execute_kw',
                                                        args: [auth.db, uid, auth.password, 'hr.employee', 'search_read', [domain], {
                                                            fields: ['user_id'],
                                                            limit: 2
                                                        }]
                                                    },
                                                    id: rid
                                                });
                                                if (!rows?.length) return null;
                                                if (rows.length > 1) console.warn('[Proxy] hr.employee lookup ambiguous for domain', domain);
                                                const u = m2o(rows[0].user_id);
                                                return u ? Number(u) : null;
                                            } catch (e) {
                                                console.warn('[Proxy] hr.employee lookup blocked (ACL)', e?.message);
                                                return null;
                                            }
                                        };

                                        let u = await uidRow([[['id', '=', n]]], Date.now() + 8);
                                        if (u) return u;
                                        u = await uidRow([[['user_id.partner_id', '=', n]]], Date.now() + 9);
                                        if (u) return u;
                                        u = await uidRow([[['user_id', '=', n]]], Date.now() + 12);
                                        return u;
                                    };

                                    const buildHelpdeskTicketDomain = async () => {
                                        const domain = [];
                                        for (const w of colsWhere) {
                                            if (!w?.name || !w.opertor) continue;
                                            const op = odooOp(w.opertor);
                                            const v = w.value;
                                            if (w.name === 'DocumentNo') {
                                                const s = String(v ?? '').trim();
                                                // In Odoo UI the visible ticket number is often ticket_ref like "RT20004555".
                                                // Map equality on DocumentNo to ticket_ref first; fallback to name for legacy uses.
                                                if (op === '=' && s) {
                                                    domain.push(['ticket_ref', '=', s]);
                                                } else {
                                                    domain.push(['name', op, s]);
                                                }
                                            } else if (w.name === 'R_Request_ID') {
                                                domain.push(['id', op, Number(v)]);
                                            } else if (w.name === 'C_BPartner_ID') {
                                                domain.push(['partner_id', op, Number(v)]);
                                            } else if (w.name === 'SalesRep_ID') {
                                                const str = String(v ?? '').trim();
                                                if (!str) {
                                                    domain.push(['user_id', '=', false]);
                                                } else {
                                                    const odooUserId = await employeeIdToOdooUserId(str);
                                                    console.log('[Proxy][Tickets] SalesRep_ID legacy=', str, '→ resolved res.users id=', odooUserId);
                                                    const n = Number(str);
                                                    const pushMine = (uidVal) => {
                                                        const uidNum = Number(uidVal);
                                                        if (!Number.isFinite(uidNum) || uidNum <= 0) return false;
                                                        domain.push('|');
                                                        domain.push(['user_id', '=', uidNum]);
                                                        domain.push(['create_uid', '=', uidNum]);
                                                        return true;
                                                    };
                                                    if (odooUserId) {
                                                        pushMine(odooUserId);
                                                    } else if (Number.isFinite(n) && n > 0) {
                                                        const chk = await callOdoo({
                                                            jsonrpc: '2.0',
                                                            method: 'call',
                                                            params: {
                                                                service: 'object',
                                                                method: 'execute_kw',
                                                                args: [auth.db, uid, auth.password, 'res.users', 'search_read', [[['id', '=', n]]], {
                                                                    fields: ['id'],
                                                                    limit: 1
                                                                }]
                                                            },
                                                            id: Date.now() + 13
                                                        });
                                                        if (chk?.length === 1) {
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
                                            }
                                        }
                                        return domain;
                                    };

                                    const resolveAssignee = async (legacyId) => {
                                        const str = String(legacyId ?? '').trim();
                                        if (!str) return false;
                                        const resolved = await employeeIdToOdooUserId(str);
                                        if (resolved) return resolved;
                                        const n = Number(str);
                                        if (!Number.isFinite(n) || n <= 0) return false;
                                        const users = await callOdoo({
                                            jsonrpc: '2.0',
                                            method: 'call',
                                            params: {
                                                service: 'object',
                                                method: 'execute_kw',
                                                args: [auth.db, uid, auth.password, 'res.users', 'search_read', [[['id', '=', n]]], {
                                                    fields: ['id'],
                                                    limit: 1
                                                }]
                                            },
                                            id: Date.now() + 14
                                        });
                                        return users?.length === 1 ? n : false;
                                    };

                                    const mapTicket = (ticket) => ({
                                        R_Request_ID: String(ticket.id ?? ''),
                                        // Prefer Odoo's ticket reference/sequence (e.g. RT20004555) when available.
                                        DocumentNo: String(ticket.ticket_ref || `RT${String(ticket.id ?? '').trim()}`),
                                        Summary: ticket.name || '',
                                        Priority: ticket.priority || '',
                                        Created: ticket.create_date || '',
                                        R_Status_ID: String(m2o(ticket.stage_id) || ''),
                                        R_Status_Name: String(Array.isArray(ticket.stage_id) ? (ticket.stage_id[1] || '') : ''),
                                        SalesRep_ID: String(m2o(ticket.user_id) || ''),
                                        C_BPartner_ID: String(m2o(ticket.partner_id) || ''),
                                        CreatedBy: String(m2o(ticket.create_uid) || ''),
                                        AD_User_ID: String(m2o(ticket.partner_id) || ''),
                                        Result: ticket.description || '',
                                        QtySpent: String(ticket.x_qty_spent || 0),
                                        HoursOvertime: String(ticket.x_hours_overtime || 0),
                                        R_RequestType_ID: '',
                                        C_Order_ID: ''
                                    });

                                    if (payload.type === 'query_data') {
                                        let rows = [];
                                        try {
                                            const ticketDomain = await buildHelpdeskTicketDomain();
                                                console.log('[Proxy][Tickets] helpdesk.ticket domain:', JSON.stringify(ticketDomain));
                                            rows = await callOdoo({
                                                jsonrpc: '2.0',
                                                method: 'call',
                                                params: {
                                                    service: 'object',
                                                    method: 'execute_kw',
                                                        args: [auth.db, uid, auth.password, 'helpdesk.ticket', 'search_read', [ticketDomain], {
                                                            fields: ['id', 'name', 'ticket_ref', 'priority', 'create_date', 'stage_id', 'user_id', 'partner_id', 'create_uid', 'description'],
                                                        limit: lim
                                                    }]
                                                },
                                                id: Date.now() + 9
                                            });
                                                console.log('[Proxy][Tickets] helpdesk.ticket rows:', Array.isArray(rows) ? rows.length : 'non-array');
                                        } catch (e) {
                                            console.error('[Proxy] helpdesk.ticket search_read failed:', e?.message || e);
                                        }
                                        const data = (rows || []).map(mapTicket);
                                        res.setHeader('Content-Type', 'application/json');
                                        res.end(JSON.stringify(data));
                                        return;
                                    }

                                    if (payload.type === 'create_data') {
                                        const colMap = {};
                                        (payload.columns || []).forEach((c) => { colMap[c.name] = c.value; });
                                        const assignUid = await resolveAssignee(colMap.SalesRep_ID);
                                        const vals = {
                                            name: colMap.Summary || 'New Ticket',
                                            description: colMap.Result || '',
                                            partner_id: colMap.C_BPartner_ID ? Number(colMap.C_BPartner_ID) : false,
                                            user_id: assignUid || false
                                        };
                                        const recordId = await callOdoo({
                                            jsonrpc: '2.0',
                                            method: 'call',
                                            params: {
                                                service: 'object',
                                                method: 'execute_kw',
                                                args: [auth.db, uid, auth.password, 'helpdesk.ticket', 'create', [vals], {}]
                                            },
                                            id: Date.now() + 10
                                        });
                                        res.setHeader('Content-Type', 'application/json');
                                        res.end(JSON.stringify([{ massage: 'Record Created', Value: String(recordId), RECORDID: String(recordId) }]));
                                        return;
                                    }

                                    if (payload.type === 'update_data') {
                                        const ticketDomain = await buildHelpdeskTicketDomain();
                                        const found = await callOdoo({
                                            jsonrpc: '2.0',
                                            method: 'call',
                                            params: {
                                                service: 'object',
                                                method: 'execute_kw',
                                                args: [auth.db, uid, auth.password, 'helpdesk.ticket', 'search_read', [ticketDomain], {
                                                    fields: ['id'],
                                                    limit: 1
                                                }]
                                            },
                                            id: Date.now() + 11
                                        });
                                        if (!Array.isArray(found) || found.length === 0) {
                                            res.setHeader('Content-Type', 'application/json');
                                            res.end(JSON.stringify([{ massage: 'Record Not Found' }]));
                                            return;
                                        }
                                        const colMap = {};
                                        (payload.columns || []).forEach((c) => { colMap[c.name] = c.value; });
                                        const vals = {};
                                        if (colMap.Summary) vals.name = colMap.Summary;
                                        if (colMap.Result !== undefined) vals.description = colMap.Result;
                                        if (colMap.SalesRep_ID !== undefined) {
                                            const s = String(colMap.SalesRep_ID ?? '').trim();
                                            vals.user_id = s ? await resolveAssignee(s) : false;
                                        }
                                        if (colMap.C_BPartner_ID) vals.partner_id = Number(colMap.C_BPartner_ID);
                                        // iDempiere legacy status ids are large (e.g. 1000013). Odoo helpdesk.stage ids are usually small.
                                        // If a legacy id is provided, map it to an Odoo stage by name.
                                        const resolveStageIdByNames = async (names) => {
                                            for (const raw of (names || [])) {
                                                const n = String(raw || '').trim();
                                                if (!n) continue;
                                                try {
                                                    const rows = await callOdoo({
                                                        jsonrpc: '2.0',
                                                        method: 'call',
                                                        params: {
                                                            service: 'object',
                                                            method: 'execute_kw',
                                                            args: [auth.db, uid, auth.password, 'helpdesk.stage', 'search_read', [[['name', 'ilike', n]]], {
                                                                fields: ['id', 'name'],
                                                                limit: 1
                                                            }]
                                                        },
                                                        id: Date.now() + 90
                                                    });
                                                    if (Array.isArray(rows) && rows.length === 1 && rows[0]?.id) return Number(rows[0].id);
                                                } catch (e) {
                                                    // ignore and try next
                                                }
                                            }
                                            return null;
                                        };
                                        if (colMap.R_Status_ID !== undefined) {
                                            const raw = String(colMap.R_Status_ID ?? '').trim();
                                            const n = Number(raw);
                                            if (Number.isFinite(n) && n > 0 && n < 100000) {
                                                vals.stage_id = n;
                                            } else if (raw) {
                                                // Close-like statuses in legacy
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
                                        try {
                                            await callOdoo({
                                                jsonrpc: '2.0',
                                                method: 'call',
                                                params: {
                                                    service: 'object',
                                                    method: 'execute_kw',
                                                    args: [auth.db, uid, auth.password, 'helpdesk.ticket', 'write', [[found[0].id], vals], {}]
                                                },
                                                id: Date.now() + 12
                                            });
                                            res.setHeader('Content-Type', 'application/json');
                                            res.end(JSON.stringify([{ massage: 'Record Updated', RECORDID: String(found[0].id) }]));
                                            return;
                                        } catch (e) {
                                            console.error('[Proxy] helpdesk.ticket write failed:', e?.message || e);
                                            res.statusCode = 500;
                                            res.setHeader('Content-Type', 'application/json');
                                            res.end(JSON.stringify([{ massage: `Update Failed: ${e?.message || 'Unknown error'}` }]));
                                            return;
                                        }
                                    }
                                }

                                // Fallback for unsupported local calls to avoid hard crash
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify([]));
                                return;
                            }

                            if (target === 'openai-realtime') {
                                // Realtime API uses a special endpoint for ephemeral session tokens
                                const OPENAI_API_KEY =  import.meta.env.VITE_OPENAI_API_KEY;;
                                
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
                                console.log("[Proxy] OpenAI Response:", JSON.stringify(data));
                                res.statusCode = response.status;
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify(data));
                                return;
                            }

                            if (target === 'openai-transcriptions') {
                                const OPENAI_API_KEY =  import.meta.env.VITE_OPENAI_API_KEY;;
                                const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
                                    method: "POST",
                                    headers: {
                                        "Authorization": `Bearer ${OPENAI_API_KEY}`
                                    },
                                    body: req
                                });
                                const data = await response.json();
                                res.statusCode = response.status;
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify(data));
                                return;
                            }

                            if (target === 'openai-tts') {
                                const OPENAI_API_KEY =  import.meta.env.VITE_OPENAI_API_KEY;
                                const response = await fetch("https://api.openai.com/v1/audio/speech", {
                                    method: "POST",
                                    headers: {
                                        "Authorization": `Bearer ${OPENAI_API_KEY}`,
                                        "Content-Type": "application/json"
                                    },
                                    body: JSON.stringify(req.body)
                                });
                                const buffer = Buffer.from(await response.arrayBuffer());
                                res.statusCode = response.status;
                                res.setHeader('Content-Type', 'audio/mpeg');
                                res.end(buffer);
                                return;
                            }

                            if (target === 'gemini') {
                                // Proxy for Google Gemini
                                const GEMINI_API_KEY = "AIzaSyDLT0mmUu7FZkrZqWG9z2KiOVF3q09gR_E";
                                const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

                                console.log("[Proxy] Sending to Gemini...");
                                const response = await fetch(apiUrl, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(req.body)
                                });

                                const data = await response.json();
                                if (data.error) {
                                    console.error("[Proxy] Gemini API Error:", data.error.message);
                                } else {
                                    console.log("[Proxy] Gemini Response received successfully");
                                }
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify(data));
                                return;
                            }

                            if (target === 'telegram-updates') {
                                const TELEGRAM_BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || "").toString().trim();
                                if (!TELEGRAM_BOT_TOKEN) {
                                    res.statusCode = 500;
                                    res.setHeader('Content-Type', 'application/json');
                                    res.end(JSON.stringify({ error: 'TELEGRAM_BOT_TOKEN is not configured' }));
                                    return;
                                }

                                const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=-10`);
                                const data = await response.json();
                                res.statusCode = response.status;
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify(data));
                                return;
                            }

                            if (target === 'telegram-send') {
                                const TELEGRAM_BOT_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || "").toString().trim();
                                if (!TELEGRAM_BOT_TOKEN) {
                                    res.statusCode = 500;
                                    res.setHeader('Content-Type', 'application/json');
                                    res.end(JSON.stringify({ ok: false, error: 'TELEGRAM_BOT_TOKEN is not configured' }));
                                    return;
                                }

                                const { chatId, text, replyMarkup } = req.body || {};
                                if (!chatId || !text) {
                                    res.statusCode = 400;
                                    res.setHeader('Content-Type', 'application/json');
                                    res.end(JSON.stringify({ ok: false, error: 'chatId and text are required' }));
                                    return;
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
                                res.statusCode = response.status;
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify(data));
                                return;
                            }
                        } catch (e) {
                            console.error("[Local Proxy Error]", e);
                            res.statusCode = 500;
                            res.setHeader('Content-Type', 'application/json');
                            res.end(JSON.stringify([{ massage: e?.message || 'Local proxy error' }]));
                            return;
                        }
                    }
                    next();
                });
            }
        }
    ],
    server: {
        port: 3000,
        open: true,
        proxy: {
            '/mena-api': {
                target: 'https://hrms.menaitechsystems.com',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/mena-api/, '')
            }
        }
    }
});
