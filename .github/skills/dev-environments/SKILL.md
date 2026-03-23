---
name: dev-environments
description: Set up and run different development service arrangements for testing specific features. Use when starting dev servers, testing Storybook addon (SB8 or SB10), testing Tailwind v3 vs v4, testing Astro, or when asked which services to run. Covers compound tasks, port assignments, and which services need each other.
---

# Skill: Development Environments

This project has multiple test apps, Storybook versions, and server configurations. Different features require different combinations of services.

## Quick Reference — Compound Tasks

Run via **Terminal → Run Task**:

| Task | What it starts | Use when |
|------|---------------|----------|
| **Dev: Test App** | Overlay watch, Panel watch, Server (3333), Test App (5173) | General development, overlay/panel work |
| **Dev: SB8** | Overlay watch, Panel watch, Server (3333→SB 6007), SB8 (6007), Test App (5173) | Testing Storybook 8 addon integration |
| **Dev: SB10** | Overlay watch, Panel watch, Server (3333→SB 6008), SB10 (6008), Test App (5173) | Testing Storybook 10 addon integration |
| **Dev: All v3** | Overlay watch, Panel watch, Server v3 (3334), Test App v3 (5175) | Testing Tailwind v3 support |

## Port Map

| Port | Service | Notes |
|------|---------|-------|
| 3333 | MCP Server | Always runs from `test-app/` cwd (resolves TW v4) |
| 3334 | MCP Server v3 | Runs from `test-app-v3/` cwd (resolves TW v3) |
| 5173 | Test App | Tailwind v4 React app |
| 5174 | Panel dev | Only for panel-only dev (`cd panel && npm run dev`) |
| 5175 | Test App v3 | Tailwind v3 React app |
| 5176 | Test App Astro | Astro framework test app |
| 6006 | Panel Storybook | Panel component stories (internal dev) |
| 6007 | SB8: Test App | Storybook 8 with test-app stories + Vybit addon |
| 6008 | SB10: Test App | Storybook 10 with test-app stories + Vybit addon |

## Service Dependency Rules

### Always needed
- **Watch: Overlay** — rebuilds `overlay/dist/overlay.js` on save
- **Watch: Panel** — rebuilds `panel/dist/` on save

These are the brain of the system. Without them, changes to overlay or panel code won't take effect.

### Server needs the right cwd
The server resolves `tailwindcss` from its cwd's `node_modules/`. This determines which Tailwind version the compiler uses:
- `test-app/` → Tailwind v4
- `test-app-v3/` → Tailwind v3

### Server needs STORYBOOK_URL for the Draw tab
The server's `STORYBOOK_URL` env var tells it which Storybook to connect to for the Draw tab feature:
- `STORYBOOK_URL=http://localhost:6007` for SB8
- `STORYBOOK_URL=http://localhost:6008` for SB10
- If unset, auto-scans ports 6006–6010

### Mock MCP Client replaces the Server task
The Mock MCP Client spawns its own server via stdio. **Never run both simultaneously** — they'd conflict on port 3333.

### Test App is needed even for Storybook testing
The server runs from `test-app/` to resolve tailwindcss. The test app itself (port 5173) is useful for verifying the overlay works outside Storybook, but the server task is what truly needs test-app's `node_modules`.

## Arrangement Details

### 1. General Development (Test App)

**Task:** `Dev: Test App`

The default setup for working on overlay, panel, or server features.

**Services:**
1. Watch: Overlay
2. Watch: Panel
3. Server (port 3333) — from `test-app/`
4. Test App (port 5173)

**Open:** http://localhost:5173 (app) and http://localhost:3333/panel/ (inspector)

### 2. Storybook 8 Integration

**Task:** `Dev: SB8`

Test the Vybit addon in Storybook 8.

**Services:**
1. Watch: Overlay
2. Watch: Panel
3. Server (port 3333) — `STORYBOOK_URL=http://localhost:6007`
4. Storybook: Test App (port 6007) — from `storybook-test/v8/`
5. Test App (port 5173)

**Open:** http://localhost:6007 — Vybit addon panel appears in the right sidebar

### 3. Storybook 10 Integration

**Task:** `Dev: SB10`

Test the Vybit addon in Storybook 10.

