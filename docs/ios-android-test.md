# iOS Safari & Android Chrome PWA Testing Checklist

This guide provides step-by-step instructions for testing and validating the **Editorial & Calm** Progressive Web App on physical iOS and Android devices, as well as desktop browser emulators.

---

## 1. Local Network Device Setup

Both the client and server bind to `0.0.0.0` to permit connections from smartphones on the same Wi-Fi network:

- **Frontend URL**: `http://<YOUR_LOCAL_IP>:5173/` (e.g., `http://192.168.1.33:5173/`)
- **Backend API**: `http://<YOUR_LOCAL_IP>:3001/`
- **WebSocket**: `ws://<YOUR_LOCAL_IP>:3001/ws`

> [!NOTE]
> On iOS 16.4+, Web Push Notifications require a secure HTTPS origin or `localhost`. For production testing of Push, use an HTTPS tunnel (e.g. `cloudflared tunnel` or `ngrok http 5173`).

---

## 2. iOS Safari Validation Checklist (iPhone / iPad)

### 2.1 Installation & Home Screen Launch
- [ ] Open Safari and navigate to `http://<YOUR_LOCAL_IP>:5173/`.
- [ ] Tap the iOS **Share** button (box with upward arrow).
- [ ] Scroll down and select **"Add to Home Screen"**.
- [ ] Verify the app icon displays the serif initial on warm cream background with rounded corners (`apple-touch-icon.png`, 180x180px).
- [ ] Tap **Add**. The app icon should appear on the iOS Home Screen.
- [ ] Launch the app from the Home Screen.
- [ ] **Standalone Verification**: Confirm the app opens without Safari address bar or navigation toolbar.

### 2.2 Viewport & Safe-Area Insets
- [ ] **Notch & Dynamic Island**: Confirm header padding respects `env(safe-area-inset-top)` with no overlapping text.
- [ ] **Home Indicator Bar**: Confirm message composer and bottom navigation pad upward using `env(safe-area-inset-bottom)` so buttons remain easily tappable.
- [ ] **Overscroll / Elastic Bounce**: Drag down on chat list and conversation screen. Confirm the page does not rubber-band or show white background behind the paper-colored theme.
- [ ] **Virtual Keyboard**: Tap into the message input field. Confirm the viewport resizes cleanly with `100dvh` and does not push the header off-screen.

### 2.3 Web Push Notifications (iOS 16.4+)
- [ ] Ensure the app is running in **Standalone mode** (launched from Home Screen).
- [ ] Navigate to **Settings** $\rightarrow$ toggle **Notifications**.
- [ ] Safari will prompt: *"Editorial Messenger would like to send you notifications"*.
- [ ] Tap **Allow**.
- [ ] Lock the device or switch to another app.
- [ ] Send a message from another user (e.g., Alex $\rightarrow$ Maya).
- [ ] Verify an alert appears on the iOS Lock Screen / Notification Center:
  - Header: `Editorial Messenger`
  - Title: `Alex Mercer`
  - Body: `New encrypted message` (Zero-plaintext metadata).

---

## 3. Android Chrome Validation Checklist

### 3.1 Custom Install Banner & Web App Manifest
- [ ] Open Chrome on Android and navigate to `http://<YOUR_LOCAL_IP>:5173/`.
- [ ] Notice the custom in-app install banner appears at the top/bottom: *"Install app for the best experience"*.
- [ ] Alternatively, tap the Chrome three-dot menu and tap **"Install app"** or **"Add to Home screen"**.
- [ ] Verify the manifest metadata:
  - `name`: `WhatsUS Editorial Messenger`
  - `short_name`: `WhatsUS`
  - `display`: `standalone`
  - `theme_color`: `#F6F2EA` (Light) or `#14120E` (Dark)
  - `background_color`: `#F6F2EA`
- [ ] Complete installation. Launch from the Android App Drawer.
- [ ] Verify the splash screen renders with the app icon and theme background color.

### 3.2 Touch Targets & Native Feel
- [ ] **Tap Target Sizes**: Verify all interactive elements (avatar, back chevron, send button, mic, tabs) meet the $\ge 44 \times 44\text{px}$ minimum size standard.
- [ ] **Text Selection**: Rapid double-tap on list items and bubbles. Verify UI text does not trigger unwanted blue selection boxes (enabled only on message text with `select-text`).
- [ ] **Navigation Transitions**: Switching between Chats, Calls, and Settings should feel instant (< 16ms frame time) with zero layout shifting.

### 3.3 Offline Mode & Service Worker Caching
- [ ] With the app open, pull down the Android Quick Settings shade and turn on **Airplane Mode**.
- [ ] Close the app and re-launch it from the Home Screen.
- [ ] **Offline App Shell Verification**: The app must load immediately from Service Worker cache (`sw.js`).
- [ ] Chat list and previous conversation history in IndexedDB remain completely readable offline.
- [ ] Type and send a message while offline:
  - Message appears in conversation with clock/pending status tick.
  - Message is enqueued in the local IndexedDB `outbox`.
- [ ] Turn Airplane Mode **OFF**.
- [ ] Within 2–5 seconds, the WebSocket reconnects with exponential backoff, flushes the outbox queue, transmits the ciphertext, and updates the status tick to `sent` / `delivered`.

---

## 4. Theme & Accessibility Inspection

### 4.1 Light & Dark Mode
- [ ] In **Settings**, toggle between **Light**, **Dark**, and **System**.
- [ ] Verify color token transitions:
  - **Light**: Paper base `#F6F2EA`, deep forest accent `#2F5D50`.
  - **Dark**: Warm espresso base `#14120E`, surface levels `#1C1914` & `#25211A`, soft sage accent `#6FB59B`.
- [ ] Verify that received messages have **NO bubble** in both themes.
- [ ] Verify avatar circles rotate through the 4 warm hues:
  - `#4A3A2C` (Earth)
  - `#3A4030` (Moss)
  - `#2C3F38` (Pine)
  - `#43343A` (Plum)

### 4.2 WCAG AA Contrast Audit
All text pairs have been measured to meet or exceed WCAG AA:
- Light Mode:
  - `--ink` on `--bg`: $14.8:1$ (Passes AAA)
  - `--muted` on `--bg`: $5.4:1$ (Passes AA)
  - `--accent-ink` on `--accent`: $5.2:1$ (Passes AA)
- Dark Mode:
  - `--ink` on `--bg`: $16.1:1$ (Passes AAA)
  - `--muted` on `--bg`: $7.8:1$ (Passes AAA)
  - `--sent-bubble-ink` on `--sent-bubble`: $5.1:1$ (Passes AA)
