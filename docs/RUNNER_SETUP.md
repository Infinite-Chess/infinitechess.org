# GitHub Actions Runner Setup

[← Back to Navigation Guide](./NAVIGATING.md)

This guide covers everything needed to bring up automated deployment for `infinitechess.org`:

1. [Install the self-hosted runner on the production Mac](#part-1-install-the-self-hosted-runner)
2. [Configure repository secrets and variables](#part-2-configure-repository-secrets-and-variables)
3. [Add `RESTART_SECRET` to the production `.env`](#part-3-add-restart_secret-to-the-production-env)
4. [Add the `repository_dispatch` trigger to the HydroChess workflow](#part-4-add-the-repository_dispatch-trigger-to-the-hydrochess-workflow)
5. [Verify all three triggers work](#part-5-verify-each-trigger)

> **Note:** PM2 is assumed to be fully configured and running `infinitechess` before starting these steps.

---

## Part 1: Install the Self-Hosted Runner

The self-hosted runner is a small background process that holds a persistent long-poll connection to GitHub. When a deploy workflow is triggered, GitHub wakes the runner and it executes the workflow steps as shell commands on the production machine.

### 1.1 Open the runner registration page

1. Go to `https://github.com/Infinite-Chess/infinitechess.org` on GitHub.
2. Click **Settings → Actions → Runners → New self-hosted runner**.
3. Select **macOS** as the operating system and choose the correct architecture:
    - **x64** for Intel Macs
    - **ARM64** for Apple Silicon (M1/M2/M3)
4. GitHub displays a set of shell commands with the exact download URL, checksum, and a one-time registration token. **Do not close this page** — the token expires after one hour.

### 1.2 Create the runner directory and download the runner

Run the commands shown on the GitHub setup page. They will look like the following (use the exact URLs and checksums from GitHub, not these examples):

```bash
# Create a dedicated directory for the runner, outside the production code directory
mkdir ~/actions-runner && cd ~/actions-runner

# Download the runner package (use the URL shown on the GitHub page)
curl -o actions-runner-osx-arm64-X.Y.Z.tar.gz -L https://github.com/actions/runner/releases/download/vX.Y.Z/actions-runner-osx-arm64-X.Y.Z.tar.gz

# Verify the downloaded file's integrity (use the checksum shown on the GitHub page)
echo "CHECKSUM  actions-runner-osx-arm64-X.Y.Z.tar.gz" | shasum -a 256 -c

# Extract the archive
tar xzf ./actions-runner-osx-arm64-X.Y.Z.tar.gz
```

- **`curl -o … -L`**: Downloads the runner binary. `-o` sets the output filename; `-L` follows redirects.
- **`shasum -a 256 -c`**: Verifies the SHA-256 checksum to ensure the download was not corrupted.
- **`tar xzf`**: Extracts the gzipped tar archive into the current directory.

### 1.3 Configure the runner

Run the configuration command shown on the GitHub setup page. It will look like:

```bash
./config.sh --url https://github.com/Infinite-Chess/infinitechess.org --token <TOKEN>
```

- **`--url`**: The repository the runner will serve jobs for.
- **`--token`**: The one-time registration token from step 1.1.

When prompted:

- **Runner name**: Press **Enter** to accept the default (the machine's hostname), or type a custom name.
- **Additional labels**: Press **Enter** to skip.
- **Work folder**: Press **Enter** to accept the default (`_work`).

### 1.4 Install the runner as a launchd service

Installing as a service means the runner starts automatically on login and survives terminal sessions.

```bash
# Register the runner as a macOS launchd user service
./svc.sh install

# Start the service immediately (no need to log out and back in)
./svc.sh start
```

- **`./svc.sh install`**: Creates a `launchd` plist under `~/Library/LaunchAgents/` so the runner starts every time you log in.
- **`./svc.sh start`**: Starts the service right now.

To check the runner's status at any time:

```bash
./svc.sh status
```

To view runner logs if something goes wrong:

```bash
# Tail the last 50 lines of the runner log
tail -50 ~/actions-runner/_diag/Runner_*.log
```

Once installed, the runner appears as **Online** in **Settings → Actions → Runners** on GitHub.

---

## Part 2: Configure Repository Secrets and Variables

Go to **Settings → Secrets and variables → Actions** on the `infinitechess.org` repository to add the following.

### 2.1 `RESTART_SECRET` (Secret)

The server's `deployController.ts` checks the `X-Restart-Secret` header against this value before performing the pre-deploy database backup. Only the runner (which has this secret injected as an environment variable at runtime) can call that endpoint.

**Generate the secret** by running this command in any terminal:

```bash
openssl rand -hex 32
```

- **`openssl rand -hex 32`**: Generates 32 cryptographically random bytes and encodes them as a 64-character hexadecimal string. Never share or commit this value.

Add the output as a **Secret** named `RESTART_SECRET`. You will also need to add the same value to the production `.env` file — see [Part 3](#part-3-add-restart_secret-to-the-production-env).

### 2.2 `DEPLOY_DIR` (Secret)

The absolute path to the production code directory on the server — the directory where PM2 currently runs the app from and where `git pull` / `npm ci` / `npm run build` should execute.

Example value: `/Users/naviary/infinitechess.org`

Add this as a **Secret** (under the "Secrets" tab) named `DEPLOY_DIR`. Storing it as a secret keeps the server's filesystem layout out of public workflow logs.

### 2.3 `HTTPPORT` (Variable — not a secret)

The HTTP port the production server listens on. The deploy workflow uses this to call `POST /api/prepare-restart` and to run the post-deploy health check, both over loopback.

This must match the `HTTPPORT` value in the production `.env` file.

Add this as an Actions **Variable** (under the "Variables" tab, not "Secrets") named `HTTPPORT`.

---

## Part 3: Add `RESTART_SECRET` to the Production `.env`

Open the production `.env` file (in the root of the `DEPLOY_DIR` directory) and add:

```
RESTART_SECRET=<the same value you added to GitHub Actions secrets>
```

Then reload the server once so it picks up the new environment variable:

```bash
pm2 reload infinitechess
```

- **`pm2 reload infinitechess`**: Performs a graceful reload — starts a new process with the updated env, then shuts down the old one. Zero new code is deployed; this is purely to pick up the updated `.env`.

---

## Part 4: Add the `repository_dispatch` Trigger to the HydroChess Workflow

The HydroChess `build-wasm.yml` workflow must fire a `repository_dispatch` event on `infinitechess.org` **after** the engine release is fully published. Placing this as the very last step guarantees the new WASM binaries are available before the infinitechess.org build runs.

### 4.1 Create a fine-grained Personal Access Token (PAT)

The dispatch API call needs a token with permission to trigger Actions workflows on `infinitechess.org`.

1. Go to **GitHub.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens**.
2. Click **Generate new token**.
3. Fill in:
    - **Token name**: `hydrochess-dispatch`
    - **Expiration**: Set to **1 year** and add a calendar reminder to rotate it before it expires. If the token expires, the dispatch step in HydroChess will silently fail with no other visible error.
    - **Resource owner**: `Infinite-Chess`
    - **Repository access**: Only selected repositories → `infinitechess.org`
    - **Repository permissions**: Set **Actions** to **Read and write**.
4. Click **Generate token** and **copy the value immediately** — it is shown only once.

### 4.2 Add the PAT as a secret in the HydroChess repository

1. Go to `https://github.com/Infinite-Chess/HydroChess` → **Settings → Secrets and variables → Actions**.
2. Click **New repository secret**.
3. **Name**: `INFINITECHESS_DISPATCH_TOKEN`
4. **Value**: the PAT generated in step 4.1.

### 4.3 Add the dispatch step to `build-wasm.yml`

Open `.github/workflows/build-wasm.yml` in the HydroChess repository. Append the following as the **last step** of the `build-and-release` job, after the "Create Release" step:

```yaml
- name: Trigger infinitechess.org deploy
  run: |
      curl -s -X POST \
        -H "Authorization: token ${{ secrets.INFINITECHESS_DISPATCH_TOKEN }}" \
        -H "Accept: application/vnd.github.v3+json" \
        https://api.github.com/repos/Infinite-Chess/infinitechess.org/dispatches \
        -d '{"event_type":"hydrochess-release"}'
```

**What this does**: Sends an authenticated `POST` to GitHub's API dispatching a custom `hydrochess-release` event on the `infinitechess.org` repository. The self-hosted runner picks it up, skips `git pull`/`npm ci` (since no new commits or dependencies changed on this repo), re-runs the build (which fetches the freshly published WASM files), and reloads PM2.

---

## Part 5: Verify Each Trigger

### 5.1 Trigger 1 — push to `prod`

Merge any real (non-markdown) change from `main` into `prod`. Watch the **Actions** tab on the `infinitechess.org` repository — the "Deploy" workflow should appear, run on the self-hosted runner, and complete successfully.

### 5.2 Trigger 2 — `workflow_dispatch`

1. Go to **Actions → Deploy** on the `infinitechess.org` repository.
2. Click **Run workflow → Run workflow**.
3. Confirm the workflow runs on `self-hosted` and succeeds.

### 5.3 Trigger 3 — `repository_dispatch`

Push a commit to the `main` branch of HydroChess (or manually trigger the `build-wasm.yml` workflow via `workflow_dispatch`). After the HydroChess workflow finishes and the release is published, the "Deploy" workflow on `infinitechess.org` should appear in the Actions tab and run.

### 5.4 Verify near-zero downtime

While a deploy is in progress, open the play page in a browser with the console visible. You should observe the WebSocket disconnect and reconnect within approximately 2.5 seconds, with the game resuming normally.

---

## Reminder

- Remove `allowinvites.json` and all related polling/broadcast machinery once this infrastructure is fully verified. See `dev-utils/REDESIGN/todo.md` for the full scope of that cleanup.
