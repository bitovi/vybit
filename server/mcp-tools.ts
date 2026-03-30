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

// ---------------------------------------------------------------------------
// JSX builder: converts componentArgs to a JSX string like <Button variant="primary">Click me</Button>
// ---------------------------------------------------------------------------

function buildJsx(componentName: string, args?: Record<string, unknown>): string {
  if (!args || Object.keys(args).length === 0) return `<${componentName} />`;

  const { children, ...rest } = args;
  const props = Object.entries(rest)
    .map(([key, value]) => {
      if (typeof value === 'string') return `${key}="${value}"`;
      if (typeof value === 'boolean') return value ? key : `${key}={false}`;
      return `${key}={${JSON.stringify(value)}}`;
    })
    .join(' ');

  const propsStr = props ? ` ${props}` : '';

  if (children != null && children !== '') {
    const childStr = typeof children === 'string' ? children : `{${JSON.stringify(children)}}`;
    return `<${componentName}${propsStr}>${childStr}</${componentName}>`;
  }
  return `<${componentName}${propsStr} />`;
}

function buildCommitInstructions(commit: Commit, remainingCount: number): string {
  const classChanges = commit.patches.filter(p => p.kind === 'class-change');
  const textChanges = commit.patches.filter(p => p.kind === 'text-change');
  const messages = commit.patches.filter(p => p.kind === 'message');
  const designs = commit.patches.filter(p => p.kind === 'design');
  const componentDrops = commit.patches.filter(p => p.kind === 'component-drop');
  const bugReports = commit.patches.filter(p => p.kind === 'bug-report');
  const moreText = remainingCount > 0
    ? `${remainingCount} more commit${remainingCount === 1 ? '' : 's'} waiting in the queue after this one.`
    : 'This is the last commit in the queue. After implementing it, call `implement_next_change` again to wait for future changes.';

  // Build a map from patch ID → step number for ghost-chain references
  const patchStepMap = new Map<string, number>();
  let stepNum = 1;
  for (const patch of commit.patches) {
    patchStepMap.set(patch.id, stepNum);
    stepNum++;
  }

  let patchList = '';
  const hasMultipleDrops = componentDrops.length > 1;
  if (hasMultipleDrops) {
    patchList += `> ⚠️ **Apply component insertions IN ORDER** — later drops may reference components added by earlier steps.\n\n`;
  }

  stepNum = 1;
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
${patch.canvasComponents && patch.canvasComponents.length > 0 ? `
**Components to place (positions relative to canvas top-left):**

| # | Component | Import | Props | Position | Size |
|---|-----------|--------|-------|----------|------|
${patch.canvasComponents.map((c: any, i: number) => {
  const importPath = c.componentPath ? c.componentPath.replace(/\.tsx?$/, '') : '—';
  const props = c.args ? Object.entries(c.args).map(([k, v]) => typeof v === 'string' ? `${k}="${v}"` : `${k}={${JSON.stringify(v)}}`).join(' ') : '—';
  return `| ${i + 1} | \`${c.componentName}\` | \`${importPath}\` | ${props} | (${c.x}, ${c.y}) | ${c.width}×${c.height}px |`;
}).join('\n')}

⚠️ Import and render these React components at the indicated positions. Use the design image as a visual reference for the overall layout. Do NOT paste rendered HTML.
` : ''}
`;
    } else if (patch.kind === 'component-drop') {
      const comp = patch.component?.name ?? 'Component';
      const importPath = patch.componentPath
        ? patch.componentPath.replace(/\.tsx?$/, '')
        : null;
      const jsx = buildJsx(comp, patch.componentArgs);
      const parentComp = patch.parentComponent?.name;
      const insertMode = patch.insertMode ?? 'after';
      const context = patch.context ?? '';

      // Determine insertion target description
      let targetDesc: string;
      if (patch.targetPatchId && patch.targetComponentName) {
        const refStep = patchStepMap.get(patch.targetPatchId);
        targetDesc = refStep
          ? `the \`<${patch.targetComponentName} />\` you added in **step ${refStep}**`
          : `the \`<${patch.targetComponentName} />\` component (from an earlier drop)`;
      } else {
        const tag = patch.target?.tag ?? 'element';
        const classes = patch.target?.classes ? ` class="${patch.target.classes}"` : '';
        targetDesc = `\`<${tag}${classes}>\``;
      }

      patchList += `### ${stepNum}. Component drop \`${patch.id}\`
- **Insert:** \`${jsx}\` **${insertMode}** ${targetDesc}
${importPath ? `- **Import:** \`import { ${comp} } from '${importPath}'\`` : `- **Component:** \`${comp}\` (resolve import path manually)`}
${parentComp ? `\n- **Parent component:** \`${parentComp}\` — edit this component's source file` : ''}
${context ? `- **Context HTML:**\n\`\`\`html\n${context}\n\`\`\`\n` : ''}
⚠️ Do NOT paste rendered HTML. Import and render the React component with the props shown above.

