# New Page Guide

Quick reference for agents designing or redesigning a page.

---

## File Checklist

| File | Location |
|------|----------|
| Nunjucks template | `src/server/views/<page>.njk` |
| Page CSS | `src/client/css/<page>.css` |
| Page TS entry point | `src/client/scripts/esm/views/<page>.ts` |
| Route | `src/server/routes/root.ts` — add `res.render('<page>.njk')` |
| esbuild entry point | `build/client.ts` — add both `.css` and `.ts` to `ESMEntryPoints` |

---

## Template Structure

```njk
{% extends "layout.njk" %}

{% block title %}Page Title — Infinite Chess{% endblock %}

{% block style %}
<link rel="stylesheet" href="{{ manifest['css/<page>'] }}" />
{% endblock %}

{% block body %}
{% include "components/header/header.njk" %}
<main class="<page>">
  <!-- content -->
</main>
{% endblock %}

{% block script %}
<script type="module" src="{{ manifest['scripts/esm/views/<page>'] }}"></script>
{% endblock %}
```

`lang` and `manifest` are available in every template automatically — do not pass them manually.

---

## SSR Context

`req.memberInfo` contains auth state (set by `verifyJWT` middleware). It can be used directly in templates to conditionally elements depending on login state.
Pass what the template needs as the second argument to `res.render()`:
```ts
res.render('page.njk', { memberInfo: req.memberInfo });
```

**Rule:** SSR everything that affects the first paint (header auth state, profile data, notification count, "NEW" badges). Use client-side fetching only for things triggered by user interaction or that need live updates.

---

## CSS

- All colours must use CSS custom properties, not hardcoded values. The properties are defined on `[data-theme="dark"]` and `[data-theme="light"]` blocks in `global.css` — design/edit them to suit the page's needs. The existing properties are only placeholders.
- Each page stylesheet has one top-level block matching its `<main>` class (e.g. `.login { … }`) to prevent bleed between pages.
- Font stack: `"Noto Sans", Verdana, sans-serif` (already set globally).
- No Tailwind. Utility classes (`.hidden`, `.italic`, etc.) live in `global.css`.

---

## Manifest Keys

Hashed asset URLs are looked up by their source path relative to `src/client/`, extension stripped:

| Source file | Manifest key |
|-------------|-------------|
| `src/client/css/index.css` | `manifest['css/index']` |
| `src/client/scripts/esm/views/index.ts` | `manifest['scripts/esm/views/index']` |
| `src/client/css/global.css` | `manifest['css/global']` — already in `layout.njk` |

---

## Creating a Component (header, footer, etc.)

Components have no route. CSS is colocated with the template. Pages include them with `{% include %}`.

| File | Location |
|------|----------|
| Nunjucks partial | `src/server/views/components/<name>/<name>.njk` |
| Component CSS | `src/client/components/<name>/<name>.css` |

No route entry needed. The component's CSS link goes in `{% block style %}` on pages that use it, or directly in `layout.njk` if used on every page.

---

## Missing Context

If during your designing, you had to spend a considerable amount of tokens deducing further needed context, that would apply to future agents designing other pages, and that would have been much more easily be obtained from this guide, then please update this guide! But keep the new information concise and compact.