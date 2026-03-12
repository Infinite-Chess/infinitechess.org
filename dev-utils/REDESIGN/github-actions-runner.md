# GitHub Actions Runner — How It Works

**What the runner process actually is**

The self-hosted runner is a long-running background process (the GitHub `Runner.Listener` binary) that opens a persistent long-poll connection to GitHub's API (`api.github.com`). It sits there doing nothing, just waiting. When a workflow is triggered, GitHub queues a job, the runner picks it up over that connection, downloads the job instructions, runs the steps, and streams logs back to GitHub.

**What triggers the workflow**

Three triggers, each resulting in the same runner waking up and executing steps:

1. `push` to `prod` — someone merges `main → prod` via a PR
2. `workflow_dispatch` — someone clicks "Run workflow" in the GitHub Actions UI, or runs `gh workflow run deploy.yml` from any terminal
3. `repository_dispatch: hydrochess-release` — hydrochess's own CI hits the GitHub API with a `POST /repos/{owner}/{repo}/dispatches` call after publishing a new engine release

**The deploy sequence step by step**

The workflow YAML (which lives in `.github/workflows/deploy.yml`) defines numbered steps. Here's what happens in order:

**Step 1 — Warn connected clients**

The runner makes an HTTP POST to `http://localhost:PORT/API/prepare-restart` with the header `X-Restart-Secret: <RESTART_SECRET>`. Because the runner process is on the same physical machine as the server, this hits the live server over loopback. The server validates the secret against its `.env`, then broadcasts a WebSocket message to every connected client containing the countdown duration. Clients in a game render "Server is restarting, your game will resume soon." Everyone else sees a general warning banner.

**Step 2 — Wait**

The runner step is literally `sleep ${{ inputs.warning_seconds }}` (or a hardcoded default). The runner just waits. GitHub logs show it sitting there. The server is still fully up, serving requests normally. Players are finishing moves, reading the warning.

**Step 3 — Pull, build**

`git pull && npm ci && npm run build` — fetches the latest commit from `prod`, installs dependencies, runs esbuild. This can take 10–30 seconds. During this time the old server process is *still running* — no downtime yet.

**Step 4 — pm2 reload**

`pm2 reload infinitechess` — this is the moment of actual restart. PM2's `reload` command (distinct from `restart`) works like this: it sends a `SIGINT` to the current process, waits for it to exit gracefully, then starts a new process with the freshly built files. For a single-instance Node app, the gap between old process dying and new process being ready is typically under a second. Existing WebSocket connections drop at the moment of SIGINT; clients reconnect automatically via their existing reconnection logic.

**Why the RESTART_SECRET matters**

Without it, anyone who could reach your server's port could trigger the prepare-restart endpoint and spam clients with fake countdown warnings. The secret means only the runner — which has it in GitHub Actions secrets, injected as an environment variable at runtime — can call that endpoint. It never appears in logs or the workflow YAML source.

**The `allowinvites.json` removal**

Previously, before any restart, a human had to manually flip `allowinvites.json` to block new games from starting, wait for games to finish, then restart. This was manual and fragile. With game state persisted to SQLite, there's nothing to protect — interrupted games rehydrate on startup — so the whole mechanism is no longer needed and gets deleted.

**What the runner sees vs. what the server sees**

From the runner's perspective: authenticate → sleep → shell commands → done, report success to GitHub.  
From the server's perspective: receives a local HTTP call → broadcasts over WebSocket → continues running normally → eventually gets SIGINT from PM2 → restarts with new code.  
From a player's perspective: sees a countdown banner → WebSocket drops for under a second → reconnects → game resumes.
