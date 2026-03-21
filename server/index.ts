#!/usr/bin/env node

// MCP Server entrypoint

import { createServer } from "http";
import { fileURLToPath } from "url";
import path from "path";

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { getByStatus, getCounts, getNextCommitted, reclaimImplementingCommits, markCommitImplementing, markCommitImplemented, markImplementing, markImplemented, clearAll, onCommitted, getQueueUpdate } from "./queue.js";
import { createApp } from "./app.js";
import { setupWebSocket } from "./websocket.js";
import { registerMcpTools } from "./mcp-tools.js";
import { checkTailwindAvailable } from "./tailwind.js";
import { detectStorybookUrl } from "./storybook.js";

// --- Resolve project root (precedence: --cwd flag, VYBIT_PROJECT_ROOT, cwd) ---
const argv = process.argv.slice(2);
let desiredProjectRoot = process.cwd();
const cwdFlagIndex = argv.findIndex(a => a === "--cwd" || a === "-C");
if (cwdFlagIndex !== -1 && argv[cwdFlagIndex + 1]) {
  desiredProjectRoot = path.resolve(argv[cwdFlagIndex + 1]);
} else if (process.env.VYBIT_PROJECT_ROOT) {
  desiredProjectRoot = path.resolve(process.env.VYBIT_PROJECT_ROOT);
}

if (desiredProjectRoot !== process.cwd()) {
  try {
    process.chdir(desiredProjectRoot);
    console.error(`[startup] Using project root: ${desiredProjectRoot}`);
  } catch (err) {
    console.error(`Failed to change cwd to ${desiredProjectRoot}: ${err}`);
    process.exit(1);
  }
}

// --- Startup check: tailwindcss must be resolvable from cwd ---
const tailwindCheck = checkTailwindAvailable();
if (!tailwindCheck.ok) {
  console.error("VyBit: tailwindcss not found — cannot start");
  console.error(`cwd: ${process.cwd()}`);
  console.error("VyBit must run from your project directory so it can find tailwindcss in node_modules.");
  console.error('If your app runs in Docker, run VyBit inside the container:');
  console.error('  docker exec -i <container> npx @bitovi/vybit');
  console.error("See: https://github.com/bitovi/vybit#running-inside-docker");
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = __dirname.includes(`${path.sep}dist${path.sep}`)
  ? path.resolve(__dirname, "..", "..")
  : path.resolve(__dirname, "..");

const port = Number(process.env.PORT) || 3333;

// --- Storybook detection ---
const storybookUrl = await detectStorybookUrl();

// --- HTTP + WebSocket ---
const app = createApp(packageRoot, storybookUrl);
const httpServer = createServer(app);
const { broadcastPatchUpdate } = setupWebSocket(httpServer);

httpServer.listen(port, () => {
  console.error(`[server] HTTP + WS listening on http://localhost:${port}`);
});

// --- MCP over HTTP (stateless, one McpServer per request) ---
// Allows external clients to connect with: --transport http
function createMcpServerWithTools(): McpServer {
  const s = new McpServer(
    { name: "vybit", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );
  registerMcpTools(s, {
    broadcastPatchUpdate,
    getNextCommitted,
    reclaimImplementingCommits,
    onCommitted,
    markCommitImplementing,
    markCommitImplemented,
    markImplementing,
    markImplemented,
    getByStatus,
    getCounts,
    getQueueUpdate,
    clearAll,
  });
  return s;
}

app.post("/mcp", express.json(), async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const mcpHttp = createMcpServerWithTools();
  await mcpHttp.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get("/mcp", async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const mcpHttp = createMcpServerWithTools();
  await mcpHttp.connect(transport);
  await transport.handleRequest(req, res);
});

console.error(`[mcp] HTTP transport available at http://localhost:${port}/mcp`);

// --- MCP Server (stdio) ---
const mcp = new McpServer(
  { name: "vybit", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

registerMcpTools(mcp, {
  broadcastPatchUpdate,
  getNextCommitted,
  reclaimImplementingCommits,
  onCommitted,
  markCommitImplementing,
  markCommitImplemented,
  markImplementing,
  markImplemented,
  getByStatus,
  getCounts,
  getQueueUpdate,
  clearAll,
});

const transport = new StdioServerTransport();
await mcp.connect(transport);
console.error("[mcp] MCP server connected via stdio");

