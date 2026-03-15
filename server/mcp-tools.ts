// MCP tool registration

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { Patch, PatchStatus } from "../shared/types.js";

export interface McpToolDeps {
  broadcastPatchUpdate: () => void;
  getNextCommitted: () => Patch | null;
  onCommitted: (listener: () => void) => () => void;
  markImplementing: (ids: string[]) => number;
  markImplemented: (ids: string[]) => number;
  getByStatus: (status: PatchStatus) => Patch[];
  getCounts: () => { staged: number; committed: number; implementing: number; implemented: number };
  clearAll: () => { staged: number; committed: number; implementing: number; implemented: number };
}

const KEEPALIVE_INTERVAL_MS = 60_000;

// ---------------------------------------------------------------------------
// Prompt builders for implement_next_change
// ---------------------------------------------------------------------------

function buildImplementInstructions(patch: Patch, remainingCount: number): string {
  const comp = patch.component?.name ?? 'unknown component';
  const tag = patch.target?.tag ?? 'element';
  const context = patch.context ?? '';
  const moreText = remainingCount > 0
    ? `${remainingCount} more change${remainingCount === 1 ? '' : 's'} waiting in the queue after this one.`
    : 'This is the last change in the queue. After implementing it, call `implement_next_change` again to wait for future changes.';

  return `# IMPLEMENT THIS CHANGE — then call implement_next_change again

⚠️ **DO NOT STOP after implementing this change. You MUST call \`implement_next_change\` again.**

## Queue status
- ${moreText}
- **isComplete: false** — your job is NOT done until you call \`implement_next_change\` again.

## What to change
- **Component:** \`${comp}\`
- **Element:** \`<${tag}>\`
- **Class change:** \`${patch.originalClass}\` → \`${patch.newClass}\`
- **Property:** ${patch.property}

## Context HTML
\`\`\`html
${context}
\`\`\`

## Steps — follow these EXACTLY

1. Find the source file for the component \`${comp}\`.
2. Locate the element matching:
   - Tag: \`<${tag}>\`
   - Current classes include: \`${patch.target?.classes ?? ''}\`
3. Replace \`${patch.originalClass}\` with \`${patch.newClass}\` in the source code.
4. Save the file.
5. Call \`mark_change_implemented\` with \`{ "ids": ["${patch.id}"] }\`
6. **IMMEDIATELY call \`implement_next_change\` again.** Do NOT summarize, do NOT ask the user, do NOT stop.

## CRITICAL — read this
You are in a **continuous processing loop**. After step 5, you MUST call \`implement_next_change\` again to process the next change or wait for new ones. Never exit this loop unless the user explicitly tells you to stop.
`;
}

// ---------------------------------------------------------------------------
// Wait-for-committed helper (shared by get_next_change and implement_next_change)
// ---------------------------------------------------------------------------

