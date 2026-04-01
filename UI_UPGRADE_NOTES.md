# UI Upgrade Notes

**Last Updated:** 2026-03-31 21:00 PST

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

1. Add shadcn/ui component library
2. Port theming system (CSS variables, multiple themes)
3. Add Zustand for state management
4. Containerize the backend (Docker)
5. Build frontend as static assets, serve separately
