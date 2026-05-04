# UI Upgrade Notes

**Last Updated:** 2026-05-04 PST — Claude

Inspired by [SHARP-Processor-2](https://github.com/tomzzzhang/SHARP-Processor-2) (React + TypeScript + Tauri desktop app).

## Decision: Keep Current Stack

**No TypeScript rewrite.** The visual polish comes from the UI layer (shadcn/ui + Tailwind + theming), not from TypeScript. The Primer Designer already uses React + Vite + Tailwind + Radix UI — we're 80% there.

The two projects also diverge on deployment: Processor-2 is a desktop app (Tauri), while Primer Designer needs a hosted backend (BLAST/primer3 can't run in a browser).

## What to Adopt from Processor-2

### 1. shadcn/ui Components
- We already have Radix (the foundation shadcn/ui is built on)
- Adding shadcn/ui is just copying in pre-styled components on top — no rewrite needed
- Gets us the clean, consistent component look

### 2. Theming System
- oklch CSS custom properties for perceptually uniform color transitions
- Multiple themes: light, classic (greyscale), dark
- Class-based theme switching (no reload needed)
- Geist Variable Font as primary sans-serif
- Pure CSS work, language-independent

### 3. Zustand for State Management
- Current app uses raw `useState` scattered across `App.jsx`
- Zustand would centralize state and give undo/redo for free
- Works fine with plain JS (no TypeScript required)

### 4. Visual Polish Details
- Consistent spacing and typography
- Elevation shadows (Material Design style for dark mode)
- Hover feedback (line width changes, color emphasis)
- Smooth transitions via Tailwind Animate CSS
- 18 color palettes in Processor-2 — adapt a subset for Primer Designer

## Processor-2 Full Stack (Reference)

| Layer | Technology |
|---|---|
| Desktop shell | Tauri 2.x (Rust) |
| Frontend | React 19 + TypeScript 5.9+ |
| Build | Vite 8 |
| UI components | shadcn/ui + Radix |
| Styling | Tailwind CSS 4.x + CSS variables (oklch) |
| State | Zustand (with undo/redo, per-tab isolation) |
| Visualization | Plotly.js (react-plotly.js) |
| Icons | Lucide React |
| Utilities | class-variance-authority, clsx, jszip, fflate, OpenPGP |

## Priority Order

1. ~~Add shadcn/ui component library~~ — partially done via custom Tailwind CSS variable system (2026-04-01)
2. ~~Port theming system (CSS variables, multiple themes)~~ — SHARP warm sepia light theme shipped (2026-04-01)
3. Add Zustand for state management
4. Containerize the backend (Docker)
5. Build frontend as static assets, serve separately

---

## Session 2026-04-01 — SHARP Brand Theme Applied

Full visual overhaul inspired by SHARP Processor 2. No TypeScript rewrite; all changes are CSS/Tailwind.

### Color System (`frontend/src/index.css`, `tailwind.config.js`)
- Warm off-white background `#f3f2f0` (`--background: 30 13% 94%`)
- Card surface `#f8f7f6` (`--card: 30 20% 97%`)
- SHARP muted red `#c53035` as primary (`--primary: 358 62% 47%`) — less saturated than logo `#d81f27` but still reads as interactive
- All UI red tokens (buttons, focus rings, checkboxes, active tabs) derived from single `--primary` variable
- `accent-color: var(--brand-red)` globally on checkboxes/radios replaces browser default blue
- `--foreground: 225 4% 14%` (near-black) for all primary-level text

### Typography
- Geist Variable font via `@fontsource-variable/geist`; applied globally and in SVG elements via `style` attribute

### Component Changes
- **Header:** light `bg-card` with dark `text-foreground` (not dark background)
- **Active nav tab / mode button:** `bg-primary text-primary-foreground`
- **Section headers** (`TEMPLATE`, `TARGET REGION`, etc.): `text-foreground font-semibold uppercase tracking-wide`
- **Saved Sequences scroll box:** `border-2 border-border bg-background overflow-y-scroll h-32`, left-border accent on hover, entries with name + size sub-text
- **Saved Configs scroll box:** same treatment
- **SequenceBar target region:** fill `#f5d5d6`, stroke + handles `#c53035` (was blue)
- **TemplateMap target region:** same red tint; all pair rank colors unchanged (intentional multi-color)
- **ResultsTable export bar + row selection:** `bg-primary/5`, `ring-primary/30`

### Bug Fixes (same session)
- **BLAST not found:** `blastn` at `/usr/local/bin` not in backend process PATH. Fixed by resolving full path at import time via `shutil.which` + fallback search of `/usr/local/bin`, `/opt/homebrew/bin`.
- **Vite proxy 503 on SSE:** Added `timeout: 0, proxyTimeout: 0` to vite.config.js proxy config so long-lived streaming connections don't time out.
- **Wrong Node.js picked up:** `/Applications/ccp4-8.0/bin/node` (v16) shadows system Node. Frontend must be launched with `/usr/local/bin/node` explicitly.
