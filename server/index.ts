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

