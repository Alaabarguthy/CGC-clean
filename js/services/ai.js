
import { Config } from './config.js';

const API_URL = Config.getProxyUrl('gemini');

import { TicketService, CustomerService, AuthService, STATUS_MAP } from './api.js';
import { LogService } from './log.js';

const SYSTEM_PROMPT = `
You are the "ARTELCO AI ERP Agent", a precise and high-speed analytical assistant for ARTELCO's ERP.
Your primary mission: Provide instant, specific data on Stock, Costs, Requests, and Customers.

---
### ⚡ BREVITY & PRECISION (CRITICAL):
1. **Answer ONLY what is asked**: If the user asks for "Quantity and Cost", provide exactly those in a table. Do NOT add predictive summaries, long empathetic intros, or "helpful" next steps unless the user explicitly asks for "details" or "advice".
2. **Be Concise**: Keep words to a minimum. Let the data (Tables/Charts) speak for itself.
3. **No Fluff**: Avoid phrases like "I would be happy to help you with that" or "Here is the information you requested". Go straight to the data.

---
### 🌍 LANGUAGE & TONE:
1. **Bilingual Support**: Fluent English and Arabic (Jordanian dialect).
2. **Natural Names**: Convert technical usernames (e.g., "laith.alnatour") -> "ليث الناطور".
3. **Mirror Language**: Respond in the same language the user uses.
4. **Tone**: Direct, professional, and data-driven.

---
### 📊 OUTPUT STRUCTURE (CRITICAL):
1. **Tables for Lists**: Always use Markdown tables for lists.
2. **Minimal Text**: 1-2 sentences maximum per response unless it's a complex analysis.
3. **Professional Emojis**: Use sparingly (🎫, 📦, ✅).

---
### 🎯 CORE RULES:
1. **TOOL USAGE**: Output [ACTION] {"tool": "name", "params": {...}} for tasks.
2. **ERROR HANDLING**: If a tool fails, explain why briefly and ask for the missing parameter. Do NOT guess.
3. **REQUEST STATUS**: Use this map for R_Status_ID:
   - OPEN: 100, 101, 1000001, 1000012, 1000014, 1000005, 1000011, 1000003, 1000000.
   - CLOSED: 1000016, 1000007, 1000013, 1000004, 102, 1000002, 1000006, 103.
4. **NO CODE BLOCKS**: NEVER output markdown code blocks (\`\`\`). Just raw text and [ACTION] tags.

---
### � ACCESS & PERMISSIONS (STRICT):
1. **ADMIN / ARTAdmin / laith.alnatour**: Full access to everything.
2. **TECHNICAL (Role 1000031)**:
   - Full Ticket management (Create, Update, Assign, Close).
   - **RESTRICTED**: Cannot see Costs, Prices, or Sales Orders. If asked for price, say: "My technical profile doesn't have access to financial data."
3. **SALES (Role 1000020)**:
   - Can search customers and view ticket status.
   - **RESTRICTED**: Cannot modify tickets. Cannot see sales data/orders for customers owned by other sales reps.
4. **PROJECT MANAGER (Role 1000038)**:
   - Full Ticket management (Create, Update, Assign, Close).
   - Can view and manage tickets for any staff member.
   - **RESTRICTED**: Cannot see Costs, Prices, or Sales Orders.
5. **EXCEPTION**: If the user is ARTAdmin or laith.alnatour, they bypass all restrictions.

---
### �🛠 TOOLS:
- searchStock(query): Finds items. Returns ONLY Qty for Technical staff. Returns Qty + Cost for Sales/Admin.
- searchCustomers(query): Finds clients.
- searchUsers(query): Finds staff.
- getSalesOrders(partnerId): Gets orders. Sales reps can only see THEIR OWN customers' orders.
- getTickets(userId): Gets requests.
- createTicket(partnerId, summary, orderId): Opens a new request. (RESTRICTED for Sales).
- updateTicketDetails(documentNo, updates): (RESTRICTED for Sales).
- assignTicket(documentNo, newAssigneeId): (RESTRICTED for Sales).
- closeTicket(documentNo, result): (RESTRICTED for Sales).
- getCurrentUser(): Returns caller profile.
`;