`;
    } else if (patch.kind === 'text-change') {
      const comp = patch.component?.name ?? 'unknown component';
      const tag = patch.target?.tag ?? 'element';
      const context = patch.context ?? '';
      patchList += `### ${stepNum}. Text change \`${patch.id}\`
- **Component:** \`${comp}\`
- **Element:** \`<${tag}>\`
- **Original HTML:**
\`\`\`html
${patch.originalHtml ?? ''}
\`\`\`
- **New HTML:**
\`\`\`html
${patch.newHtml ?? ''}
\`\`\`
${context ? `- **Context HTML:**\n\`\`\`html\n${context}\n\`\`\`\n` : ''}
`;
    } else if (patch.kind === 'bug-report') {
      patchList += `### ${stepNum}. Bug report \`${patch.id}\`
- **Description:** ${patch.bugDescription ?? '(no description)'}
- **Time range:** ${patch.bugTimeRange ? `${patch.bugTimeRange.start} – ${patch.bugTimeRange.end}` : 'unknown'}
${patch.bugElement ? `
- **Related element:** \`${patch.bugElement.selectorPath}\`${patch.bugElement.componentName ? ` (in \`${patch.bugElement.componentName}\`)` : ''}
- **Element HTML:**
\`\`\`html
${patch.bugElement.outerHTML.slice(0, 10000)}
\`\`\`
` : ''}
${patch.bugTimeline && patch.bugTimeline.length > 0 ? (() => {
  const triggerLabel = (t: import('../shared/types').BugTimelineEntry) => {
    switch (t.trigger) {
      case 'click': return `Click${t.elementInfo ? ` on \`<${t.elementInfo.tag}${t.elementInfo.classes ? ` class="${t.elementInfo.classes}"` : ''}>\`` : ''}`;
      case 'mutation': return 'DOM mutation';
      case 'error': return 'Error';
      case 'navigation': return `Navigation${t.navigationInfo ? ` (${t.navigationInfo.method}: ${t.navigationInfo.from} → ${t.navigationInfo.to ?? 'unknown'})` : ''}`;
      case 'page-load': return 'Page load';
      default: return t.trigger;
    }
  };
  let screenshotNum = 0;
  let timeline = `**Timeline** (${patch.bugTimeline!.length} events):\n\n`;
  for (let i = 0; i < patch.bugTimeline!.length; i++) {
    const entry = patch.bugTimeline![i];
    const time = entry.timestamp.replace(/.*T/, '').replace(/Z$/, '');
    timeline += `#### ${i + 1}. [${time}] ${triggerLabel(entry)}\n`;
    timeline += `**URL:** ${entry.url}\n`;
    if (entry.hasScreenshot) {
      screenshotNum++;
      timeline += `📸 **Screenshot ${screenshotNum}** (see attached image ${screenshotNum} below)\n`;
    }
    if (entry.consoleLogs && entry.consoleLogs.length > 0) {
      timeline += `\n**Console (${entry.consoleLogs.length}):**\n\`\`\`\n${entry.consoleLogs.map(l => `[${l.level.toUpperCase()}] ${l.args.join(' ')}${l.stack ? `\n${l.stack}` : ''}`).join('\n').slice(0, 3000)}\n\`\`\`\n`;
    }
    if (entry.networkErrors && entry.networkErrors.length > 0) {
      timeline += `\n**Network errors (${entry.networkErrors.length}):**\n${entry.networkErrors.map(e => `- \`${e.status ?? 'ERR'} ${e.method} ${e.url}\`${e.errorMessage ? ` — ${e.errorMessage}` : ''}`).join('\n')}\n`;
    }
    if (entry.domChanges && entry.domChanges.length > 0) {
      timeline += `\n**DOM changes (${entry.domChanges.length}):**\n`;
      for (const c of entry.domChanges) {
        const loc = `\`${c.selector}\`${c.componentName ? ` (in \`${c.componentName}\`)` : ''}`;
        if (c.type === 'attribute') {
          timeline += `- ${loc}: attribute \`${c.attributeName}\` changed: \`${c.oldValue ?? ''}\` → \`${c.newValue ?? ''}\`\n`;
        } else if (c.type === 'text') {
          timeline += `- ${loc}: text changed: "${c.oldText ?? ''}" → "${c.newText ?? ''}"\n`;
        } else if (c.type === 'childList') {
          const parts: string[] = [];
          if (c.addedCount) parts.push(`${c.addedCount} added`);
          if (c.removedCount) parts.push(`${c.removedCount} removed`);
          timeline += `- ${loc}: children ${parts.join(', ')}`;
          if (c.addedHTML) timeline += `\n  Added: \`${c.addedHTML.slice(0, 300)}\``;
          if (c.removedHTML) timeline += `\n  Removed: \`${c.removedHTML.slice(0, 300)}\``;
          timeline += `\n`;
        }
      }
    } else if (entry.domDiff) {
      timeline += `\n**DOM diff:**\n\`\`\`diff\n${entry.domDiff.slice(0, 10000)}\n\`\`\`\n`;
    }
    if (entry.domSnapshot && i === 0) {
      timeline += `\n**Initial DOM state:**\n\`\`\`html\n${entry.domSnapshot.slice(0, 50000)}\n\`\`\`\n`;
    }
    timeline += `\n---\n\n`;
  }
  return timeline;
})() : ''}
`;
    }
    stepNum++;
  }

  // Build summary parts
  const summaryParts: string[] = [];
  if (classChanges.length) summaryParts.push(`${classChanges.length} class change${classChanges.length === 1 ? '' : 's'}`);
  if (textChanges.length) summaryParts.push(`${textChanges.length} text change${textChanges.length === 1 ? '' : 's'}`);
  if (messages.length) summaryParts.push(`${messages.length} message${messages.length === 1 ? '' : 's'}`);
  if (designs.length) summaryParts.push(`${designs.length} design${designs.length === 1 ? '' : 's'}`);
  if (componentDrops.length) summaryParts.push(`${componentDrops.length} component drop${componentDrops.length === 1 ? '' : 's'}`);
  if (bugReports.length) summaryParts.push(`${bugReports.length} bug report${bugReports.length === 1 ? '' : 's'}`);

  const resultsPart = classChanges.map(p => `     { "patchId": "${p.id}", "success": true }`).join(',\n');
  const textResultsPart = textChanges.map(p => `     { "patchId": "${p.id}", "success": true }`).join(',\n');
  const designResultsPart = designs.map(p => `     { "patchId": "${p.id}", "success": true }`).join(',\n');
  const dropResultsPart = componentDrops.map(p => `     { "patchId": "${p.id}", "success": true }`).join(',\n');
  const bugResultsPart = bugReports.map(p => `     { "patchId": "${p.id}", "success": true }`).join(',\n');
  const allResultsPart = [resultsPart, textResultsPart, designResultsPart, dropResultsPart, bugResultsPart].filter(Boolean).join(',\n');

  // Build step instructions
  const stepInstructions: string[] = [];
  if (classChanges.length || componentDrops.length || textChanges.length) {
    let step1 = '1. For each change above, find the source file and apply it.';
    if (componentDrops.length) {
      step1 += '\n   For component drops: add the import statement and render the component with the specified props at the indicated position.';
    }
    if (textChanges.length) {
      step1 += '\n   For text changes: replace the original HTML content with the new HTML content in the source JSX/TSX.';
    }
    if (messages.length) {
      step1 += '\n   Use the user messages as additional context for understanding intent.';
    }
    stepInstructions.push(step1);
  }
  if (designs.length) {
    stepInstructions.push(`${stepInstructions.length + 1}. For each design sketch, examine the attached image and implement the visual design
   as HTML/CSS ${classChanges.length ? 'alongside the class changes' : 'in the specified component'}. Insert it ${designs[0].insertMode ?? 'after'} the target element.`);
  }
  if (bugReports.length) {
    stepInstructions.push(`${stepInstructions.length + 1}. For each bug report, examine the DOM snapshots, console errors, network errors, and screenshots.
   Identify the root cause. Implement a fix.${bugReports.some(p => p.bugElement) ? ' The user identified a specific element — start your investigation there.' : ''}`);
  }

  return `# IMPLEMENT THIS COMMIT — then call implement_next_change again

