// MCP tool registration

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { Patch, PatchStatus, Commit } from "../shared/types.js";
import type { PatchResult } from "./queue.js";

export interface McpToolDeps {
  broadcastPatchUpdate: () => void;
  getNextCommitted: () => Commit | null;
  onCommitted: (listener: () => void) => () => void;
  reclaimImplementingCommits: () => number;
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
  const designs = commit.patches.filter(p => p.kind === 'design');
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
    } else if (patch.kind === 'design') {
      const comp = patch.component?.name ?? 'unknown component';
      const tag = patch.target?.tag ?? 'element';
      const context = patch.context ?? '';
      patchList += `### ${stepNum}. Design sketch \`${patch.id}\`
- **Component:** \`${comp}\`
- **Element:** \`<${tag}>\`
- **Insert position:** ${patch.insertMode ?? 'after'} the element
- **Canvas size:** ${patch.canvasWidth ?? '?'}×${patch.canvasHeight ?? '?'}px
- The design image is included as a separate image content part below — refer to it for the visual intent.
${context ? `- **Context HTML:**\n\`\`\`html\n${context}\n\`\`\`\n` : ''}
`;
    }
    stepNum++;
  }

  // Build summary parts
  const summaryParts: string[] = [];
  if (classChanges.length) summaryParts.push(`${classChanges.length} class change${classChanges.length === 1 ? '' : 's'}`);
  if (messages.length) summaryParts.push(`${messages.length} message${messages.length === 1 ? '' : 's'}`);
  if (designs.length) summaryParts.push(`${designs.length} design${designs.length === 1 ? '' : 's'}`);

  const resultsPart = classChanges.map(p => `     { "patchId": "${p.id}", "success": true }`).join(',\n');

  // Design patches also need to be reported in results
  const designResultsPart = designs.map(p => `     { "patchId": "${p.id}", "success": true }`).join(',\n');
  const allResultsPart = [resultsPart, designResultsPart].filter(Boolean).join(',\n');

  return `# IMPLEMENT THIS COMMIT — then call implement_next_change again

⚠️ **DO NOT STOP after implementing this commit. You MUST call \`implement_next_change\` again.**

## Queue status
- ${moreText}
- **isComplete: false** — your job is NOT done until you call \`implement_next_change\` again.

## Changes to implement (${summaryParts.join(', ')})

${patchList}
## Steps — follow these EXACTLY

1. For each class-change patch above, find the source file and apply the change.
   Use the user messages as additional context for understanding intent.
${designs.length ? `   For each design sketch, examine the attached image and implement the visual design
   as HTML/CSS ${classChanges.length ? 'alongside the class changes' : 'in the specified component'}. Insert it ${designs[0].insertMode ?? 'after'} the target element.
` : ''}\n2. Call \`mark_change_implemented\` with:
   \`\`\`json
   { "commitId": "${commit.id}", "results": [
${allResultsPart}
   ]}
   \`\`\`
   (Only report results for class-change and design patches — messages are informational.)
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
  broadcastPatchUpdate: () => void,
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
      console.log('[mcp] waitForCommitted: abort signal fired — client disconnected');
      clearInterval(keepalive);
      unsubscribe();
      // Notify the panel that no agent is waiting anymore
      broadcastPatchUpdate();
      reject(new Error("Cancelled"));
    };
    extra?.signal?.addEventListener?.("abort", onAbort);

    const unsubscribe = onCommitted(() => {
      const next = getNextCommitted();
      if (next) {
        console.log(`[mcp] waitForCommitted: resolved with commit ${next.id}`);
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
    reclaimImplementingCommits,
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
      console.log('[mcp] get_next_change called');

      const reclaimed = reclaimImplementingCommits();
      if (reclaimed > 0) broadcastPatchUpdate();

      let commit = getNextCommitted();
      if (!commit) {
        commit = await waitForCommitted(getNextCommitted, onCommitted, extra, broadcastPatchUpdate);
      }

      if (extra?.signal?.aborted) {
        console.log('[mcp] get_next_change: signal aborted after waitForCommitted — skipping markCommitImplementing');
        throw new Error('Cancelled');
      }

      console.log(`[mcp] get_next_change: marking commit ${commit.id} as implementing`);
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
      console.log('[mcp] implement_next_change called');

      const reclaimed = reclaimImplementingCommits();
      if (reclaimed > 0) broadcastPatchUpdate();

      let commit = getNextCommitted();
      if (!commit) {
        commit = await waitForCommitted(getNextCommitted, onCommitted, extra, broadcastPatchUpdate);
      }

      if (extra?.signal?.aborted) {
        console.log('[mcp] implement_next_change: signal aborted after waitForCommitted — skipping markCommitImplementing');
        throw new Error('Cancelled');
      }

      console.log(`[mcp] implement_next_change: marking commit ${commit.id} as implementing`);
      markCommitImplementing(commit.id);
      broadcastPatchUpdate();

      // Count remaining committed commits (excluding this one, which is now 'implementing')
      const queueState = getQueueUpdate();
      const remaining = queueState.committedCount;

      // Build content parts: JSON data, then any design images, then markdown instructions
      const content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> = [
        {
          type: "text" as const,
          text: JSON.stringify({
            isComplete: false,
            nextAction: "implement all class-change patches in this commit, call mark_change_implemented, then call implement_next_change again",
            remainingCommits: remaining,
            commit,
          }, null, 2),
        },
      ];

      // Add design images as separate image content parts so the agent can see them
      for (const patch of commit.patches) {
        if (patch.kind === 'design' && patch.image) {
          const match = patch.image.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            content.push({
              type: "image" as const,
              data: match[2],
              mimeType: match[1],
            });
          }
        }
      }

      content.push({
        type: "text" as const,
        text: buildCommitInstructions(commit, remaining),
      });

      return { content };
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

}
