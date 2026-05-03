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
<main class="<page>">
  <!-- content -->
  {% include "components/header/header.njk" %}
</main>
{% endblock %}

{% block script %}
<script type="module" src="{{ manifest['scripts/esm/views/<page>'] }}"></script>
{% endblock %}
```

`lang`, `dir`, and `manifest` are available in every template automatically — do not pass them manually.

---

## SSR Context

`req.memberInfo` contains auth state (set by `verifyJWT` middleware). Here's the type:
```ts
type MemberInfo = SignedInMemberInfo | SignedOutMemberInfo;

type SignedInMemberInfo = {
	signedIn: true;
	user_id: number;
	username: string;
	roles: Role[] | null;
	browser_id?: string;
};

type SignedOutMemberInfo = {
	signedIn: false;
	browser_id?: string;
};
```
Pass what the template needs as the second argument to `res.render()`:
  ```ts
  res.render('page.njk', { username: req.memberInfo?.username });
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