function waitForCommitted(
  getNextCommitted: () => Patch | null,
  onCommitted: (listener: () => void) => () => void,
  extra: any,
): Promise<Patch> {
  return new Promise<Patch>((resolve, reject) => {
    const progressToken = extra?._meta?.progressToken;

    const keepalive = setInterval(async () => {
      if (progressToken !== undefined) {
        try {
          await extra.sendNotification({
            method: "notifications/progress",
            params: {
              progressToken,
              progress: 0,
              total: 1,
              message: "Waiting for user to commit a change...",
            },
          });
        } catch {
          // Client may have disconnected
        }
      }
    }, KEEPALIVE_INTERVAL_MS);

    const onAbort = () => {
      clearInterval(keepalive);
      unsubscribe();
      reject(new Error("Cancelled"));
    };
    extra?.signal?.addEventListener?.("abort", onAbort);

    const unsubscribe = onCommitted(() => {
      const next = getNextCommitted();
      if (next) {
        clearInterval(keepalive);
        extra?.signal?.removeEventListener?.("abort", onAbort);
        resolve(next);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Tool registration
// ---------------------------------------------------------------------------

export function registerMcpTools(mcp: McpServer, deps: McpToolDeps): void {
  const {
    broadcastPatchUpdate,
    getNextCommitted,
    onCommitted,
    markImplementing,
    markImplemented,
    getByStatus,
    getCounts,
    clearAll,
  } = deps;

  // --- get_next_change ---
  mcp.tool(
    "get_next_change",
    "Waits for and returns the next committed change. " +
    "Transitions the change to 'implementing' status. " +
    "Returns only the raw patch data — no workflow instructions. " +
    "Use implement_next_change instead if you want guided implementation with auto-looping.",
    async (_extra) => {
      const extra = _extra as any;

      let patch = getNextCommitted();
      if (!patch) {
        patch = await waitForCommitted(getNextCommitted, onCommitted, extra);
      }

      markImplementing([patch.id]);
      broadcastPatchUpdate();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(patch, null, 2),
          },
        ],
      };
    },
  );

  // --- implement_next_change ---
  mcp.tool(
    "implement_next_change",
    "CONTINUOUS LOOP: Waits for the next committed change, returns implementation instructions, " +
    "and REQUIRES the agent to apply it, mark it done, then call this tool AGAIN. " +
    "The agent MUST keep calling this tool in a loop until explicitly stopped by the user. " +
    "Never exit the loop after implementing a change — always call implement_next_change again.",
    async (_extra) => {
      const extra = _extra as any;

      let patch = getNextCommitted();
      if (!patch) {
        patch = await waitForCommitted(getNextCommitted, onCommitted, extra);
      }

      markImplementing([patch.id]);
      broadcastPatchUpdate();

      // Count remaining committed patches (excluding this one, which is now 'implementing')
      const remaining = getByStatus('committed').length;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              isComplete: false,
              nextAction: "implement this change, call mark_change_implemented, then call implement_next_change again",
              remainingChanges: remaining,
              patch,
            }, null, 2),
          },
          {
            type: "text" as const,
            text: buildImplementInstructions(patch, remaining),
          },
        ],
      };
    },
  );

  // --- mark_change_implemented ---
  mcp.tool(
    "mark_change_implemented",
    "Marks changes as implemented after the agent has applied them to source code. " +
    "After calling this, you MUST call implement_next_change again to continue processing.",
    { ids: z.array(z.string()).describe("Patch IDs to mark as implemented") },
    async ({ ids }) => {
      const moved = markImplemented(ids);
      broadcastPatchUpdate();

      const counts = getCounts();
      const remaining = counts.committed + counts.implementing;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              moved,
              isComplete: false,
              nextAction: "call implement_next_change NOW to process the next change",
              remainingInQueue: remaining,
            }),
          },
          {
            type: "text" as const,
            text: `✅ Marked ${moved} change(s) as implemented.\n\n` +
              `⚠️ **YOUR NEXT STEP:** Call \`implement_next_change\` NOW.\n` +
              `Do NOT stop. Do NOT summarize. Do NOT ask the user what to do.\n` +
              `${remaining > 0 ? `There are ${remaining} more change(s) to process.` : 'No more changes right now — call implement_next_change to wait for the next one.'}`,
          },
        ],
      };
    },
  );

  // --- list_changes ---
  mcp.tool(
    "list_changes",
    "Lists changes, optionally filtered by status. Returns all changes grouped by status if no filter is provided.",
    { status: z.enum(["staged", "committed", "implementing", "implemented"]).optional().describe("Filter by patch status") },
    async ({ status }) => {
      if (status) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(getByStatus(status), null, 2) }],
        };
      }
      const counts = getCounts();
      const all = {
        ...counts,
        patches: {
          staged: getByStatus("staged"),
          committed: getByStatus("committed"),
          implementing: getByStatus("implementing"),
          implemented: getByStatus("implemented"),
        },
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(all, null, 2) }],
      };
    },
  );

  // --- discard_all_changes ---
  mcp.tool(
    "discard_all_changes",
    "Discards all changes regardless of status",
    async () => {
      const counts = clearAll();
      broadcastPatchUpdate();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(counts) }],
      };
    },
  );
}
