# Pending Stack Decisions

Topics yet to be discussed and added to stack.md.

---

## 1. Data Fetching Line
Which data is SSR (embedded in HTML, zero extra round trips) vs. client-fetched-on-load (JS required, second round trip)? Needs a consistent rule applied across all pages. Examples to decide: notification badge count, profile stats, live game state, leaderboard rankings.

---

## 2. Page-to-Page Navigation
Pure MPA (normal browser navigations). But: add `<link rel="prefetch">` on hover? Use the Navigation API for transitions? These affect perceived speed and must be applied consistently.