**Services:**
1. Watch: Overlay
2. Watch: Panel
3. Server for SB10 (port 3333) — `STORYBOOK_URL=http://localhost:6008`
4. Storybook 10: Test App (port 6008) — from `storybook-test/v10/`
5. Test App (port 5173)

**Open:** http://localhost:6008 — Vybit addon panel appears in the right sidebar

### 4. Tailwind v3 Testing

**Task:** `Dev: All v3`

Test the inspector with Tailwind v3 apps.

**Services:**
1. Watch: Overlay
2. Watch: Panel
3. Server v3 (port 3334) — from `test-app-v3/`
4. Test App v3 (port 5175)

**Open:** http://localhost:5175 (app) and http://localhost:3334/panel/ (inspector)

### 5. Astro Testing

**No compound task yet** — run individually:

1. Watch: Overlay
2. Watch: Panel
3. Server (port 3333) — from `test-app/` (needs TW v4 resolution)
4. Test App Astro (port 5176)

**Open:** http://localhost:5176

### 6. Mock MCP Agent Loop

For testing the full agent workflow (stage → commit → implement → mark done → repeat):

1. Watch: Overlay
2. Watch: Panel
3. Mock MCP Client (spawns server on port 3333 automatically)
4. Test App (port 5173)

**Do NOT** also start the Server task — the Mock MCP Client owns it.

### 7. Panel Component Development

For working on panel components in isolation:

1. Storybook (port 6006) — from `panel/`

No other services needed. Panel Storybook only shows panel components, no addon integration.

## Switching Between Arrangements

Arrangements that use port 3333 are **mutually exclusive** — only run one at a time:
- Dev: Test App
- Dev: SB8
- Dev: SB10
- Mock MCP Client

`Dev: All v3` uses port 3334, so it can run alongside any of the above.

## Precheck: Before Starting an Arrangement

Before launching services, always run this procedure to avoid port conflicts and stale processes:

### Step 1 — Scan occupied ports

```bash
lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null | grep -E ':(3333|3334|5173|5174|5175|5176|6006|6007|6008) ' || echo "No conflicting ports in use"
```

### Step 2 — Identify conflicts

Compare the output against the arrangement you want to start. **Conflict rules:**
- Port 3333 occupied → must kill if switching server configs (e.g., from `Dev: Test App` to `Dev: SB8`, since `STORYBOOK_URL` differs)
- Port 3333 occupied by Mock MCP Client → must kill before starting any Server task (and vice versa)
- Watchers (overlay/panel) on no port → safe to leave running, they're shared across all arrangements
- Storybook on 6007 or 6008 → only conflicts if you need the same port for a different SB version

### Step 3 — Kill conflicting processes

Kill only the processes that conflict. Use the PID from `lsof`:

```bash
# Kill a specific port's process
kill $(lsof -ti :3333) 2>/dev/null
# Or for stubborn processes
kill -9 $(lsof -ti :3333) 2>/dev/null
```

**Never kill ports that the new arrangement also needs and that are already running correctly.** For example, if Test App (5173) is already running and the new arrangement also needs it, leave it alone.

### Step 4 — Start the arrangement

Use the compound task (`Dev: SB8`, `Dev: SB10`, etc.) or start individual tasks.

### Precheck summary as a decision table

| Switching to | Kill port 3333? | Kill port 6007? | Kill port 6008? | Kill port 5173? |
|-------------|----------------|----------------|----------------|----------------|
| Dev: Test App | Yes, if server config differs | No (not used) | No (not used) | No (reuse) |
| Dev: SB8 | Yes, if `STORYBOOK_URL` ≠ 6007 | No (reuse if SB8) | Yes (if SB10 running) | No (reuse) |
| Dev: SB10 | Yes, if `STORYBOOK_URL` ≠ 6008 | Yes (if SB8 running) | No (reuse if SB10) | No (reuse) |
| Dev: All v3 | No (uses 3334) | No (not used) | No (not used) | No (uses 5175) |
| Mock MCP Client | Yes, always | No | No | No (reuse) |

## First-Time Setup

Each environment needs its own `npm install`:

```bash
cd test-app && npm install
cd test-app-v3 && npm install
cd storybook-test/v8 && npm install
cd storybook-test/v10 && npm install
cd panel && npm install
npm install  # root
```
