# WhatsUS Production Deployment & Google OAuth Setup

This document provides step-by-step instructions for configuring Google Sign-In (Google Identity Services) and deploying WhatsUS in production.

---

## 1. Google Cloud OAuth 2.0 Web Client Setup

WhatsUS relies on Google Identity Services (GIS) for passwordless, zero-SMS authentication. Accounts are bound to Google's stable `sub` claim.

### Step 1: Create or Open a Google Cloud Project
1. Navigate to the [Google Cloud Console](https://console.cloud.google.com/).
2. Select your existing project or create a new project (e.g. `WhatsUs Messenger`).

### Step 2: Configure the OAuth Consent Screen
1. Go to **APIs & Services** > **OAuth consent screen**.
2. Select User Type: **External** and click **Create**.
3. Fill in:
   - **App name**: `WhatsUS`
   - **User support email**: Your administrative contact email.
   - **Developer contact information**: Your administrative contact email.
4. **Scopes**:
   - Add only non-sensitive standard identity scopes:
     - `.../auth/userinfo.email` (`email`)
     - `.../auth/userinfo.profile` (`profile`)
     - `openid`
   - **Do not request any sensitive or restricted scopes.**
5. **Publishing Status (CRITICAL)**:
   - By default, Google Cloud marks new OAuth apps as **"Testing"**. While in "Testing", only users explicitly added to the "Test users" list can log in.
   - **Click "Publish App" and set the status to "In production"**.
   - Note: Standard identity scopes (`openid`, `email`, `profile`) do **not** require Google verification or CASA tier-2 audits.

### Step 3: Create Web OAuth Client Credentials
1. Go to **APIs & Services** > **Credentials**.
2. Click **Create Credentials** > **OAuth client ID**.
3. Select Application type: **Web application**.
4. Set Name: `WhatsUS Web Client`.
5. Under **Authorized JavaScript origins**, add:
   - Development: `http://localhost:5173`
   - Development preview: `http://localhost:3001`
   - Production Domain: `https://129.225.107.71.sslip.io` (or your custom domain)
6. Under **Authorized redirect URIs**:
   - Leave blank (Google Identity Services popup/button uses JavaScript postMessage via GIS `ux_mode: popup` or credential callback, no server redirect URI is required).
7. Click **Create** and copy your **Client ID** (e.g. `1067449631688-lh83oags4uccj9l88q43ns3menofb8tp.apps.googleusercontent.com`).

---

## 2. Server Environment Configuration

Provide `GOOGLE_CLIENT_ID` in your server `.env` or Docker environment:

```ini
NODE_ENV=production
PORT=3001
HOST=0.0.0.0
APP_ORIGIN=https://129.225.107.71.sslip.io

# 32+ byte random cryptographic secret
JWT_SECRET=your_32_byte_random_cryptographic_secret_here

# Google OAuth Web Client ID
GOOGLE_CLIENT_ID=1067449631688-lh83oags4uccj9l88q43ns3menofb8tp.apps.googleusercontent.com

# Web Push VAPID Keys
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@yourdomain.com
```

---

## 3. Mobile PWA & Embedded Webview Considerations

- **Google OAuth Embedded Webview Policy**:
  Google strictly blocks Google Sign-In inside untrusted embedded in-app webviews (such as Facebook, Instagram, or TikTok built-in browsers) returning `disallowed_useragent` error 403.
- **Standalone PWA on iOS & Android**:
  When WhatsUS is installed to the home screen as a standalone PWA via Safari ("Add to Home Screen") or Chrome/Android ("Install app"), Google Identity Services runs inside the system browser engine (WebKit/Chromium) with popup support (`ux_mode: popup`).
- **Testing on Devices**:
  1. Open `https://129.225.107.71.sslip.io` in Safari on iOS and Chrome on Android.
  2. Verify the Google "Sign in with Google" button renders properly.
  3. Verify the sign-in popup opens, prompts for consent, and receives the ID token.
  4. Verify the server verifies token signature, `aud`, `iss`, and single-use `nonce`.
