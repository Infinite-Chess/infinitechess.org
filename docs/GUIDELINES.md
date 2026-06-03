# Pull Request Requirements and Guidelines

[← Back to Navigation Guide](./NAVIGATING.md) | [Setup Guide](./SETUP.md) | [Graphics Guide](./GRAPHICS.md)

### All pull requests should only add **one** feature, fix **one** bug, or perform **one** refactoring.

If your changes affect more than one feature, it **must** be refactored into multiple pull requests. If those additional PRs would depend on the code of the first PR, you must wait until the first one is merged before opening the additional ones. To avoid this, while you wait, try to work on features that have no overlap in the codebase, thus allowing multiple PRs at once.

### Title & Description

Titles must be clear to understand.

Descriptions must state what type of change it is (see below), and concicesly describe what it does. If the change required a moderate design decision to be made, please include the reasoning for it, unless you have previously spoken with me about the planned structure. Don't overcomplicate the description, it should be a summary of the changes, not longer than them, and 1-2 sentences minimum.

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

Keep all coding languages to their respective files. For example, shader code goes inside `.glsl` files, and html goes inside `.html` or `.ejs` files, not scripts.

`// prettier-ignore`s are permitted to bypass the prettifier, for any one code block, if you're style is easier to read.

### No code duplication

There may not be any code redundancy. Always refactor to the simplest way things can be expressed.

Use as many prexisting helper methods in the codebase as possible. At times, you may have to refactor out helpers out of existing codebase functions in order to satisfy this.

No dead code or functions that are never called.

### Avoid Complexity

Don't add unnecessary complexity. Use the minimum amount of code & features needed to get the job done.

1. Identify the requirements for adding a new feature.
2. Identify where the website currently lacks in those requirements.
3. Make the **minimum** changes necessary to fulfill those requirements.

Start minimal. Sometimes requirements may not be fully known until halfway through implementation. Start small and only increase requirements when needed.

### Type Safety

All new scripts are required to be written in TypeScript, vs JavaScript.

To retain maximum type safety, no casting via `as` is permitted, only in rare circumstances when it is not simple to get typescript to infer the type, and we are 100% confident of the type. Try to use generics where you can.

No `// ts-ignore`s are permitted, either.

For arguments defined by user input, or needing to be sanitized from the client, use the `zod` package to achieve full type safety.

For all methods that accept a function callback for an argument, like `map()`, `filter()`, `forEach()`, `setTimeout()`, etc., to obtain type safety, don't pass in the function directly, but use a wrapper. For example, don't do `array.map(functionCallback)`, but do do `array.map((item) => functionCallback(item))`. The exception is when adding callbacks for event listeners, as we have to retain the reference to the original function in order to remove the listener later.

### No magic strings

There must be no magic strings. All precise strings that are used in multiple locations must be stored in a constant variable. A string is considered magic if changing it in one place, but not everywhere else, would create a bug.

### Single Responsibility Principle (SRP)

Each script should have one responsibility only. If it has multiple, you **must** refactor it into multiple scripts.

Be aware of context. A script in charge reading and managing the pieces inside the gamefile should not be in charge of knowing the fallback bounding box of the pieces, if there are none. Remember, one responsibility per script.

### Target the Root Cause

Do not opt for "band-aid" patches for bugs that only patch symptoms. Bugs are a sign of something not working how it's designed to. Find the root cause, patch that.

### Functions

Should have one single purpose. If it does multiple things, refactor it out into multiple functions, even if those functions are only called once. Aim for under 40 lines, but it is not mandatory.

Require at least one sentence of JSDoc. Do not make the documentation too verbose, it should be a summary of, and smaller than, the function contents, not overshadowing it.

Arguments only need documentation if it is not common sense what they would be for, or what we should pass in for them (for example, `boardsim` is common sense and doesn't require documentation), or if they don't provide any additional information than what's already in the function description.

Function bodies may also have sparse comments for documentation, to help understand what it's doing and how it works.

### Imports

Opt for using `import type` over `import`, when an import is only used for its type.

Imports are automatically ordered according to the project standard when committing changes.

### Exports

In general, use default exports (e.g. `export default { ... }`) over normal exports `export { ... }`. This reduces global scope pollution. The only exception is when a script has only one exported function, then it may export that function normally.

## Naming

All files, types, and variable names should have clear and easy to understand names.

When writing names, keep context in mind. For example, a script whos responsibility is to save board editor positions should not be named `save.ts`, as `save` doesn't infer any context about the board editor. A better name is `editorsave.ts`, or `esave.ts` for short. Another example: If a script named `guinavigation.ts` is using default exports, and we're writing a function that opens the navigation UI, then choose `open()` for the function name instead of say, `openNavigationUI()`, as for the latter, external application code calling the function would look like `guinavigation.openNavigationUI()`, which duplicates the needed context, vs the simpler `guinavigation.open()`.

### Casing

**Scripts**: Use either lowercase (e.g. `boardutil.ts`) or PascalCase (e.g. `AudioManager.ts`), depending on how universally professional and reusable it is. If it's scope could only ever be used in our repository and game, use lowercase. If it could be pulled out and reused in other projects without significant refactoring, use PascalCase.

**Types**: Use PascalCase (e.g. `OrganizedPieces`)

**Constants**: Use UpperSnakeCase (e.g. `SOUND_OFFSET`).

**Variables**: Use either CamelCase (e.g. `playerColor`) or SnakeCase (e.g. `player_color`), depending on what the script you are working on is using more apparently. Remaining consistent is trump: if many other scripts create a local variable named `timeoutId`, choose that for your local variable name instead of `timeout_id`.

## Static Asset Cache Busting

JS and CSS files emitted by esbuild are content-hashed (e.g. `index-D3TD6A64.js`, `global-A1B2C3D4.css`) and served with `Cache-Control: immutable`. The hash changes automatically whenever the file content changes, so browsers always fetch the latest version.

All other static assets — images, svgs, fonts, and audio — are served with `Cache-Control: max-age=31536000` (no `immutable`). **When any of these files change, you must append or bump a `?v=N` query string on every reference to that file in Nunjucks templates** (e.g. `<img src="/img/logo.png?v=2">`). This forces browsers to treat it as a new URL and fetch the updated file instead of using their cached copy.
