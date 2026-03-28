# 030 — Hosted Mode & GitHub Issue Creation

## Overview

A "hosted mode" for VyBit where the panel and overlay are served from a central server
(`vybit.bitovi.com`) rather than a local MCP server. Non-developer users — stakeholders,
designers, content editors — visit a live website with the overlay injected, visually suggest
Tailwind CSS changes, and send those suggestions as GitHub issues assigned to Copilot for
automatic implementation. No local tooling, no MCP agent, no terminal required.

This spec covers:
1. The central server architecture (`central-server/` in this repo)
2. GitHub OAuth credential flow into the panel iframe
3. GitHub issue creation from committed patches
4. Storybook integration constraints under hosted mode

---

## Problem

VyBit currently requires a local MCP server running on the developer's machine. This limits
feedback to developers who can run the toolchain. There is no way for a designer, product
manager, or stakeholder to suggest visual changes on a staging site and route those suggestions
to a developer workflow without setting up the local stack.

Additionally, even when an AI agent *is* available, the current feedback loop requires the
agent to be actively running and connected. An async alternative — where changes become GitHub
issues that Copilot picks up — provides a lower-friction path that works without a live agent.

---

## Goals

- Allow any user on a site with the overlay injected to visually suggest Tailwind changes
- Let authenticated users send those suggestions as GitHub issues in one click
- Issues are formatted so GitHub Copilot will pick them up and implement them automatically
- No local installation required for the end user
- The credential/auth flow is secure and does not expose tokens to the host page

## Non-Goals

