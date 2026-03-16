// MCP tool registration

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { Patch, PatchStatus, Commit } from "../shared/types.js";
import type { PatchResult } from "./queue.js";
import { getDesignRequests, markDesignApplied, clearDesignRequests } from "./design-queue.js";

export interface McpToolDeps {
  broadcastPatchUpdate: () => void;
  getNextCommitted: () => Commit | null;
  onCommitted: (listener: () => void) => () => void;
  markCommitImplementing: (commitId: string) => void;
  markCommitImplemented: (commitId: string, results: PatchResult[]) => void;
  // Legacy per-patch methods (backward compat)
  markImplementing: (ids: string[]) => number;
  markImplemented: (ids: string[]) => number;
  getByStatus: (status: PatchStatus) => Patch[];
  getCounts: () => { staged: number; committed: number; implementing: number; implemented: number };
  getQueueUpdate: () => any;
  clearAll: () => { staged: number; committed: number; implementing: number; implemented: number };
}

const KEEPALIVE_INTERVAL_MS = 60_000;

// ---------------------------------------------------------------------------
// Prompt builders for implement_next_change
// ---------------------------------------------------------------------------

function buildCommitInstructions(commit: Commit, remainingCount: number): string {
  const classChanges = commit.patches.filter(p => p.kind === 'class-change');
  const messages = commit.patches.filter(p => p.kind === 'message');
  const moreText = remainingCount > 0
    ? `${remainingCount} more commit${remainingCount === 1 ? '' : 's'} waiting in the queue after this one.`
    : 'This is the last commit in the queue. After implementing it, call `implement_next_change` again to wait for future changes.';

  let patchList = '';
  let stepNum = 1;
  for (const patch of commit.patches) {
    if (patch.kind === 'class-change') {
      const comp = patch.component?.name ?? 'unknown component';
      const tag = patch.target?.tag ?? 'element';
      const context = patch.context ?? '';
      patchList += `### ${stepNum}. Class change \`${patch.id}\`
- **Component:** \`${comp}\`
- **Element:** \`<${tag}>\`
- **Class change:** \`${patch.originalClass}\` → \`${patch.newClass}\`
- **Property:** ${patch.property}
${context ? `- **Context HTML:**\n\`\`\`html\n${context}\n\`\`\`\n` : ''}
`;
    } else if (patch.kind === 'message') {
      patchList += `### ${stepNum}. User message
> ${patch.message}
${patch.elementKey ? `\n_Scoped to: ${patch.elementKey}_\n` : ''}
`;
    }
    stepNum++;
  }

  const resultsPart = classChanges.map(p => `     { "patchId": "${p.id}", "success": true }`).join(',\n');

  return `# IMPLEMENT THIS COMMIT — then call implement_next_change again

⚠️ **DO NOT STOP after implementing this commit. You MUST call \`implement_next_change\` again.**

## Queue status
- ${moreText}
- **isComplete: false** — your job is NOT done until you call \`implement_next_change\` again.

## Changes to implement (${classChanges.length} class change${classChanges.length === 1 ? '' : 's'}, ${messages.length} message${messages.length === 1 ? '' : 's'})

${patchList}
## Steps — follow these EXACTLY

1. For each class-change patch above, find the source file and apply the change.
   Use the user messages as additional context for understanding intent.
2. Call \`mark_change_implemented\` with:
   \`\`\`json
   { "commitId": "${commit.id}", "results": [
${resultsPart}
   ]}
   \`\`\`
   (Only report results for class-change patches — messages are informational.)
3. **IMMEDIATELY call \`implement_next_change\` again.** Do NOT summarize, do NOT ask the user, do NOT stop.

## CRITICAL — read this
You are in a **continuous processing loop**. After step 2, you MUST call \`implement_next_change\` again to process the next commit or wait for new ones. Never exit this loop unless the user explicitly tells you to stop.
`;
}

// ---------------------------------------------------------------------------
// Wait-for-committed helper (shared by get_next_change and implement_next_change)
// ---------------------------------------------------------------------------

function waitForCommitted(
  getNextCommitted: () => Commit | null,
  onCommitted: (listener: () => void) => () => void,
  extra: any,
): Promise<Commit> {
  return new Promise<Commit>((resolve, reject) => {
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
    markCommitImplementing,
    markCommitImplemented,
    markImplementing,
    markImplemented,
    getByStatus,
    getCounts,
    getQueueUpdate,
    clearAll,
  } = deps;

  // --- get_next_change ---
  mcp.tool(
    "get_next_change",
    "Waits for and returns the next committed change (full commit with all patches). " +
    "Transitions the commit to 'implementing' status. " +
    "Returns only the raw commit data — no workflow instructions. " +
    "Use implement_next_change instead if you want guided implementation with auto-looping.",
    async (_extra) => {
      const extra = _extra as any;

      let commit = getNextCommitted();
      if (!commit) {
        commit = await waitForCommitted(getNextCommitted, onCommitted, extra);
      }

      markCommitImplementing(commit.id);
      broadcastPatchUpdate();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(commit, null, 2),
          },
        ],
      };
    },
  );

  // --- implement_next_change ---
  mcp.tool(
    "implement_next_change",
    "CONTINUOUS LOOP: Waits for the next committed change (a commit with class-changes and context messages), " +
    "returns implementation instructions, and REQUIRES the agent to apply all class-changes, mark them done, " +
    "then call this tool AGAIN. Messages in the commit provide context for understanding intent. " +
    "The agent MUST keep calling this tool in a loop until explicitly stopped by the user.",
    async (_extra) => {
      const extra = _extra as any;

      let commit = getNextCommitted();
      if (!commit) {
        commit = await waitForCommitted(getNextCommitted, onCommitted, extra);
      }

      markCommitImplementing(commit.id);
      broadcastPatchUpdate();

      // Count remaining committed commits (excluding this one, which is now 'implementing')
      const queueState = getQueueUpdate();
      const remaining = queueState.committedCount;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              isComplete: false,
              nextAction: "implement all class-change patches in this commit, call mark_change_implemented, then call implement_next_change again",
              remainingCommits: remaining,
              commit,
            }, null, 2),
          },
          {
            type: "text" as const,
            text: buildCommitInstructions(commit, remaining),
          },
        ],
      };
    },
  );

  // --- mark_change_implemented ---
  mcp.tool(
    "mark_change_implemented",
    "Marks changes as implemented after the agent has applied them to source code. " +
    "Accepts either commitId + per-patch results (new) or legacy ids array. " +
    "After calling this, you MUST call implement_next_change again to continue processing.",
    {
      commitId: z.string().optional().describe("The commit ID (new commit-based flow)"),
      results: z.array(z.object({
        patchId: z.string().describe("ID of a class-change patch"),
        success: z.boolean(),
        error: z.string().optional(),
      })).optional().describe("Per-patch results (class-change patches only — skip message patches)"),
      ids: z.array(z.string()).optional().describe("Legacy: Patch IDs to mark as implemented"),
    },
    async ({ commitId, results, ids }) => {
      let moved = 0;

      if (commitId && results) {
        // New commit-based flow
        markCommitImplemented(commitId, results);
        moved = results.filter(r => r.success).length;
      } else if (ids) {
        // Legacy per-patch flow
        moved = markImplemented(ids);
      }

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
    "Lists changes grouped by commit status. Optionally filter by a specific status.",
    { status: z.enum(["staged", "committed", "implementing", "implemented", "error"]).optional().describe("Filter by patch status") },
    async ({ status }) => {
      if (status) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(getByStatus(status), null, 2) }],
        };
      }
      const queueState = getQueueUpdate();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(queueState, null, 2) }],
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

  // --- get_design_requests ---
  mcp.tool(
    "get_design_requests",
    "Get pending design sketches submitted by the user. Each request contains a base64 PNG image of the user's sketch, " +
    "the component and element context where the design should be inserted, and the insertion position (before, after, first-child, last-child). " +
    "The image is included as both a base64 data URL in the text and as an image content block for vision-capable models.",
    async () => {
      const requests = getDesignRequests();
      if (requests.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No pending design requests." }],
        };
      }

      const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [];

      for (const req of requests) {
        content.push({
          type: "text" as const,
          text: `## Design Request #${req.id}\n\n` +
            `**Component:** ${req.componentName}\n` +
            `**Target:** <${req.target.tag} class="${req.target.classes}">\n` +
            `**Inner text:** ${req.target.innerText}\n` +
            `**Insert position:** ${req.insertMode}\n` +
            `**Canvas size:** ${req.canvasWidth}×${req.canvasHeight}px\n` +
            `**Timestamp:** ${req.timestamp}\n\n` +
            `**Context HTML:**\n\`\`\`html\n${req.context}\n\`\`\`\n\n` +
            `Please implement what the user has sketched in the attached image. ` +
            `Create appropriate React JSX with Tailwind classes and insert it ${req.insertMode} the target element.\n\n` +
            `After implementing, call \`mark_design_applied\` with ids: [${req.id}].`,
        });

        // Include the image as a content block for vision models
        const base64Match = req.image.match(/^data:image\/(\w+);base64,(.+)$/);
        if (base64Match) {
          content.push({
            type: "image" as const,
            data: base64Match[2],
            mimeType: `image/${base64Match[1]}`,
          });
        }
      }

      return { content };
    },
  );

  // --- mark_design_applied ---
  mcp.tool(
    "mark_design_applied",
    "Mark design requests as applied after the agent has processed them.",
    {
      ids: z.array(z.number()).describe("IDs of design requests to mark as applied"),
    },
    async ({ ids }) => {
      const count = markDesignApplied(ids);
      return {
        content: [{
          type: "text" as const,
          text: `Marked ${count} design request(s) as applied.`,
        }],
      };
    },
  );

  // --- clear_design_requests ---
  mcp.tool(
    "clear_design_requests",
    "Remove all design requests from the queue.",
    async () => {
      const count = clearDesignRequests();
      return {
        content: [{
          type: "text" as const,
          text: `Cleared ${count} design request(s).`,
        }],
      };
    },
  );
}
