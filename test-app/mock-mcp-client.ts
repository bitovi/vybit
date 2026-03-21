#!/usr/bin/env npx tsx
/**
 * Mock MCP client — spawns its own server via stdio (just like a real AI agent)
 * and loops continuously:
 *
 *   implement_next_change  →  wait 2s  →  mark_change_implemented  →  repeat
 *
 * It blocks on implement_next_change until a commit arrives. Stage + commit
 * patches in the panel, then this client will pick them up.
 *
 * Usage (from test-app/):
 *   npx tsx mock-mcp-client.ts
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import path from "path";

const PORT = 3333;
const serverScript = path.resolve("..", "server/index.ts");

// --transport http  →  connect to an already-running server at http://localhost:PORT/mcp
// --transport stdio (default)  →  spawn the server as a child process via stdio
const transportArg = process.argv.find(a => a.startsWith('--transport='));
const transportMode = transportArg ? transportArg.split('=')[1] : 'stdio';
if (transportMode !== 'stdio' && transportMode !== 'http') {
  console.error(`Unknown --transport value "${transportMode}". Use "stdio" or "http".`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(label: string, ...args: any[]) {
  const ts = new Date().toLocaleTimeString();
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  [${ts}] ${label}`);
  console.log("=".repeat(60));
  for (const arg of args) {
    if (typeof arg === "string") console.log(arg);
    else console.log(JSON.stringify(arg, null, 2));
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function printContentParts(content: any[]) {
  console.log(`\n  Content parts: ${content.length}`);
  for (let i = 0; i < content.length; i++) {
    const part = content[i] as any;
    console.log(`\n  --- Part ${i + 1} (type: ${part.type}) ---`);
    if (part.type === "text") {
      try {
        console.log(JSON.stringify(JSON.parse(part.text), null, 2));
      } catch {
        console.log(part.text);
      }
    } else if (part.type === "image") {
      console.log(`  [image: ${part.mimeType}, ${part.data.length} chars base64]`);
    } else {
      console.log(JSON.stringify(part, null, 2));
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  let transport: StdioClientTransport | StreamableHTTPClientTransport;

  if (transportMode === 'http') {
    const url = new URL(`http://localhost:${PORT}/mcp`);
    log("Connecting to existing server (HTTP transport)", `url: ${url}`);
    transport = new StreamableHTTPClientTransport(url);
  } else {
    log("Starting MCP server", `cwd: ${process.cwd()}`, `script: ${serverScript}`);
    const stdioTransport = new StdioClientTransport({
      command: "npx",
      args: ["tsx", serverScript],
      env: {
        ...process.env,
        PORT: String(PORT),
        STORYBOOK_URL: process.env.STORYBOOK_URL ?? 'http://localhost:6007',
      },
      stderr: "pipe",
    });
    stdioTransport.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(`  [server] ${chunk}`);
    });
    transport = stdioTransport;
  }

  const client = new Client(
    { name: "mock-mcp-client", version: "1.0.0" },
    { capabilities: {} },
  );

  await client.connect(transport);
  log("MCP client connected — starting agent loop");

  // On startup, error out any commits stuck in 'implementing' from a previous agent session
  const orphanedResult = await client.callTool({ name: "list_changes", arguments: { status: "implementing" } });
  const orphanedPatches: any[] = [];
  for (const part of orphanedResult.content as any[]) {
    if (part.type === "text") {
      try { orphanedPatches.push(...JSON.parse(part.text)); } catch { /* not JSON array */ }
    }
  }
  if (orphanedPatches.length > 0) {
    // Group by commitId
    const byCommit = new Map<string, any[]>();
    for (const p of orphanedPatches) {
      if (!p.commitId) continue;
      if (!byCommit.has(p.commitId)) byCommit.set(p.commitId, []);
      byCommit.get(p.commitId)!.push(p);
    }
    log(`Found ${byCommit.size} orphaned implementing commit(s) — marking as error`);
    for (const [commitId, patches] of byCommit) {
      const results = patches
        .filter((p: any) => p.kind === "class-change" || p.kind === "design")
        .map((p: any) => ({ patchId: p.id, success: false, error: "Agent disconnected while implementing" }));
      await client.callTool({
        name: "mark_change_implemented",
        arguments: { commitId, results },
      });
    }
  }

  log("Waiting for you to stage + commit patches in the panel at http://localhost:5173/");
  console.log("  (The mock client will pick them up automatically when committed)\n");

  let cycle = 0;

  // Agent loop — mirrors what a real AI agent does
  while (true) {
    cycle++;
    log(`Cycle ${cycle} — calling implement_next_change (blocking until a commit arrives)…`);

    const result = await client.callTool(
      { name: "implement_next_change" },
      undefined,
      { timeout: 24 * 60 * 60 * 1000 }, // wait up to 24h for a commit
    );

    log(`Cycle ${cycle} — implement_next_change RESPONSE`);
    printContentParts(result.content as any[]);

    // Extract the commit from the JSON part
    let commit: any = null;
    for (const part of result.content as any[]) {
      if (part.type === "text") {
        try {
          const parsed = JSON.parse(part.text);
          if (parsed.commit) { commit = parsed.commit; break; }
        } catch { /* not JSON */ }
      }
    }

    if (!commit) {
      log(`Cycle ${cycle} — no commit found in response, skipping mark_change_implemented`);
      continue;
    }

    // Simulate the agent "implementing" (2s delay)
    log(`Cycle ${cycle} — simulating implementation (2s)…`);
    await sleep(2000);

    // Build results for all actionable patches (class-change + design)
    const results = commit.patches
      .filter((p: any) => p.kind === "class-change" || p.kind === "design")
      .map((p: any) => ({ patchId: p.id, success: true }));

    log(`Cycle ${cycle} — calling mark_change_implemented`, { commitId: commit.id, results });

    const markResult = await client.callTool({
      name: "mark_change_implemented",
      arguments: { commitId: commit.id, results },
    });

    log(`Cycle ${cycle} — mark_change_implemented RESPONSE`);
    printContentParts(markResult.content as any[]);

    log(`Cycle ${cycle} — done. Looping back to wait for next commit…`);
  }
}

main().catch((err) => {
  console.error("\n❌ Mock client error:", err);
  process.exit(1);
});

