# VyBit

Change designs, draw mockups, and provide suggestions in your browser and have them implemented by your favorite coding agent (Claude, Cursor, Copilot, etc). It works with React apps built with Tailwind v3 or v4.

VyBit (Pronounced Vie-BIT) is a MCP tool that lets you command the agent by editing your website or web app in the browser.




A browser overlay + inspector panel + MCP server for visually editing Tailwind CSS classes on a running React app. Click any element on the page, scrub values, preview changes live, then let an AI agent apply them to your source code.

## How it works

1. The tool runs a local server (port 3333) that serves an inspector panel and an overlay script
2. You add the overlay script to your app's `index.html` — it injects a click-to-inspect UI
3. You click elements on your page → the inspector panel shows their Tailwind classes
4. You scrub/select new values → changes preview live in the browser
5. You queue changes → an AI agent (via MCP) reads the queue and applies them to your source files

## Prerequisites

- Node.js 18+
- A React app using Tailwind CSS v4
- An MCP-compatible AI agent (e.g. GitHub Copilot, Claude Desktop, Cursor)

## Installation

```bash
npm install -D @bitovi/vybit
```

Or use it directly with `npx` (no install required):

```bash
npx @bitovi/vybit
```

## Setup

### 1. Start the server

From your project directory:

```bash
npx @bitovi/vybit
```

This starts the server at `http://localhost:3333`. The inspector panel is at `http://localhost:3333/panel/`.

> **Important:** The server must be started from within your project directory (the directory containing your `node_modules/tailwindcss`). It uses your project's Tailwind installation to resolve class values.

### 2. Inject the overlay into your app

Add the overlay script to your app's `index.html`:

```html
<script src="http://localhost:3333/overlay.js"></script>
```

For Vite projects, you can conditionally inject it only in development:

```html
<!-- index.html -->
<script>
  if (location.hostname === 'localhost') {
    const s = document.createElement('script');
    s.src = 'http://localhost:3333/overlay.js';
    document.head.appendChild(s);
  }
</script>
```

### 3. Configure your MCP agent

**GitHub Copilot** — add to `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "vybit": {
      "type": "stdio",
      "command": "npx",
      "args": ["@bitovi/vybit"],
      "cwd": "${workspaceFolder}"
    }
  }
}
```

**Claude Code** — add to `.mcp.json` in your project root, or use the CLI:

```bash
claude mcp add vybit npx @bitovi/vybit
```

Or manually in `.mcp.json`:

```json
{
  "mcpServers": {
    "vybit": {
      "command": "npx",
      "args": ["@bitovi/vybit"]
    }
  }
}
```

**Claude Desktop** — add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "vybit": {
      "command": "npx",
      "args": ["@bitovi/vybit"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

## Usage

1. Open your app in the browser (e.g. `http://localhost:5173`)
2. Click the **inspector toggle button** that appears in the bottom-right corner
3. Click any element to inspect its Tailwind classes
4. In the panel at `http://localhost:3333/panel/`:
   - Drag scrubbers to adjust spacing, sizing, and other scalar values
   - Click color chips to pick a new color
   - Press **Queue Change** to stage a change
5. Once you've queued your changes, tell your AI agent: _"Apply the queued Tailwind changes"_
6. The agent calls `implement_next_change` and keeps looping until the queue is empty

## MCP Tools

| Tool | Description |
|------|-------------|
| `implement_next_change` | **Start here.** Waits for the next committed change, returns implementation instructions, and requires the agent to apply it, mark it done, then call this tool again in an endless loop. |
| `get_next_change` | Returns the next committed change as raw patch data (no workflow instructions). Use this for custom agent workflows. |
| `mark_change_implemented` | Marks one or more changes as implemented by ID. Returns a directive to call `implement_next_change` again. |
| `list_changes` | Lists all changes grouped by status (`staged`, `committed`, `implementing`, `implemented`). |
| `discard_all_changes` | Clears the entire change queue. |

## Port Configuration

Use the `PORT` environment variable to change the server port (default: `3333`):

```bash
PORT=4000 npx @bitovi/vybit
```

## Contributing

Issues and PRs welcome at [github.com/bitovi/vybit](https://github.com/bitovi/vybit).

## License

MIT © [Bitovi](https://www.bitovi.com)