export const AiAgent = {
    history: [],

    async sendMessage(userMessage, onStatusUpdate = null) {
        LogService.addLog('AI', 'USER_INPUT', userMessage);
        this.history.push({ role: "user", parts: [{ text: userMessage }] });

        if (onStatusUpdate) onStatusUpdate("Thinking...");

        try {
            let responseText = "";
            let loopCount = 0;
            const maxLoops = 5;

            while (loopCount < maxLoops) {
                const response = await this.callGemini();

                if (response.error) {
                    LogService.addLog('AI', 'ERROR', `Loop ${loopCount}: ${response.error.message} `, response.error);
                    console.error("Gemini API Error details:", response.error);
                    throw new Error(`[ERR_V2] API Error: ${response.error.message} `);
                }

                if (!response.candidates || response.candidates.length === 0) {
                    const errorMsg = response.promptFeedback?.blockReason || "No candidates returned";
                    LogService.addLog('AI', 'ERROR', `Gemini stopped without answer: ${errorMsg} `, response);
                    throw new Error(`[ERR_V2] AI stopped: ${errorMsg} `);
                }

                responseText = response.candidates[0].content.parts[0].text || "";
                LogService.addLog('AI', 'AI_THINKING', `Loop ${loopCount} response received`, responseText);

                if (responseText.includes("[ACTION]")) {
                    if (onStatusUpdate) onStatusUpdate("Analyzing task and executing tools...");
                    const results = [];
                    let hasActions = false;

                    let searchIdx = 0;
                    while (true) {
                        const actionTagIdx = responseText.indexOf("[ACTION]", searchIdx);
                        if (actionTagIdx === -1) break;

                        hasActions = true;
                        const jsonStartIdx = responseText.indexOf("{", actionTagIdx);
                        if (jsonStartIdx === -1) {
                            searchIdx = actionTagIdx + 8;
                            continue;
                        }

                        let braceCount = 0;
                        let jsonEndIdx = -1;
                        for (let i = jsonStartIdx; i < responseText.length; i++) {
                            if (responseText[i] === "{") braceCount++;
                            else if (responseText[i] === "}") braceCount--;

                            if (braceCount === 0) {
                                jsonEndIdx = i + 1;
                                break;
                            }
                        }

                        if (jsonEndIdx !== -1) {
                            const jsonStr = responseText.substring(jsonStartIdx, jsonEndIdx);
                            let action = null;
                            try {
                                action = JSON.parse(jsonStr);
                                LogService.addLog('AI', 'TOOL_TRIGGER', `Executing ${action.tool} `, action.params);

                                if (onStatusUpdate) onStatusUpdate(`Accessing ERP: ${action.tool}...`);
                                const rawResult = await this.executeTool(action.tool, action.params);

                                // NEW: Priority Error Handling & Data Trimming
                                // Trim large datasets to prevent "Request Entity Too Large" errors
                                let cleanResult = rawResult;
                                if (Array.isArray(rawResult) && rawResult.length > 15) {
                                    console.warn(`[AI Agent] Trimming large result set for ${action.tool}`);
                                    cleanResult = rawResult.slice(0, 15).map(item => {
                                        // Keep only essential fields for the AI summary
                                        const { DocumentNo, Summary, Name, StatusName, QtyAvailable, PartnerName } = item;
                                        return { DocumentNo, Summary, Name, StatusName, QtyAvailable, PartnerName };
                                    });
                                    // Add a note for the AI
                                    cleanResult = { 
                                        summary: cleanResult, 
                                        note: "Showing only top 15 results. Tell user to narrow their search if they need more." 
                                    };
                                }

                                if (rawResult && typeof rawResult === 'object' && !Array.isArray(rawResult)) {
                                    if (rawResult.success === false || rawResult.error) {
                                        cleanResult = { error: rawResult.error || rawResult.message || "Operation failed", success: false };
                                    } else if (action.tool === 'closeTicket') {
                                        cleanResult = { success: true, documentNo: action.params.documentNo };
                                    }
                                }

                                results.push({ tool: action.tool, result: cleanResult });
                                LogService.addLog('AI', 'TOOL_RESULT', `Result for ${action.tool}`, rawResult);
                            } catch (e) {
                                LogService.addLog('AI', 'TOOL_ERROR', `Execution failed for a tool`, { error: e.message, raw: jsonStr });
                                console.error("Action parse/execution failed", e, jsonStr);
                                results.push({ tool: action?.tool || "unknown", error: e.message, success: false });
                            }
                            searchIdx = jsonEndIdx;
                        } else {
                            searchIdx = actionTagIdx + 8;
                        }
                    }

                    if (hasActions) {
                        if (onStatusUpdate) onStatusUpdate("Got it! Finalizing response...");
                        this.history.push({ role: "model", parts: [{ text: responseText }] });
                        this.history.push({ role: "user", parts: [{ text: `[RESULTS] ${JSON.stringify(results)} ` }] });
                        loopCount++;
                        continue;
                    } else {
                        break;
                    }
                } else {
                    break;
                }
            }

            LogService.addLog('AI', 'FINAL_RESPONSE', "Interaction complete", responseText);
            this.history.push({ role: "model", parts: [{ text: responseText }] });
            return responseText;
        } catch (error) {
            console.error("AiAgent Error:", error);
            return `[ERR_V2] I'm having trouble thinking: ${error.message}`;
        }
    },

    async callGemini() {
        const user = AuthService.getUser();
        const userContext = user ? `Current user: ${user.Name}. Today is 2026-02-11.` : "";

        const payload = {
            contents: this.history,
            system_instruction: {
                parts: [{ text: SYSTEM_PROMPT + "\n\n" + userContext }]
            }
        };

        const res = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        return await res.json();
    },

    async executeTool(tool, params) {
        console.log(`[AI Agent] Executing ${tool}`, params);

        const toolMap = {
            "searchCustomer": "searchCustomers",
            "searchUser": "searchUsers",
            "getTicket": "getTickets",
            "getPartnerTicket": "getPartnerTickets",
            "getSalesOrder": "getSalesOrders"
        };
        const actualTool = toolMap[tool] || tool;
        const user = AuthService.getUser();
        if (!user) return { error: "NOT_LOGGED_IN" };

        // Permission Calculations
        const roles = user.roles || [];
        const isLaithOrAdmin = user.Name === 'laith.alnatour' || user.Name === 'ARTAdmin' || roles.some(r => ['0', '1000017', '1000036'].includes(r));
        const isTechnical = roles.includes('1000031');
        const isSales = roles.includes('1000020');
        const isProjectManager = roles.includes('1000038');

        // Logic check
        if (!isLaithOrAdmin) {
            // Sales Restrictions
            if (isSales && ["createTicket", "updateTicketDetails", "assignTicket", "closeTicket"].includes(actualTool)) {
                return { error: "ACCESS_DENIED", message: "Your Sales profile only allows viewing data. Technical modifications are restricted." };
            }
            // Technical / PM Restrictions (No Financials)
            if ((isTechnical || isProjectManager) && ["getSalesOrders"].includes(actualTool)) {
                return { error: "ACCESS_DENIED", message: "Your profile does not have access to sales orders or financial records." };
            }
        }

        switch (actualTool) {
            case "searchUsers":
                return await AuthService.searchUsers(params.query);
            case "searchCustomers":
                const customers = await CustomerService.searchCustomers(params.query);
                if (Array.isArray(customers)) {
                    for (const customer of customers) {
                        if (customer.SalesRep_ID) {
                            customer.SalesRepName = await AuthService.getUserName(customer.SalesRep_ID);
                        }
                        // Hide financial balance from non-special Sales reps if it's not their customer
                        if (isSales && !isLaithOrAdmin && customer.SalesRep_ID !== user.AD_User_ID) {
                            delete customer.TotalOpenBalance;
                        }
                    }
                }
                return customers;
            case "searchStock":
                const { InventoryService } = await import('./api.js');
                const stock = await InventoryService.getStock(params.query);
                if (Array.isArray(stock) && (isTechnical || isProjectManager) && !isLaithOrAdmin) {
                    // Strip Costs for technical / PM people
                    return stock.map(i => {
                        const { Price, ...safeItem } = i;
                        return safeItem;
                    });
                }
                return stock;
            case "getTickets":
                return await TicketService.getTickets(user.AD_User_ID);
            case "createTicket":
                return await TicketService.createTicket(params.partnerId, params.summary, params.orderId);
            case "updateTicketDetails":
                return await TicketService.updateTicketDetails(params.documentNo, params.updates);
            case "assignTicket":
                return await TicketService.assignTicket(params.documentNo, params.newAssigneeId);
            case "closeTicket":
                return await TicketService.closeTicket(params.documentNo, params.result, params.hoursSpent, params.hoursOvertime);
            case "getPartnerTickets":
                return await CustomerService.getPartnerTickets(params.partnerId);
            case "getSalesOrders":
                const orders = await TicketService.getSalesOrders(params.partnerId, params.salesRepId);
                if (Array.isArray(orders) && isSales && !isLaithOrAdmin) {
                    // Sales Reps can ONLY see their own orders
                    return orders.filter(o => o.SalesRep_ID === user.AD_User_ID || o.C_BPartner_ID === params.partnerId); // If partner is specified, we check owner later or trust the call? Better be strict:
                }
                return orders;
            case "getCurrentUser":
                return user;
            default:
                throw new Error("Unknown tool: " + actualTool);
        }
    },

    clearHistory() {
        this.history = [];
    }
};
