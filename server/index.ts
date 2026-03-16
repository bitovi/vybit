#!/usr/bin/env node

// MCP Server entrypoint

import { createServer } from "http";
import { fileURLToPath } from "url";
import path from "path";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { getByStatus, getCounts, getNextCommitted, markCommitImplementing, markCommitImplemented, markImplementing, markImplemented, clearAll, onCommitted, getQueueUpdate } from "./queue.js";
import { createApp } from "./app.js";
import { setupWebSocket } from "./websocket.js";
import { registerMcpTools } from "./mcp-tools.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = __dirname.includes(`${path.sep}dist${path.sep}`)
  ? path.resolve(__dirname, "..", "..")
  : path.resolve(__dirname, "..");

const port = Number(process.env.PORT) || 3333;

// --- HTTP + WebSocket ---
const app = createApp(packageRoot);
const httpServer = createServer(app);
const { broadcastPatchUpdate } = setupWebSocket(httpServer);

httpServer.listen(port, () => {
  console.error(`[server] HTTP + WS listening on http://localhost:${port}`);
});

// --- MCP Server (stdio) ---
const mcp = new McpServer(
  { name: "tailwind-inspector-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

registerMcpTools(mcp, {
  broadcastPatchUpdate,
  getNextCommitted,
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

