/**
 * TelegramService - Handles outgoing notifications and automated user linking via ERP
 */
import { AuthService } from './api.js';
import { Config } from './config.js';

function extractChatId(profile) {
    if (!profile) return null;
    const fields = [profile.Fax, profile.Description].filter(Boolean);
    for (const field of fields) {
        const match = String(field).match(/tg_chat_id:\s*(\d+)/i);
        if (match && match[1]) return match[1];
    }
    return null;
}

export const TelegramService = {
    _lastError: '',

    getLastError() {
        return this._lastError || '';
    },
    /**
     * Generate a deep link for the user to connect their account.
     */
    getConnectionLink(userId) {
        return `https://t.me/gc_workspace_bot?start=cgc_${userId}`;
    },

    /**
     * Save the Chat ID to the ERP (AD_User table) instead of LocalStorage
     */
    async linkUser(chatId, userOverride = null) {
        this._lastError = '';
        if (!chatId || isNaN(chatId)) {
            console.error("[Telegram] Invalid Chat ID provided:", chatId);
            this._lastError = 'Invalid Telegram chat ID.';
            return false;
        }

        const user = userOverride || AuthService.getUser();
        if (!user) {
            console.error("[Telegram] No user object found to link.");
            this._lastError = 'User context not found for Telegram linking.';
            return false;
        }

        const existingChatId = extractChatId(user);
        if (existingChatId && String(existingChatId) !== String(chatId)) {
            console.warn(`[Telegram] Link blocked. User already linked to chat ${existingChatId}, attempted ${chatId}.`);
            this._lastError = 'This account is already linked to another Telegram account. Contact admin to reset link.';
            return false;
        }

        // 1. Clear legacy tags from Description if moving to Fax
        const clearedDesc = (user.Description || "").replace(/tg_chat_id:\d+/g, "").trim();
        
        // 2. Format new tag for Fax
        const newFax = `tg_chat_id:${chatId}`;

        const updates = { fax: newFax };
        if (clearedDesc !== (user.Description || "")) {
            updates.description = clearedDesc || " ";
        }

        const res = await AuthService.updateProfile(updates, user.AD_User_ID);

        if (res.success) {
            console.log(`[Telegram] Saved Chat ID ${chatId} to ERP Fax field.`);
            user.Fax = newFax;
            if (updates.description) user.Description = updates.description;

            // Update storage depending on context
            if (userOverride) {
                sessionStorage.setItem('pending_user', JSON.stringify(user));
            } else {
                localStorage.setItem('artelco_user', JSON.stringify(user));
            }
            return true;
        }
        this._lastError = 'Could not save Telegram link to ERP.';
        return false;
    },

    /**
     * Check Telegram Updates for a specific connection token
     * This allows us to "verify" the connection in real-time.
     */
    async pollForConnection(userId) {
        const token = `cgc_${userId}`;
        const url = Config.getProxyUrl('telegram-updates');

        try {
            const response = await fetch(url);
            const data = await response.json();
            if (!data.ok) return null;

            // Look for a message containing our token
            const match = data.result.find(u =>
                u.message &&
                u.message.text &&
                u.message.text.includes(token)
            );

            if (match) {
                return {
                    chatId: match.message.chat.id,
                    username: match.message.from.username || match.message.from.first_name
                };
            }
        } catch (e) {
            console.error("[Telegram] Polling failed", e);
        }
        return null;
    },

    normalizePhone(phone) {
        const digits = String(phone || '').replace(/\D/g, '');
        if (!digits) return '';
        if (digits.startsWith('966')) return digits.substring(3);
        if (digits.startsWith('0')) return digits.substring(1);
        return digits;
    },

    isPhoneMatch(actualPhone, expectedPhones = []) {
        const actual = this.normalizePhone(actualPhone);
        if (!actual) return false;
        const expected = expectedPhones
            .map(p => this.normalizePhone(p))
            .filter(Boolean);
        return expected.some(e => actual === e || actual.endsWith(e) || e.endsWith(actual));
    },

    async requestContactShare(chatId) {
        const message = [
            '✅ Your account was detected.',
            '',
            '<b>Share Contact</b> is not a web link — it is a <b>button on the bar above your keyboard</b> in this chat (Telegram puts it there, not in your browser).',
            '',
            'If you do not see that button: open this same bot in the <b>Telegram mobile app</b> (Telegram Web / desktop often cannot offer Share Contact).',
            '',
            'Then tap the <b>Share Contact</b> key so we can match your phone before sending the OTP.'
        ].join('\n');
        return this.sendMessage(chatId, message, {
            replyMarkup: {
                keyboard: [[{ text: 'Share Contact', request_contact: true }]],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });
    },

    async pollForVerifiedContact(chatId, expectedPhones = []) {
        const url = Config.getProxyUrl('telegram-updates');
        try {
            const response = await fetch(url);
            const data = await response.json();
            if (!data.ok || !Array.isArray(data.result)) return { ok: false };

            const hit = data.result.find(u => {
                const msg = u?.message;
                if (!msg || !msg.contact || !msg.chat) return false;
                if (String(msg.chat.id) !== String(chatId)) return false;
                // Accept only contact shared by same Telegram user in chat.
                if (msg.from?.id && msg.contact?.user_id && String(msg.from.id) !== String(msg.contact.user_id)) return false;
                return this.isPhoneMatch(msg.contact.phone_number, expectedPhones);
            });

            if (hit) {
                return { ok: true, phone: hit.message.contact.phone_number };
            }
            return { ok: false };
        } catch (e) {
            console.error("[Telegram] Contact polling failed", e);
            return { ok: false };
        }
    },

    async sendMessage(chatId, text, options = {}) {
        if (!chatId || !text) {
            console.warn("[Telegram] sendMessage failed: Missing chatId or text");
            return;
        }
        const url = Config.getProxyUrl('telegram-send');
        try {
            console.log(`[Telegram] Sending message to Chat ID: ${chatId}...`);
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chatId: chatId,
                    text: text,
                    replyMarkup: options.replyMarkup || null
                })
            });
            const result = await response.json();
            if (!result.ok) {
                console.warn("[Telegram] API Error:", result.description);
            } else {
                console.log("[Telegram] Message sent successfully!");
            }
            return result.ok;
        } catch (e) {
            console.error("[Telegram] Network Error:", e);
            return false;
        }
    },

    /**
     * Send notification using a profile's Chat ID stored in ERP
     */
    async sendTicketAssignmentNotification(details) {
        const { ticketNo, summary, profile, assignedBy } = details;

        console.log(`[Telegram] Preparing assignment notification for ${profile?.Name || 'Unknown User'}`);

        const chatId = extractChatId(profile);

        if (!chatId) {
            console.warn(`[Telegram] Notification skipped: No Chat ID in ERP profile for ${profile?.Name}`);
            console.log(`[Telegram] Profile Description was: "${profile?.Description || 'EMPTY'}"`);
            return false;
        }

        const safeSummary = (summary || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");

        const message = `
🔔 <b>Ticket Assigned</b>
            
<b>Ticket No:</b> ${ticketNo}
<b>Summary:</b> ${safeSummary}
<b>Assigned From:</b> ${assignedBy}

Please check the app for more details.
        `.trim();

        return this.sendMessage(chatId, message);
    },

    /**
     * Send OTP for Login
     */
    async sendOtp(chatId, otp) {
        const message = `
🔐 <b>CGC Verification Code</b>

Your security code is: <b>${otp}</b>

If you did not request this, please ignore this message.
        `.trim();
        return this.sendMessage(chatId, message);
    }
};
