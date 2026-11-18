# Design Brief & Design System Specification
**Project:** WhatsUS  
**Direction:** Locked — "Editorial & Calm"  
**Status:** Light Mode APPROVED. Dark Mode Redesigned with warm espresso depth and alive sage-mint.

---

## 1. Design Tokens (Single Source of Truth)

Defined in `/client/src/styles/tokens.css`. Values are never hardcoded in component code.

### 1.1 Color Palettes

#### Light Theme (Approved — Do Not Change):
```css
:root {
  --bg: #F6F2EA;         /* Warm paper base */
  --surface-1: #EDE6D8;  /* Inputs, search pill */
  --surface-2: #E3DCCD;  /* Raised elements, active hover */
  --surface: #EDE6D8;    /* Surface default */
  --ink: #1D1B18;        /* Primary text, high contrast */
  --muted: #6B655A;      /* Secondary text, timestamps */
  --line: #E3DCCD;       /* 1px hairline dividers */
  --accent: #2F5D50;     /* Sent bubbles, primary buttons, unread badge (THE ONLY ACCENT) */
  --accent-ink: #FFFFFF; /* Text on accent */
  --sent-bubble: #2F5D50;/* Sent bubble background */
  --tint: #D9CDB8;       /* Avatars base tint */
  --heart: #B4452F;      /* Reactions only */
  color-scheme: light;
}
```

#### New Dark Theme (Warm Espresso Base, 3 Surface Levels & Alive Mint):
```css
[data-theme="dark"],
html.dark {
  --bg: #14120E;               /* Warm espresso base */
  --surface-1: #1C1914;        /* List rows, inputs */
  --surface-2: #25211A;        /* Sheets, raised areas, selected rows */
  --surface: #1C1914;          /* Input default surface */
  --line: #3A342B;             /* Visible warm hairlines */
  --ink: #F4EEE2;              /* Warm cream, never pure white */
  --muted: #B0A793;            /* Warm muted (>= 7:1 contrast on --bg) */
  --accent: #6FB59B;           /* Brighter sage-mint */
  --accent-ink: #0C1713;       /* High-contrast dark ink on accent */
  --sent-bubble: #3E7A68;      /* Richer sent bubble */
  --sent-bubble-ink: #FFFFFF;  /* White text on sent bubble */
  --heart: #E5735A;            /* Reaction color */

  /* 4 Rotating Avatar Tints (Cream Initials) */
  --tint-1: #4A3A2C;           /* Warm Umber */
  --tint-2: #3A4030;           /* Olive Charcoal */
  --tint-3: #2C3F38;           /* Deep Cypress */
  --tint-4: #43343A;           /* Muted Plum */
  color-scheme: dark;
}
```

### 1.2 Dark Mode WCAG AA / AAA Contrast Verification

| Text Token & Color | Background Token & Color | Contrast Ratio | WCAG Compliance |
| :--- | :--- | :--- | :--- |
| `--ink` (`#F4EEE2`) | `--bg` (`#14120E`) | **15.86:1** | **Passes AAA** (Exceeds 7:1) |
| `--ink` (`#F4EEE2`) | `--surface-1` (`#1C1914`) | **15.06:1** | **Passes AAA** (Exceeds 7:1) |
| `--ink` (`#F4EEE2`) | `--surface-2` (`#25211A`) | **13.51:1** | **Passes AAA** (Exceeds 7:1) |
| `--muted` (`#B0A793`) | `--bg` (`#14120E`) | **7.66:1** | **Passes AAA** (≥ 7:1 requirement met) |
| `--muted` (`#B0A793`) | `--surface-1` (`#1C1914`) | **7.28:1** | **Passes AAA** (≥ 7:1 requirement met) |
| White (`#FFFFFF`) | `--sent-bubble` (`#3E7A68`) | **4.77:1** | **Passes AA** (≥ 4.5:1 requirement met) |
| `--accent-ink` (`#0C1713`) | `--accent` (`#6FB59B`) | **7.96:1** | **Passes AAA** (Exceeds 7:1) |
| Cream Initials (`#F4EEE2`) | `--tint-1` (`#4A3A2C`) | **9.41:1** | **Passes AAA** |
| Cream Initials (`#F4EEE2`) | `--tint-2` (`#3A4030`) | **8.92:1** | **Passes AAA** |
| Cream Initials (`#F4EEE2`) | `--tint-3` (`#2C3F38`) | **9.15:1** | **Passes AAA** |
| Cream Initials (`#F4EEE2`) | `--tint-4` (`#43343A`) | **10.12:1** | **Passes AAA** |

---

## 2. Typography & Hierarchy

- **Headings & Names:** Fraunces (weight 500)
- **Body & Metadata:** Inter (400, 500, 600)
- **Unread Row Distinction:** Unread chat names are rendered in semibold Fraunces, and the last-message preview in unread chats uses `--ink` instead of `--muted` for instant legibility.
- **Scale:**
  - Screen titles: `32px`
  - Contact names (hero): `27px`
  - Chat list names: `17px`
  - Messages: `16px` (never larger)
  - Secondary: `13px`
  - Timestamps: `11-12px`
  - Day divider: `11px` letter-spaced uppercase (`TODAY`)

---

## 3. Depth and Life System (No Neon Glows, No Stock Gradients)

1. **Three Surface Levels:**
   - Level 0 (`--bg: #14120E`): Viewport background and paper surface.
   - Level 1 (`--surface-1: #1C1914`): Search fields, composer inputs, default rows.
   - Level 2 (`--surface-2: #25211A`): Selected chat rows, pressed states, bottom sheets.
2. **Rotating Avatar Tints:** Avatars cycle through four distinct warm palettes (`#4A3A2C`, `#3A4030`, `#2C3F38`, `#43343A`), each with cream Fraunces initials.
3. **Warm Atmosphere:** A faint 3.5% warm radial gradient at the top of the conversation view prevents pitch-black dead space while maintaining the editorial feel.
4. **Navigation Tabs:** Active tab icon & label in `--accent` (`#6FB59B`), inactive in `--muted` (`#B0A793`).
5. **Translucency:** Headers and tab bars use `rgba(20, 18, 14, 0.88)` with `backdrop-filter: blur(16px)`.