- Real-time MCP agent communication (that is the existing local mode)
- Tailwind CSS compilation in the central server (no access to customer's `node_modules`)
- Serving the Storybook proxy from the central server
- Supporting self-hosted central servers (future work)
- Jira / Linear / other integrations (same pattern applies; deferred)

---

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| GitHub OAuth App vs GitHub App | OAuth App | Simpler setup; user-level tokens; sufficient for issue creation |
| Token storage | `express-session` + HttpOnly cookie | Tokens never touch the host page; iframe shares origin with server |
| Session persistence | Redis (prod), memory (dev) | Stateless deploys need external session store |
| Repo targeting | `data-repo` attribute on `<script>` tag | No per-user server config needed; site owner sets it once |
| Storybook integration | Addon mandatory; no proxy | Follows pattern from spec 022; cross-origin constraints make proxy infeasible |
| Central server location | New `central-server/` dir in this repo | Shares `shared/types.ts`; separate entry point and deploy target |
| MCP tools in central server | No | Hosted mode is async (GitHub issues), not real-time agent |

---

## Architecture

### Deployment Topology

```
Customer site (app.customer.com)
  └─ <script src="https://vybit.bitovi.com/overlay.js"
             data-repo="owner/repo"
             data-site-key="sk_xxx">    ← optional abuse prevention
      ├─ Overlay JS runs in customer's page origin
      ├─ Connects: wss://vybit.bitovi.com?session=<id>   (role: overlay)
      └─ Creates: <iframe src="https://vybit.bitovi.com/panel?session=<id>">
                    └─ Panel JS runs in vybit.bitovi.com origin
                       ├─ Connects: wss://vybit.bitovi.com?session=<id>  (role: panel)
                       ├─ fetch('/api/auth/me')          ← HttpOnly cookie auto-sent ✓
                       └─ fetch('/api/github/issues')    ← HttpOnly cookie auto-sent ✓

Central Server (vybit.bitovi.com)
  ├─ Static: /overlay.js, /panel/**
  ├─ WebSocket hub (session-scoped routing)
  ├─ Auth: /auth/github, /auth/github/callback, /api/auth/me, /api/auth/logout
  ├─ GitHub proxy: /api/github/repos, /api/github/issues
  └─ Session store (Redis)

GitHub.com
  ├─ OAuth authorize + token exchange
  └─ REST API v3 (issues, repos)
```

### Why the iframe origin solves the credential problem

The panel is rendered as `<iframe src="https://vybit.bitovi.com/panel">`. Even though it is
embedded on a third-party site, the iframe's JavaScript runs in the `vybit.bitovi.com` browser
origin. This means:

- HttpOnly cookies set by `vybit.bitovi.com` are automatically included in every `fetch()` the
  panel makes, with no JavaScript access required
- The GitHub token never touches the host page DOM, localStorage, or JavaScript scope
- The overlay script runs in the customer's origin but has no access to the panel's cookies or
  credentials — it only exchanges messages via WebSocket (no tokens in those messages)

**Required cookie attributes:** `Secure; HttpOnly; SameSite=None` — the `SameSite=None` flag
is mandatory for cookies to be sent from a cross-site iframe. This requires HTTPS on
`vybit.bitovi.com`.

---

## Session Model

Each visitor to the customer site gets a `sessionId` (UUID v4) generated by the overlay on
first load and persisted to `sessionStorage`. This ID is passed as a query param on both the
WebSocket connection and the panel iframe URL:

```
wss://vybit.bitovi.com?session=abc123
https://vybit.bitovi.com/panel?session=abc123
```

The central server's WebSocket hub routes messages only within a session, providing isolation
between concurrent visitors. The patch queue is also per-session.

The server-side session (cookie-based, for auth) is separate from the visitor `sessionId`. A
user can authenticate once and that auth session persists across multiple page visits.

---

## GitHub OAuth Flow

### Sequence

```
1. User clicks "Sign in with GitHub" in panel
2. Panel calls window.open('https://vybit.bitovi.com/auth/github', 'vybit-auth', 'popup,...')
3. Popup redirects to:
   https://github.com/login/oauth/authorize
     ?client_id=<GITHUB_CLIENT_ID>
     &scope=repo
     &state=<csrf_token>        ← stored in server session, verified on callback
     &redirect_uri=https://vybit.bitovi.com/auth/github/callback
4. User approves → GitHub redirects to callback URL with ?code=...&state=...
5. Server exchanges code for access_token (server-to-server, never exposed to browser)
6. Server stores token in express-session (HttpOnly cookie)
7. Callback page renders:
   <script>
     window.opener?.postMessage({ type: 'VYBIT_AUTH_COMPLETE' }, 'https://vybit.bitovi.com');
     window.close();
   </script>
8. Panel receives postMessage, re-fetches /api/auth/me, updates auth state
```

### Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/auth/github` | Redirect to GitHub OAuth authorize URL |
| `GET` | `/auth/github/callback` | Exchange code for token; set session cookie; render popup-close page |
| `GET` | `/api/auth/me` | Return `{ authenticated, user: { login, avatar_url } }` or 401 |
| `POST` | `/api/auth/logout` | Destroy session |

### Security Notes

- CSRF: `state` param is a random token stored in the session before redirect, verified on
  callback — standard OAuth PKCE-equivalent for server-side flows
- Token scope: `repo` is the minimum scope required to create issues on private repos. If
  only public repos are targeted, `public_repo` is sufficient
- Token storage: tokens are stored server-side only, never serialized into the cookie payload
  (the cookie contains only a session ID)

---

## GitHub Issue Creation

### User Flow

1. User inspects an element, scrubs values to their desired state
2. User clicks "Queue Change" → patch is staged (existing flow)
3. User optionally adds a message explaining the intent
4. Instead of "Commit for Agent", user clicks **"Send to GitHub →"**
5. Panel opens an issue preview sheet:
   - Repo field (pre-filled from `data-repo` attribute; editable)
   - Title (auto-generated; editable)
   - Body (rendered markdown preview)
   - Toggle: "Assign to Copilot" (default: on)
6. User clicks "Create Issue" → request to `POST /api/github/issues`
7. Panel shows success toast with link to the created issue

### `POST /api/github/issues` Request

```typescript
{
  repo: "owner/repo",          // from data-repo or user override
  title: string,               // auto-generated or user-edited
  body: string,                // formatted markdown (see below)
  labels?: string[],           // e.g. ["vybit", "visual-change"]
  assignees?: string[],        // ["copilot"] when toggle is on
}
```

The server uses the stored GitHub token (from session) to call:
```
POST https://api.github.com/repos/{owner}/{repo}/issues
Authorization: Bearer <token>
```

### Issue Body Format

The issue body is designed so GitHub Copilot can understand the change, find the right file,
and implement it as a Tailwind class swap.

```markdown
## Visual Change Request

> Suggested via [VyBit](https://vybit.bitovi.com) visual editor

### Changes

| Component | Element | Property | Before | After |
|-----------|---------|----------|--------|-------|
| Button | `<button>` | background | `bg-blue-500` | `bg-red-500` |
| Card | `<div>` | padding | `p-4` | `p-6` |

### Context

- **Page:** https://app.example.com/dashboard
- **Component:** `Button` (3 instances on page)
- **File hint:** `src/components/Button.tsx`

### Surrounding HTML

```html
<div class="flex gap-4 items-center">
  <button class="bg-red-500 px-4 py-2 rounded">
    Click me
  </button>
</div>
```

### Notes from reviewer

> Make the CTA button more prominent — the current blue blends into the header.

---

*Created by [VyBit](https://vybit.bitovi.com) · [View element on page](https://app.example.com/dashboard)*
```

### Assigning to Copilot

Setting `assignees: ["copilot"]` in the GitHub API request triggers GitHub Copilot to
automatically begin implementing the issue. This is the primary value proposition: a
non-developer can suggest a visual change, and Copilot turns it into a pull request with no
further developer effort beyond review.

---

## Storybook in Hosted Mode

In local mode the server proxies the user's Storybook (`/storybook` route). In hosted mode
this is not possible — VyBit has no access to the customer's local Storybook.

**Solution:** The Storybook addon (already in `storybook-addon/`) is **mandatory** in hosted
mode. It runs inside Storybook and handles all integration without a proxy:

- `preview.ts` — injects overlay from `https://vybit.bitovi.com/overlay.js` (configurable via
  `vybit.serverUrl` parameter, which already exists in the current addon code)
- `manager.tsx` — renders panel as `<iframe src="https://vybit.bitovi.com/panel">` inside
  Storybook's shell

No changes to existing addon code are required for basic hosted mode. The Storybook proxy
(`/storybook` route) is simply absent from the central server.

For component drop (Draw tab), the addon's `preview.ts` should be extended to extract
component metadata (argTypes, story list) and forward it to the panel via `postMessage`,
bypassing the server's `/api/storybook-data` endpoint that requires filesystem access. This is
deferred to a follow-up spec.

---

## New `central-server/` Directory

This is a new Express application within the same repository. It shares `shared/types.ts` but
has its own entry point, dependencies, and deployment target.

### Directory Structure

```
central-server/
  index.ts          ← entry point (Express + WebSocket + session + OAuth)
  app.ts            ← Express app setup (static serving, routes)
  websocket.ts      ← Multi-tenant WS hub (session-scoped)
  queue.ts          ← PatchQueue class (one instance per session)
  auth.ts           ← GitHub OAuth handlers
  github.ts         ← GitHub REST API client (issue creation, repo list)
  issue-formatter.ts ← Converts Patch[] → GitHub issue markdown
  session-store.ts  ← Redis adapter for express-session
```

### Reuse from `server/`

The existing `server/` code is for local mode only and is unchanged. Central server imports:
- `shared/types.ts` — Patch, Commit, PatchStatus types
- The queue logic is re-implemented as a class (`PatchQueue`) rather than a singleton module

### Multi-Tenant WebSocket Hub

The current `server/websocket.ts` uses a single `Map<WebSocket, role>`. Central server extends
this to `Map<sessionId, Map<WebSocket, role>>` so messages route only within a session.

WebSocket upgrade:
```
wss://vybit.bitovi.com?session=abc123
```

Server reads `session` from the URL query string during the `upgrade` event and maps the
socket into that session's client map.

---

## Overlay Script Changes

### Reading `data-repo`

The overlay already reads its own `<script>` tag to derive `getServerOrigin()`. The same
mechanism is extended to read optional data attributes:

```typescript
function getOverlayConfig(): { serverOrigin: string; repo?: string; siteKey?: string } {
  const scripts = document.querySelectorAll('script[src*="overlay.js"]');
  for (const s of scripts) {
    const el = s as HTMLScriptElement;
    try {
      return {
        serverOrigin: new URL(el.src).origin,
        repo: el.dataset.repo,         // e.g. "owner/repo"
        siteKey: el.dataset.siteKey,   // e.g. "sk_xxx"
      };
    } catch { /* ignore */ }
  }
  return { serverOrigin: 'http://localhost:3333' };
}
```

The `repo` value is passed to the panel iframe via the `?repo=` query param so the issue
creation form can pre-fill the repo field.

### Session ID

The overlay generates a `sessionId` (UUID v4) on first load, stores it in `sessionStorage`,
and appends it to both the WebSocket URL and the panel iframe `src`:

```typescript
const sessionId = sessionStorage.getItem('vybit-session') ?? crypto.randomUUID();
sessionStorage.setItem('vybit-session', sessionId);
```

---

## Panel Changes

### Auth Provider

New `AuthProvider` React context wraps the app in hosted mode. On mount it fetches
`/api/auth/me`. Provides:

```typescript
interface AuthContext {
  user: { login: string; avatar_url: string } | null;
  isAuthenticated: boolean;
  login: () => void;    // opens OAuth popup
  logout: () => void;   // calls POST /api/auth/logout
}
```

`login()` implementation:
```typescript
const popup = window.open(`${SERVER_ORIGIN}/auth/github`, 'vybit-auth', 'popup,width=600,height=700');
window.addEventListener('message', (e) => {
  if (e.origin === SERVER_ORIGIN && e.data?.type === 'VYBIT_AUTH_COMPLETE') {
    popup?.close();
    refetchAuthState();
  }
}, { once: true });
```

### "Send to GitHub" Button

Added to the existing commit/queue UI alongside (not replacing) the "Commit for Agent" button.
Visible only when `isAuthenticated === true` and there are staged patches. Opens an issue
preview sheet (slide-up panel or modal) with the pre-filled form.

### Mode Detection

The panel detects whether it is running in local mode or hosted mode via a `?mode=hosted`
query param (set by the central server's iframe URL). In hosted mode, the `AuthProvider` is
mounted and the "Send to GitHub" button is shown. In local mode (current behavior), neither
appears.

---

## Site Owner Setup

Complete setup for a site owner wanting to embed VyBit in hosted mode:

```html
<!-- In your staging site's <head> -->
<script
  src="https://vybit.bitovi.com/overlay.js"
  data-repo="myorg/myrepo"
  data-site-key="sk_xxxxxxxxxx"
></script>
```

No other installation required. The overlay creates the panel iframe, handles WebSocket
routing, and the user authenticates with GitHub directly in the panel.

For Storybook integration, the addon must be installed:

```bash
npm install -D @bitovi/vybit
```

```typescript
// .storybook/main.ts
export default {
  addons: ['@bitovi/vybit/storybook-addon'],
};

// .storybook/preview.ts
export const parameters = {
  vybit: { serverUrl: 'https://vybit.bitovi.com' },
};
```

---

## Open Questions

1. **Site API keys (`data-site-key`)** — Should the central server require a site-specific key
   to prevent unauthorized overlay usage? Would allow rate limiting and analytics per site.
   Requires a key issuance flow (sign-up, dashboard). Deferred but recommended before public
   launch.

2. **Repo pre-fill vs. user selection** — `data-repo` pre-fills the issue form but the user
   can override. Should site owners be able to lock the repo (no override)? Relevant if the
   overlay is on a customer-facing site and the owner doesn't want issues sent to random repos.

3. **Component drop in hosted mode** — The Draw tab's "drop component from Storybook"
   feature requires argTypes and story metadata. In hosted mode this comes from the addon via
   `postMessage`, but the protocol is not yet defined. Tracked as a follow-up.

4. **Multi-repo issue routing** — A single site may have multiple components from different
   repos. Future: allow patch-level repo targeting (send Button changes to `myorg/design-system`,
   layout changes to `myorg/app`).

5. **Assigned Copilot account name** — The assignee for Copilot issues may differ by
   organization (GitHub uses `"copilot"` as the assignee handle, but this should be verified
   against the production GitHub API behavior).

---

## Phases

### Phase 1 — Central Server Foundation
- `central-server/` directory with Express + WebSocket hub
- Static serving of overlay.js and panel dist
- Multi-tenant session routing
- `PatchQueue` class extracted from `server/queue.ts`

### Phase 2 — GitHub OAuth
- OAuth endpoints and session store
- `SameSite=None; Secure` cookie configuration
- `AuthProvider` context in panel
- GitHub OAuth popup + `postMessage` completion handshake

### Phase 3 — Issue Creation UI
- `POST /api/github/issues` endpoint
- `GET /api/github/repos` endpoint (repo selector)
- Issue preview sheet in panel
- Issue body formatter (`issue-formatter.ts`)
- "Send to GitHub" button in existing commit UI

### Phase 4 — Overlay Config
- `data-repo` and `data-site-key` attribute reading
- `sessionId` generation and propagation
- `?mode=hosted` param on panel iframe URL

### Phase 5 — Storybook Hosted Mode
- Verify existing addon works with `serverUrl: 'https://vybit.bitovi.com'`
- Document addon-mandatory constraint for hosted mode
- Extend `preview.ts` for `postMessage`-based metadata forwarding (component drop support)
