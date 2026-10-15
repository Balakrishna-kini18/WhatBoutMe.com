# Microsoft 365 One Mail Calendar (Microsoft Graph) Integration Setup

This guide provides instructions for configuring and authenticating the WhatBoutMe LMS with Microsoft 365 / Microsoft Graph API for calendar management, clash detection, and session synchronization.

---

## Architecture Overview

WhatBoutMe LMS integrates with Microsoft Graph using the **OAuth 2.0 Client Credentials Grant** (Application Permissions). This enables the backend service (`apps/api`) to:
1. **Inspect Trainer / Organizer Free/Busy Schedules:** Call `POST /v1.0/users/{email}/calendar/getSchedule` to detect scheduling clashes across live sessions, 1:1 coaching calls, and webinars before booking.
2. **Synchronize Calendar Events:** Create, update, reschedule, and delete Outlook calendar events via `POST/PATCH/DELETE /v1.0/users/{email}/calendar/events`.
3. **Resilience & Rate-Limiting:** Handle HTTP 429 throttling (`Retry-After` header) and transient 503 gateway errors with exponential backoff.
4. **Zero-Configuration Fallback & Production Safety:** When Azure AD credentials are omitted in development, the LMS operates seamlessly in safe **Mock/Fallback Mode**. In production (`NODE_ENV=production`), missing credentials trigger an explicit error alert unless `ALLOW_CALENDAR_MOCK=true` is explicitly declared.
5. **Event Correlation via `transactionId`:** LMS session UUIDs are correlated with Microsoft Graph events using Graph's native `transactionId` property. This prevents duplicate event creation on network retries and enables resolving events without modifying database models.

---

## Azure Active Directory (Entra ID) App Registration

### Step 1: Register Application in Azure Portal
1. Sign in to the [Microsoft Entra admin center](https://entra.microsoft.com/) or [Azure Portal](https://portal.azure.com/).
2. Navigate to **Identity** > **Applications** > **App registrations**.
3. Select **New registration**:
   - **Name:** `WhatBoutMe LMS Calendar Service`
   - **Supported account types:** `Accounts in this organizational directory only (Single tenant)`
   - **Redirect URI:** Leave blank (not needed for daemon/client credentials grant).
4. Click **Register**. Note down the following values from the **Overview** blade:
   - **Application (client) ID**
   - **Directory (tenant) ID**

### Step 2: Generate Client Secret
1. In your App Registration, select **Certificates & secrets** > **Client secrets**.
2. Click **New client secret**:
   - **Description:** `LMS Production API Server`
   - **Expires:** 180 days (or organization recommended rotation interval).
3. Click **Add** and immediately copy the **Value** (not Secret ID). This will not be shown again.

### Step 3: Configure Microsoft Graph Permissions
1. Select **API permissions** > **Add a permission** > **Microsoft Graph**.
2. Select **Application permissions** (daemon/background service).
3. Search for and select the following permissions:
   - `Calendars.ReadWrite` (Allows reading and creating calendar events across organizational mailboxes).
   - `User.Read.All` (Optional, allows validating trainer/organizer mailbox existence).
4. Click **Add permissions**.
5. **CRITICAL:** Click **Grant admin consent for <Your Organization>** and confirm. The status column must show a green checkmark: *"Granted for <Tenant>"*.

### Step 4 (Optional): Scoping Access to Specific Mailboxes
If your organization restricts application access to specific user mailboxes rather than the entire tenant, an Exchange Administrator can configure an Application Access Policy in Exchange Online PowerShell:
```powershell
New-ApplicationAccessPolicy -AppId "<Your-AZURE_CLIENT_ID>" -PolicyScopeGroupId "TrainersSecurityGroup@whatboutme.com" -AccessRight RestrictAccess -Description "Restrict LMS Calendar App to trainer mailboxes only"
```

---

## Server-Side Environment Variables

Add the following environment variables to your production backend `.env` file (e.g., `apps/api/.env`).

> **SECURITY NOTICE:** NEVER expose these credentials to the frontend apps (`apps/marketing`, `apps/lms`, `apps/admin`) or commit `.env` files to git.

```dotenv
# Microsoft 365 / Azure AD Graph Credentials
AZURE_TENANT_ID=your-tenant-id-uuid-here
AZURE_CLIENT_ID=your-application-client-id-uuid-here
AZURE_CLIENT_SECRET=your-client-secret-value-here

# Default Organizer / Trainer Mailbox for calendar events
MICROSOFT_CALENDAR_DEFAULT_EMAIL=share@whatboutme.com

# Optional flag: set to true only if deliberately testing mock mode in production
ALLOW_CALENDAR_MOCK=false
```

---

## Behavior in Different Environments

| Environment | Variables Configured? | Provider Behavior | Clash Detection |
| :--- | :--- | :--- | :--- |
| **Development / CI (Mock Mode)** | ❌ No | In-memory mock calendar provider. Generates deterministic mock event IDs (`ms-mock-event-*`). | Compares with internal LMS database bookings. Always returns unblocked. |
| **Production without Credentials** | ❌ No | Logs `CRITICAL` error on server start. Falls back to mock mode if `ALLOW_CALENDAR_MOCK=true`. | Warns administrators of missing live calendar synchronization. |
| **Production / Staging (Live)** | ✅ Yes | Obtains Bearer token from `https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token`. | Calls Microsoft Graph `getSchedule` endpoint and rejects slot with HTTP 409 if Outlook busy status is detected. |

---

## Verifying Integration & Running Tests

### Automated Unit Tests (Mock Mode - No Azure Credentials Needed)
The unit test suite validates token caching, rate-limit retries, event payloads, and clash detection logic using mocked HTTP responses:

```bash
# Run Microsoft Graph Provider Unit Tests
cd apps/api
npx vitest run src/modules/sessions/providers/microsoft-graph.provider.spec.ts
```

All 12 tests run in isolated memory without touching network or external APIs.

### End-to-End Live Validation (Requires Real Azure Credentials)
When real Microsoft 365 credentials are provided in `.env`:
1. Start the API server: `npm run dev --filter=@whatboutme/api`
2. In the Admin Portal (`/meetings`), create a session scheduled during a time slot already marked busy on `share@whatboutme.com`'s Outlook calendar.
3. Confirm that the API returns HTTP 409 Conflict: `"The host trainer has an existing Outlook calendar clash during this time window."`
4. Create a session during an open slot and verify that the event appears on the Outlook calendar within seconds.
5. Reschedule the session from `/meetings` and verify that the Outlook calendar event timing updates automatically.
6. Cancel or delete the session and verify that the Outlook event is removed.
