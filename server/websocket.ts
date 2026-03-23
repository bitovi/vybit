// WebSocket server setup

import { WebSocketServer, type WebSocket } from "ws";
import type { Server } from "http";

import { addPatch, commitDraft, getQueueUpdate, discardDraftPatch } from "./queue.js";
import type { Patch } from "../shared/types.js";

export interface WebSocketDeps {
  broadcastPatchUpdate: () => void;
  broadcastTo: (role: string, data: object, exclude?: WebSocket) => void;
}

export function setupWebSocket(httpServer: Server): WebSocketDeps {
  const wss = new WebSocketServer({ server: httpServer, maxPayload: 10 * 1024 * 1024 });
  const clientRoles = new Map<WebSocket, string>();

  function broadcastTo(role: string, data: object, exclude?: WebSocket): void {
    const payload = JSON.stringify(data);
    for (const [client, clientRole] of clientRoles) {
      if (clientRole === role && client !== exclude && client.readyState === 1) {
        client.send(payload);
      }
    }
  }

  function broadcastPatchUpdate(): void {
    broadcastTo("panel", { type: "QUEUE_UPDATE", ...getQueueUpdate() });
  }

  wss.on("connection", (ws: WebSocket) => {
    console.error("[ws] Client connected");

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(String(raw));

        if (msg.type === "REGISTER") {
          const role = msg.role;
          if (role === "overlay" || role === "panel" || role === "design") {
            clientRoles.set(ws, role);
            console.error(`[ws] Client registered as: ${role}`);
            if (role === "panel") {
              ws.send(JSON.stringify({ type: "QUEUE_UPDATE", ...getQueueUpdate() }));
            }
          }
          return;
        }

        // Route messages with a "to" field to all clients of that role
        if (msg.to) {
          broadcastTo(msg.to, msg, ws);
          // Dual-route component arm/disarm to design iframe too
          if ((msg.type === "COMPONENT_ARM" || msg.type === "COMPONENT_DISARM") && msg.to === "overlay") {
            broadcastTo("design", msg, ws);
          }
          return;
        }

        // Server-handled messages (no "to" field)
        if (msg.type === "PATCH_STAGED") {
          const patch = addPatch({ ...msg.patch, kind: msg.patch.kind ?? 'class-change' });
          console.error(`[ws] Patch staged: #${patch.id}`);
          broadcastPatchUpdate();
        } else if (msg.type === "MESSAGE_STAGE") {
          const patch = addPatch({
            id: msg.id,
            kind: 'message',
            elementKey: msg.elementKey ?? '',
            status: 'staged',
            originalClass: '',
            newClass: '',
            property: '',
            timestamp: new Date().toISOString(),
            message: msg.message,
            component: msg.component,
          });
          console.error(`[ws] Message patch staged: #${patch.id}`);
          broadcastPatchUpdate();
        } else if (msg.type === "PATCH_COMMIT") {
          const commit = commitDraft(msg.ids);
          console.error(`[ws] Commit created: #${commit.id} (${commit.patches.length} patches)`);
          broadcastPatchUpdate();
        } else if (msg.type === "DISCARD_DRAFTS") {
          const ids: string[] = msg.ids ?? [];
          for (const id of ids) {
            discardDraftPatch(id);
          }
          console.error(`[ws] Discarded ${ids.length} draft patch(es)`);
          broadcastPatchUpdate();
        } else if (msg.type === "PING") {
          ws.send(JSON.stringify({ type: "PONG" }));
        } else if (msg.type === "DESIGN_SUBMIT") {
          const patch: Patch = {
            id: crypto.randomUUID(),
            kind: 'design',
            elementKey: `${msg.target?.tag ?? ''}.${(msg.target?.classes ?? '').split(' ')[0]}`,
            status: 'staged',
            originalClass: '',
            newClass: '',
            property: 'design',
            timestamp: new Date().toISOString(),
            component: msg.componentName ? { name: msg.componentName } : undefined,
            target: msg.target,
            context: msg.context,
            image: msg.image,
            insertMode: msg.insertMode,
            canvasWidth: msg.canvasWidth,
            canvasHeight: msg.canvasHeight,
            canvasComponents: msg.canvasComponents,
          };
          addPatch(patch);
          broadcastPatchUpdate();
          // Tell the overlay to replace the canvas with a static preview
          broadcastTo("overlay", {
            type: "DESIGN_SUBMITTED",
            image: msg.image,
          }, ws);
          console.error(`[ws] Design patch staged: ${patch.id}`);
        } else if (msg.type === "DESIGN_CLOSE") {
          broadcastTo("overlay", { type: "DESIGN_CLOSE" }, ws);
        } else if (msg.type === "RESET_SELECTION") {
          broadcastTo("panel", { type: "RESET_SELECTION" }, ws);
          console.error(`[ws] Reset selection broadcast to panels`);
        } else if (msg.type === "COMPONENT_DROPPED") {
          const patch = addPatch({ ...msg.patch, kind: msg.patch.kind ?? 'component-drop' });
          console.error(`[ws] Component-drop patch staged: #${patch.id}`);
          broadcastPatchUpdate();
        }
      } catch (err) {
        console.error("[ws] Bad message:", err);
      }
    });

    ws.on("close", () => {
      clientRoles.delete(ws);
      console.error("[ws] Client disconnected");
    });
  });

  return { broadcastPatchUpdate, broadcastTo };
}
