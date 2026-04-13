/**
 * ARTELCO App Environment Configuration
 */

const WEB_BACKEND_URL = 'https://artelco-app.vercel.app';
const ERP_DIRECT_URL = 'https://cgc-sa.odoo.com/jsonrpc';
const GEMINI_API_KEY = 'AIzaSyDLT0mmUu7FZkrZqWG9z2KiOVF3q09gR_E';
const GEMINI_MODEL = 'gemini-2.0-flash';
const OPENAI_API_KEY =  import.meta.env.VITE_OPENAI_API_KEY;
;

export const Config = {
    isNative() {
        return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
    },

    isLocalhost() {
        return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    },

    getProxyUrl(target) {
        // Native app: call ERP/Gemini directly to avoid stale hosted proxy deployments.
        if (this.isNative()) {
            if (target === 'erp') return ERP_DIRECT_URL;
            if (target === 'gemini') {
                return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
            }
            return `${WEB_BACKEND_URL}/api/proxy?target=${target}`;
        }

        // Local web development: Vite middleware handles /api/proxy.
        if (this.isLocalhost()) {
            return `/api/proxy?target=${target}`;
        }

        // Hosted web fallback.
        return `${WEB_BACKEND_URL}/api/proxy?target=${target}`;
    },

    getOpenAiApiKey() {
        return OPENAI_API_KEY;
    }
};
