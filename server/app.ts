// Express app factory

import express from "express";
import cors from "cors";
import { request as makeRequest } from "http";
import path from "path";

import { getByStatus, getQueueUpdate, clearAll } from "./queue.js";
import { resolveTailwindConfig, generateCssForClasses, getTailwindVersion } from "./tailwind.js";
import type { PatchStatus } from "../shared/types.js";

const VALID_STATUSES = new Set<string>(['staged', 'committed', 'implementing', 'implemented', 'error']);

export function createApp(packageRoot: string): express.Express {
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

  app.get("/api/info", async (_req, res) => {
    try {
      const tailwindVersion = await getTailwindVersion();
      res.json({ tailwindVersion });
    } catch (err) {
      console.error("[http] Failed to detect tailwind version:", err);
      res.status(500).json({ error: "Failed to detect Tailwind version" });
    }
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
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      console.error("[http] Failed to generate CSS for classes", classes, ":", err);
      res.status(500).json({ error: "Failed to generate CSS", detail: message, stack });
    }
  });

  // --- Patch state REST endpoint ---
  app.get("/patches", (_req, res) => {
    const status = _req.query.status as string | undefined;
    if (status) {
      if (!VALID_STATUSES.has(status)) {
        res.status(400).json({ error: `Invalid status. Must be one of: ${[...VALID_STATUSES].join(', ')}` });
        return;
      }
      res.json(getByStatus(status as PatchStatus));
    } else {
      const update = getQueueUpdate();
      res.json(update);
    }
  });

  app.delete("/patches", (_req, res) => {
    clearAll();
    res.json({ ok: true });
  });

  // --- Serve Panel app ---
  if (process.env.PANEL_DEV) {
    const panelDevPort = Number(process.env.PANEL_DEV_PORT) || 5174;
    console.error(`[server] Panel dev mode: proxying /panel → http://localhost:${panelDevPort}`);
    app.use("/panel", (req, res) => {
      const proxyReq = makeRequest(
        {
          hostname: "localhost",
          port: panelDevPort,
          path: "/panel" + req.url,
          method: req.method,
          headers: { ...req.headers, host: `localhost:${panelDevPort}` },
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode!, proxyRes.headers);
          proxyRes.pipe(res, { end: true });
        }
      );
      proxyReq.on("error", () => {
        if (!res.headersSent) res.status(502).send("Panel dev server not running on port " + panelDevPort);
      });
      req.pipe(proxyReq, { end: true });
    });
  } else {
    const panelDist = path.join(packageRoot, "panel", "dist");
    app.use("/panel", express.static(panelDist));
    app.get("/panel/*", (_req, res) => {
      res.sendFile(path.join(panelDist, "index.html"), (err) => {
        if (err && !res.headersSent) res.status(404).end();
      });
    });
  }

  return app;
}
