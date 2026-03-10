# Pending Stack Decisions

Topics yet to be discussed and added to stack.md.

---

## 1. Build Tool
Content hashing is decided, but not the tool that produces it. Currently esbuild via `build/`. Options: keep custom esbuild pipeline, or move to Vite (dev server + HMR + content hashing + esbuild under the hood).

---

## 2. CSS Methodology
Class naming convention (BEM? plain descriptive?), utility classes (Tailwind? none?), colocated vs centralized styles. Must be decided before building any page or CSS will be inconsistent.

---

## 3. Auth Mechanism for SSR
Currently JWT in localStorage (client-side). SSR requires the server to know auth state at request time → cookie-based session. This is a backend change that must happen before a single page can do server-rendered auth.

---

## 4. Data Fetching Line
Which data is SSR (embedded in HTML, zero extra round trips) vs. client-fetched-on-load (JS required, second round trip)? Needs a consistent rule applied across all pages. Examples to decide: notification badge count, profile stats, live game state, leaderboard rankings.

---

## 5. Page-to-Page Navigation
Pure MPA (normal browser navigations). But: add `<link rel="prefetch">` on hover? Use the Navigation API for transitions? These affect perceived speed and must be applied consistently.
