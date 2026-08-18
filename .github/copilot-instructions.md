# infinitechess.org

Copilot-only additions to the project rulebook in `AGENTS.md`, which Copilot loads on its own.

## VS Code tool notes

- **Rename Symbol:** To rename a symbol across all files that import it, point the rename symbol tool at the symbol's name inside a named `export { }` or `export type { }` block — this works for named exports only; `export default { }` object-style exports require manual renaming of all external call sites regardless of where the rename is applied.
