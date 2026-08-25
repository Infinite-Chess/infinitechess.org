@AGENTS.md

## Claude Code

The rulebook above governs. These are the Claude Code specifics it deliberately leaves harness-agnostic.

- "Read a file's relevant lines in-session before editing it" is the Edit tool's hard rule, not just guidance — the call fails outright. Bash output is the "shell output" that doesn't count.
- Ignore Auto mode's notice to do file work through Bash — Read/Edit/Write stay the tools here. Bash is still right for search, git and running commands.
- Park issues in your session scratchpad directory.
- Links to code should use markdown link syntax, which the harness renders clickable. Paths resolve against the primary working directory; prefix `../<repo-folder>/` to reach an additional one.
- The active output style sets the _voice_ of a response. The rules above set the _contract_. If they ever conflict, the rules win.