⚠️ **DO NOT STOP after implementing this commit. You MUST call \`implement_next_change\` again.**

## Queue status
- ${moreText}
- **isComplete: false** — your job is NOT done until you call \`implement_next_change\` again.

## Changes to implement (${summaryParts.join(', ')})

${patchList}
## Steps — follow these EXACTLY

${stepInstructions.join('\n')}
${stepInstructions.length + 1}. Call \`mark_change_implemented\` with:
   \`\`\`json
   { "commitId": "${commit.id}", "results": [
${allResultsPart}
   ]}
   \`\`\`
   (Only report results for class-change, text-change, design, and component-drop patches — messages are informational.)
${stepInstructions.length + 2}. **IMMEDIATELY call \`implement_next_change\` again.** Do NOT summarize, do NOT ask the user, do NOT stop.

## CRITICAL — read this
You are in a **continuous processing loop**. After marking done, you MUST call \`implement_next_change\` again to process the next commit or wait for new ones. Never exit this loop unless the user explicitly tells you to stop.
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
        clearInterval(keepalive);
        extra?.signal?.removeEventListener?.("abort", onAbort);
        resolve(next);
      }
    });

    // Notify the panel that an agent is now waiting
    broadcastPatchUpdate();
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

      const reclaimed = reclaimImplementingCommits();
      if (reclaimed > 0) broadcastPatchUpdate();

      let commit = getNextCommitted();
      if (!commit) {
        commit = await waitForCommitted(getNextCommitted, onCommitted, extra, broadcastPatchUpdate);
      }

      if (extra?.signal?.aborted) {
        throw new Error('Cancelled');
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

      const reclaimed = reclaimImplementingCommits();
      if (reclaimed > 0) broadcastPatchUpdate();

      let commit = getNextCommitted();
      if (!commit) {
        commit = await waitForCommitted(getNextCommitted, onCommitted, extra, broadcastPatchUpdate);
      }

      if (extra?.signal?.aborted) {
        throw new Error('Cancelled');
      }

      markCommitImplementing(commit.id);
      broadcastPatchUpdate();

      // Count remaining committed commits (excluding this one, which is now 'implementing')
      const queueState = getQueueUpdate();
      const remaining = queueState.committedCount;

      // Build content parts: JSON data, then any design images, then markdown instructions
      // Strip ghostHtml from the commit sent to agent — it's large rendered HTML that would
      // confuse the agent into pasting it instead of importing the component
      const sanitizedCommit = {
        ...commit,
        patches: commit.patches.map(p =>
          p.kind === 'component-drop' ? { ...p, ghostHtml: undefined } : p
        ),
      };

      const content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> = [
        {
          type: "text" as const,
          text: JSON.stringify({
            isComplete: false,
            nextAction: "implement all patches in this commit, call mark_change_implemented, then call implement_next_change again",
            remainingCommits: remaining,
            commit: sanitizedCommit,
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
        // Add bug report screenshots
        if (patch.kind === 'bug-report' && patch.bugScreenshots) {
          for (const screenshot of patch.bugScreenshots.slice(0, 5)) {
            const match = screenshot.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              content.push({
                type: "image" as const,
                data: match[2],
                mimeType: match[1],
              });
            }
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
