#!/usr/bin/env node

// MCP Server entrypoint

import express from "express";
import cors from "cors";
import { createServer } from "http";
import { WebSocketServer, type WebSocket } from "ws";
import { fileURLToPath } from "url";
import path from "path";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { addChange, getChanges, markApplied, clearAll } from "./queue.js";
import { resolveTailwindConfig, generateCssForClasses } from "./tailwind.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Package root: 2 levels up from dist/server/, 1 level up from server/
const packageRoot = __dirname.includes(`${path.sep}dist${path.sep}`)
  ? path.resolve(__dirname, "..", "..")
  : path.resolve(__dirname, "..");

const port = Number(process.env.PORT) || 3333;

// --- Express ---
const app = express();
app.use(cors());

app.get("/overlay.js", (_req, res) => {
  const overlayPath = path.join(packageRoot, "overlay", "dist", "overlay.js");
  res.sendFile(overlayPath, (err) => {
    if (err) {
      console.error("[http] Failed to serve overlay.js:", err);
      if (!res.headersSent) res.status(404).end();
    }
  });
});

app.get("/tailwind-config", async (_req, res) => {
  try {
    const config = await resolveTailwindConfig();
    res.json(config);
  } catch (err) {
    console.error("[http] Failed to resolve tailwind config:", err);
    res.status(500).json({ error: "Failed to resolve Tailwind config" });
  }
});

app.post("/css", express.json(), async (req, res) => {
  const { classes } = req.body as { classes?: unknown };
  if (!Array.isArray(classes) || classes.some((c) => typeof c !== "string")) {
    res.status(400).json({ error: "classes must be an array of strings" });
    return;
  }
  try {
    const css = await generateCssForClasses(classes as string[]);
    res.json({ css });
  } catch (err) {
    console.error("[http] Failed to generate CSS:", err);
    res.status(500).json({ error: "Failed to generate CSS" });
  }
});

// --- HTTP + WebSocket ---
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws: WebSocket) => {
  console.error("[ws] Client connected");

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(String(raw));

      if (msg.type === "CHANGE") {
        const entry = addChange({
          component: msg.component,
          target: msg.target,
          change: msg.change,
          context: msg.context,
        });
        console.error(`[ws] Change queued: #${entry.id}`);
      } else if (msg.type === "PING") {
        ws.send(JSON.stringify({ type: "PONG" }));
      }
    } catch (err) {
      console.error("[ws] Bad message:", err);
    }
  });

  ws.on("close", () => {
    console.error("[ws] Client disconnected");
  });
});

httpServer.listen(port, () => {
  console.error(`[server] HTTP + WS listening on http://localhost:${port}`);
});

// --- MCP Server (stdio) ---
const mcp = new McpServer(
  { name: "tailwind-visual-editor", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

mcp.tool(
  "get_pending_changes",
  "Returns all queued visual changes not yet applied to source code",
  async () => ({
    content: [{ type: "text" as const, text: JSON.stringify(getChanges(), null, 2) }],
  }),
);

mcp.tool(
  "mark_changes_applied",
  "Marks changes as applied and removes them from the queue",
  { ids: z.array(z.number()) },
  async ({ ids }) => {
    const applied = markApplied(ids);
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ applied }) }],
    };
  },
);

mcp.tool(
  "clear_pending_changes",
  "Discards all pending changes from the queue",
  async () => {
    const cleared = clearAll();
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ cleared }) }],
    };
  },
);

const transport = new StdioServerTransport();
await mcp.connect(transport);
console.error("[mcp] MCP server connected via stdio");
