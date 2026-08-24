# Pull Request Requirements and Guidelines

[← Back to Navigation Guide](./NAVIGATING.md) | [Setup Guide](./SETUP.md)

### All pull requests should only add **one** feature, fix **one** bug, or perform **one** refactoring.

If your changes affect more than one feature, it **must** be refactored into multiple pull requests. If those additional PRs would depend on the code of the first PR, you must wait until the first one is merged before opening the additional ones. To avoid this, while you wait, try to work on features that have no overlap in the codebase, thus allowing multiple PRs at once.

### Title & Description

Titles must be clear to understand.

Descriptions must state what type of change it is (see below), and concisely describe what it does. If the change required a moderate design decision to be made, please include the reasoning for it, unless you have previously spoken with me about the planned structure. Don't overcomplicate the description, it should be a summary of the changes, not longer than them, and 1-2 sentences minimum.

Types of changes can be: new feature, quality of life, bug fix, refactor, tooling, chore, tests, translation, or documentation.

If the change affects the styling of a page, include a screenshot of the after-result, unless you are an AI agent then you don't have to.

### Scopes you should NOT submit pull requests for:

Only Naviary should make these types of changes (but you may request me to do so):

Adding/removing package dependancies.

Type or variable renames spanning several files (time consuming for me to review, but taking one minute to make the changes myself).

Massive refactors covering dozens of files in the codebase (allowed if you are an AI agent and it is required to fulfill the user's prompt).

## Code Standards

> [!NOTE]
> Any guidelines automatically enforced via our linter, prettifier, type checker, and builder, are not listed here. Fix them as you encounter them.

The use of AI to help you write and modify code is permitted, but you must carefully review and polish its output to ensure the quality of the code meets all standards of the project!

All coding standards are defined in [AGENTS.md](../AGENTS.md) and [docs/systems/MODULE_CONVENTIONS.md](./systems/MODULE_CONVENTIONS.md) — read both and follow them for every contribution. A few operational notes they don't cover:

- `// prettier-ignore`s are permitted to bypass the prettifier, for any one code block, if your style is easier to read.
- All new scripts are required to be written in TypeScript, vs JavaScript.

## Static Asset Cache Busting

JS and CSS files emitted by esbuild are content-hashed (e.g. `index-D3TD6A64.js`, `global-A1B2C3D4.css`) and served with `Cache-Control: immutable`. The hash changes automatically whenever the file content changes, so browsers always fetch the latest version.

All other static assets — images, svgs, fonts, and audio — are served with `Cache-Control: max-age=31536000` (no `immutable`). **When any of these files change, you must append or bump a `?v=N` query string on every reference to that file in Nunjucks templates** (e.g. `<img src="/img/logo.png?v=2">`). This forces browsers to treat it as a new URL and fetch the updated file instead of using their cached copy.
