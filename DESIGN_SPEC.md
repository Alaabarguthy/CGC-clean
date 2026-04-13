# ARTELCO Internal Mobile App - Product Design Specification

**Version:** 1.0  
**Status:** Draft / Ready for Design  
**Target Audience:** Internal ARTELCO Employees  
**Platform:** Mobile (iOS & Android)  

---

## 1. Executive Summary

This application serves as the primary mobile interface for ARTELCO employees, abstracting the complexity of the underlying iDempiere ERP into a streamlined, mobile-first experience. It is designed around a dual-interaction model: a powerful **Conversational Interface (Chat)** for quick, guided actions, and a robust **Structured Navigation (GUI)** for browsing and manual management.

**Core Value Proposition:** Complex ERP tasks made simple, guided, and accessible anywhere.

---

## 2. Design Principles & Aesthetics

### Visual Identity
*   **Style:** Corporate, Modern, Professional, "Value Engineering".
*   **Palette:** 
    *   *Primary:* Deep Navy Blue (Trust, Corporate)
    *   *Secondary:* Tech Blue / Cyan (Innovation, Action buttons)
    *   *Backgrounds:* Off-whites and light grays (Cleanliness, Readability)
    *   *Status:* Standard Semantic Colors (Green=Success/Open, Amber=Pending, Red=Critical/Closed) - kept muted, not neon.
*   **Typography:** Clean sans-serif (e.g., Inter or Roboto). High readability. Strong hierarchy (Headers are clear, labels are subtle).
*   **Layout:** Spacious card-based UI. No clutter. One primary action per screen context.

### Interaction Philosophy
*   **"Chat is Action":** The chat isn't just for support; it's a command line for the non-technical. It executes transactions.
*   **"Information is Visual":** Lists, reports, and details are better read in standard UI components, not chat bubbles.
*   **Seamless Switching:** A user can ask a question in chat, click a "View Details" card, be taken to the specific UI screen, and click "Back" to return to the chat context.

---

## 3. Information Architecture

### Main Navigation (Bottom Tab Bar)
1.  **Home:** Dashboard, Quick Actions, Alerts.
2.  **Tickets:** List view of assigned/department tickets.
3.  **Chat (Center, Prominent):** The central AI assistant button.
4.  **Customers:** Search and directory of clients.
5.  **Menu:** Settings, Profile, Logout, ERP deep links if necessary.

---

## 4. Screen-Level Breakdown

### 4.1. Login & Onboarding
**Purpose:** Secure, friction-free entry.
*   **Visuals:** Clean white screen with ARTELCO logo centered top. Minimal inputs.
*   **Inputs:** Email, Password, "Keep me signed in" toggle. biometric auth (FaceID/Fingerprint) prompt after first login.
*   **Action:** "Sign In" (Primary Button).
*   **Onboarding:** A 3-slide carousel on first launch explaining: "ERP in your pocket", "Ask the Assistant anything", "Manage Tickets on the go".

### 4.2. Home / Dashboard
**Purpose:** At-a-glance status and quick entry points.
*   **Header:** "Good Morning, [Name]". Weather/Date snippet. Notification Bell (Icon).
*   **Section 1: Critical Stats (Cards):** "Open Tickets (3)", "Pending Approvals (1)", "My Performance".
*   **Section 2: "Jump Back In":** Recent customers or tickets accessed.
*   **Section 3: Quick Actions (Grid):** "New Ticket", "Lookup Customer", "Check Inventory" (Direct deep-links).
*   **Chat Float:** The Chat FAB (Floating Action Button) is always visible if not in the center tab.

### 4.3. The Chat Interface (Core Pillar)
**Purpose:** Natural language interface for queries and transactions.
*   **Empty State:** ARTELCO logo watermark. Suggestions chips: "Show my open tickets", "Create a ticket for Arab Bank", "How do I process a return?".
*   **Active View:** Standard chat interaction. User right-aligned bubble. System left-aligned.
    *   *Smart Responses:* The system does not just reply with text. It replies with **Interactive Cards**.
    *   *Example:* User: "Find ticket #123". System: Shows a "Ticket Summary Card" giving ID, Status, and Subject, with a "View Full Details" button.
