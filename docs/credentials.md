# Credentials: what you need and how to get it

Everything used by the **React/Go companion and provisioning scripts** is configured in the root `.env`. A ready-to-fill file has been created; `.env.example` documents every variable. `.env`, local data, and build caches are excluded from Git. Never use a `VITE_` prefix for secrets: Vite-prefixed settings are exposed to browsers.

## Local demo

No external keys or database account are required. `npm run setup` generates `APP_ADMIN_PASSWORD`. The demo buttons provide access to synthetic data on loopback only. `APP_ADMIN_EMAIL` defaults to `admin@school.local`. `DEMO_PARENT_PASSWORD` is only for password-based demo login; demo role buttons also work without it.

## Zoho OAuth

1. Create or use your own [Zoho One trial](https://www.zoho.com/one/), open CRM, and initialize the organization. Open Creator in the same account. Use a trial/development organization for this assignment.
2. Open the [Zoho API Console](https://api-console.zoho.com/) for your account's data center; Indian accounts generally use [the India console](https://api-console.zoho.in/).
3. Create a **Self Client**. Its Client Secret tab supplies `ZOHO_CLIENT_ID` and `ZOHO_CLIENT_SECRET`. Paste both into `.env`.
4. For schema setup, generate a short-lived grant with these scopes:

   ```text
   ZohoCRM.modules.ALL,ZohoCRM.settings.modules.ALL,ZohoCRM.settings.fields.ALL,ZohoCRM.settings.profiles.READ
   ```

5. Select the correct CRM organization and grant lifetime. Put the generated code in `ZOHO_GRANT_CODE` in `.env` and immediately run:

   ```powershell
   npm.cmd run zoho:token
   ```

6. The script exchanges the code, stores `ZOHO_REFRESH_TOKEN` directly in `.env`, clears the single-use grant code, and updates `ZOHO_API_URL` from Zoho's response. It never prints tokens. A grant code is **not** a refresh token.
7. After provisioning, you can use a separate runtime Self Client/grant restricted to `ZohoCRM.modules.ALL` and replace the three runtime OAuth values. Remove metadata access from the runtime principal when no longer needed.

The API refreshes short-lived access tokens automatically. You do not need to copy an access token into `.env`. Do not change regions to bypass an OAuth error: accounts, tokens, and organization must match. See Zoho's [Self Client flow](https://www.zoho.com/developer/oauth/self-client/authorization-code-flow.html) and [token refresh documentation](https://www.zoho.com/crm/developer/docs/api/v8/refresh.html).

| Variable                 | Source / use                                                               |
| ------------------------ | -------------------------------------------------------------------------- |
| `ZOHO_CLIENT_ID`         | API Console → Self Client → Client Secret                                  |
| `ZOHO_CLIENT_SECRET`     | Same screen; keep private                                                  |
| `ZOHO_REFRESH_TOKEN`     | Created by `npm run zoho:token` from your grant                            |
| `ZOHO_GRANT_CODE`        | Temporary Self Client authorization code; cleared after exchange           |
| `ZOHO_PROFILE_ID`        | Your CRM Administrator profile's numeric ID; used only during provisioning |
| `ZOHO_ACCOUNTS_URL`      | Data-center-specific accounts service                                      |
| `ZOHO_API_URL`           | `api_domain` returned during OAuth; do not include `/crm/v8`               |
| `ZOHO_WEBFORM_EMBED_URL` | Optional generated CRM Webform iframe/share URL, if your CRM provides one  |
| `APP_ADMIN_PASSWORD`     | Random value generated locally by setup; replace if sharing the demo file  |

For a profile ID, open CRM's Administrator profile in Setup → Security Control → Profiles and inspect its numeric identifier, or use the authenticated [Profiles API](https://www.zoho.com/crm/developer/docs/api/v8/profiles-api.html) with `ZohoCRM.settings.profiles.READ`. Do not use a user ID or organization ID in this field.

Typical regional pairs:

| Region    | Accounts                       | API                           |
| --------- | ------------------------------ | ----------------------------- |
| India     | `https://accounts.zoho.in`     | `https://www.zohoapis.in`     |
| US        | `https://accounts.zoho.com`    | `https://www.zohoapis.com`    |
| EU        | `https://accounts.zoho.eu`     | `https://www.zohoapis.eu`     |
| Australia | `https://accounts.zoho.com.au` | `https://www.zohoapis.com.au` |

Prefer the API domain returned by Zoho over guessing a domain. See [Zoho OAuth](https://www.zoho.com/crm/developer/docs/api/v8/oauth-overview.html).

## Creator connection: hosted authentication

Creator runs on Zoho's servers, so native Deluge cannot read your computer's `.env`. In Creator create an OAuth **connection** named exactly `school_crm`, authorize it as the school integration owner, and grant only the CRM read scopes needed for the listed custom modules (the `ZohoCRM.modules.custom.READ` scope covers these custom modules). The parent application does not need Leads, staff passwords, or CRM write scope. Make this a connection owned by the app, rather than asking each parent to connect a CRM account.

Zoho securely stores this connection's OAuth tokens. This is the necessary hosted-platform exception to local `.env` storage; do **not** paste refresh tokens into Deluge, HTML, page parameters, or Creator records. No separate Creator API token is required because the supplied page runs inside Creator and calls CRM through the connection. Parent identities come from invited Creator portal accounts, with email verification and matching `Parent_Links` records.

## Database and other services

The assignment explicitly uses CRM as the primary database. All live student, enrollment, attendance, result and fee records live there. The Creator page reads them directly, with no duplicate school database. The local demo persists synthetic records in `data/demo.json`. **No MongoDB key or URI is required.**

Payments are manually recorded receipts, not online payment processing. The support queue does not send messages. Therefore no payment-provider or email-provider keys are required.
