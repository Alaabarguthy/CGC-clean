import { AuthService } from './api.js';

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const MENA_BASE = isLocal ? '/mena-api' : 'https://hrms.menaitechsystems.com';

const MENA_CONFIG = {
    baseUrl: `${MENA_BASE}/artelco/index.php/api`,
    auth: {
        UserName: "sa",
        PassWord: "Artelco2013",
        CompanyCode: "Artelco",
        BranchCode: "HQ"
    }
};

let menaToken = null;
let tokenExpiry = 0;

export const MenaitechService = {
    async _getToken() {
        if (menaToken && Date.now() < tokenExpiry) {
            return menaToken;
        }

        try {
            const formData = new FormData();
            formData.append('UserName', MENA_CONFIG.auth.UserName);
            formData.append('PassWord', MENA_CONFIG.auth.PassWord);
            formData.append('CompanyCode', MENA_CONFIG.auth.CompanyCode);
            formData.append('BranchCode', MENA_CONFIG.auth.BranchCode);

            const response = await fetch(`${MENA_CONFIG.baseUrl}/login`, {
                method: 'POST',
                headers: { 'Accept': 'application/json' },
                body: formData
            });

            const result = await response.json();
            if (result.message === "Success" && result.data?.token?.[0]) {
                menaToken = result.data.token[0];
                // Set expiry to 1 hour ( Menaitech tokens usually last longer, but let's be safe)
                tokenExpiry = Date.now() + 3600000;
                return menaToken;
            }
            console.error("[Menaitech] Login Failed:", result);
            return null;
        } catch (e) {
            console.error("[Menaitech] Connection Error:", e);
            return null;
        }
    },

    async validateOvertime(data) {
        const token = await this._getToken();
        if (!token) return { success: false, message: "Authentication failed" };

        try {
            const formData = new FormData();
            formData.append('company_code', MENA_CONFIG.auth.CompanyCode);
            formData.append('branch_code', MENA_CONFIG.auth.BranchCode);
            formData.append('transaction_date', data.date); // Expected format DD/MM/YYYY
            formData.append('transaction_internal_type', '1');
            formData.append('trans_descreption', data.description || 'Submitted from ERP App');
            formData.append('employee_code', data.employeeCode);
            formData.append('transaction_pay_nonpay', '1');
            formData.append('transaction_period', '1');
            formData.append('transaction_amount', data.hours);

            console.log("[Menaitech] Validation Request Payload:", Object.fromEntries(formData));

            const response = await fetch(`${MENA_CONFIG.baseUrl}/overtimerequest/valid`, {
                method: 'POST',
                headers: { 
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            const result = await response.json();
            console.log("[Menaitech] Validation Result:", result);
            return result;
        } catch (e) {
            console.error("[Menaitech] Validation Error:", e);
            return { success: false, message: "Network error during validation" };
        }
    },

    async saveOvertime(data) {
        const token = await this._getToken();
        if (!token) return { success: false, message: "Authentication failed" };

        try {
            const formData = new FormData();
            formData.append('company_code', MENA_CONFIG.auth.CompanyCode);
            formData.append('branch_code', MENA_CONFIG.auth.BranchCode);
            formData.append('transaction_date', data.date);
            formData.append('transaction_internal_type', '1');
            formData.append('trans_descreption', data.description || 'Submitted from ERP App');
            formData.append('employee_code', data.employeeCode);
            formData.append('transaction_pay_nonpay', '1');
            formData.append('transaction_period', '1');
            formData.append('transaction_amount', data.hours);

            console.log("[Menaitech] Save Request Payload:", Object.fromEntries(formData));

            const response = await fetch(`${MENA_CONFIG.baseUrl}/overtimerequest/save`, {
                method: 'POST',
                headers: { 
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            const result = await response.json();
            console.log("[Menaitech] Save Result:", result);
            return result;
        } catch (e) {
            console.error("[Menaitech] Save Error:", e);
            return { success: false, message: "Network error during save" };
        }
    }
};