*   **Input Area:** Text field + Voice-to-Text microphone icon.

### 4.4. Ticket Management
**Purpose:** The daily operational workhorse.
*   **List View:**
    *   Filter tabs: "My Tickets", "Dept Tickets", "Critical".
    *   Search bar at top.
    *   Cards show: ID, Customer Name (Bold), Subject, Status Badge, Time elapsed.
*   **Detail View:**
    *   Header: Ticket ID & Status.
    *   Tabs: "Details", "History", "Comments".
    *   **Action Bar (Sticky Bottom):** "Update Status", "Add Note", "Reassign".
    *   **Chat Integration:** A "Discuss this ticket" button that opens the Chat tab with this ticket pre-contextualized.

### 4.5. Customer Profile
**Purpose:** CRM connection.
*   **Search Scren:** Big search bar. Recent searches list.
*   **Profile View:**
    *   Customer Logo/Name.
    *   "Contact" button (Call/Email directly).
    *   "Active Services" list.
    *   "Recent Tickets" lists.
    *   "SLA Status" indicator.

---

## 5. User Journeys

### Journey A: The Chat-Based Workflow (Speed)
1.  **Trigger:** User taps centering "Chat" tab.
2.  **Action:** User types "Open a high priority maintenance ticket for Orange Jordan".
3.  **System:** AI parses intent. Replies: "I can help with that. What is the issue summary?"
4.  **User:** Types "Router failure at HQ data center".
5.  **System:** "Got it. Confirm details: Customer: Orange Jordan. Priority: High. Issue: Router failure at HQ. Create ticket?" (Yes/No buttons).
6.  **User:** Taps "Yes".
7.  **Result:** System replies "Ticket #9901 created successfully." displays a mini-card of the ticket.

### Journey B: The Manual Navigation Workflow (Detail)
1.  **Trigger:** User taps "Tickets" tab.
2.  **Action:** User filters by "Critical" to see the ticket just created.
3.  **Interaction:** Taps the ticket card #9901.
4.  **Review:** Scans the details. Realizes an image needs to be attached.
5.  **Action:** Taps "Add Note/Attachment" in the sticky action bar.
6.  **Input:** Takes a photo of the router error log. Adds text "Error logs attached."
7.  **Completion:** Taps "Save". Returns to ticket detail view.

### Journey C: The Hybrid Flow
1.  **Context:** User is viewing a specialized Customer Profile (e.g., "Petra Engineering").
2.  **Need:** Needs to know the SLA contract terms for this specific customer, which isn't on the general text summary.
3.  **Action:** User taps the "Ask Assistant" context button on top right of the screen.
4.  **Transition:** Sliding drawer or transition to Chat tab.
5.  **Context Loading:** Chat input says "Asking about Petra Engineering...".
6.  **Query:** User types: "When does their support contract expire?"
7.  **Response:** System queries ERP contract module. Returns: "The Gold Support contract expires on Dec 31, 2026."

---

## 6. Tone & Content Guidelines

*   **Assistant Persona:** Efficient, polite, brief.
    *   *Bad:* "Hey there! I'd love to help you with that ticket." (Too casual/consumer)
    *   *Bad:* "Error 404: Object reference not set." (Too technical)
    *   *Good:* "Ticket #553 updated. Would you like to notify the customer?" (Professional, functional).
*   **Error Messages:** Helpful and specific.
    *   "Could not connect to ERP. Please check your VPN or internet connection."

## 7. Technical/Functional Constraints (For Design Awareness)
*   **Speed:** Designs must imply low latency (quick loaders, optimistic UI updates).
*   **Offline:** If network fails, show "Offline Mode - Read Only" banner at top. Queue actions (like ticket creation) for sync when online.
*   **Data Density:** Avoid horizontal scrolling tables. Use vertical cards with "Show More" expansion.
