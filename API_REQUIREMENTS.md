# ARTELCO Mobile App - ERP API Requirements

To connect the mobile app with the iDempiere ERP, we require the following RESTful API endpoints. All responses should be in JSON format.

## 1. Authentication (Mobile + OTP)

*   **`POST /api/auth/send-otp`**
    *   **Purpose:** Triggers an SMS OTP to the employee.
    *   **Body:** `{ "mobile": "+96212345678" }`
    *   **Response:** `{ "status": "success", "message": "OTP sent" }`

*   **`POST /api/auth/login`**
    *   **Purpose:** Verifies OTP and returns session token.
    *   **Body:** `{ "mobile": "+96212345678", "otp": "123456", "device_id": "..." }`
    *   **Response:** 
        ```json
        {
          "token": "eyJhbGciOi...",
          "user": { "id": 101, "name": "Majed", "role": "Engineer" }
        }
        ```

## 2. Dashboard & User Data

*   **`GET /api/user/dashboard`**
    *   **Purpose:** Populates the Home Screen cards.
    *   **Response:**
        ```json
        {
          "stats": {
            "critical_tickets": 3,
            "pending_approval": 1,
            "closed_this_week": 12
          },
          "notifications": [
            { "id": 1, "text": "Server maintenance at 10 PM", "type": "info" }
          ]
        }
        ```

## 3. Ticket Management

*   **`GET /api/tickets`**
    *   **Query Params:** `?status=open|closed&assigned_to=me|dept&page=1`
    *   **Response:** List of ticket summaries (ID, Client Name, Subject, Status, Date).

*   **`GET /api/tickets/{id}`**
    *   **Purpose:** Full ticket details.
    *   **Response:** Detailed object including history logs and comments.

*   **`POST /api/tickets`**
    *   **Purpose:** Create a new ticket.
    *   **Body:** `{ "client_id": 55, "subject": "...", "priority": "High", "description": "..." }`

*   **`POST /api/tickets/{id}/update`**
    *   **Purpose:** Add note, change status, or reassign.
    *   **Body:** `{ "action": "resolve", "note": "Replaced PSU", "attachment": "(base64/url)" }`

## 4. Customer CRM

*   **`GET /api/customers/search`**
    *   **Query Params:** `?q=Arab+Bank`
    *   **Response:** List of matching clients.

*   **`GET /api/customers/{id}`**
    *   **Purpose:** 360-degree view (Active contracts, recent tickets, SLA status).

## 5. AI Assistant / Chat

*   **`POST /api/chat/ask`**
    *   **Purpose:** The core intelligence layer. The mobile app sends the user's natural language; the ERP (or an intermediate AI service) parses it and performs the action.
    *   **Body:** `{ "query": "Show me open tickets for Orange", "context": "home_screen" }`
    *   **Response:**
        ```json
        {
          "text": "Here are the open tickets for Orange Jordan.",
          "action": "render_card",
          "data": { "type": "ticket_list", "items": [...] }
        }
        ```
