// In-memory patch queue with draft + commits model

import { EventEmitter } from 'node:events';
import type { Patch, PatchStatus, PatchSummary, Commit, CommitStatus, CommitSummary } from '../shared/types.js';

const emitter = new EventEmitter();

function toSummary(p: Patch): PatchSummary {
  return {
    id: p.id,
    kind: p.kind,
    elementKey: p.elementKey,
    status: p.status,
    originalClass: p.originalClass,
    newClass: p.newClass,
    property: p.property,
    timestamp: p.timestamp,
    component: p.component,
    errorMessage: p.errorMessage,
    message: p.message,
    image: p.image,
  };
}

function toCommitSummary(c: Commit): CommitSummary {
  return {
    id: c.id,
    status: c.status,
    timestamp: c.timestamp,
    patches: c.patches.map(toSummary),
  };
}

// Mutable draft: accumulates patches as the user stages them (preserves insertion order)
const draftPatches: Patch[] = [];

// Finalized commits
const commits: Commit[] = [];

export function addPatch(patch: Patch): Patch {
  // Dedup by ID first — if an identical PATCH_STAGED arrives twice (e.g. from
  // two overlays connected to the same server) just ignore the duplicate.
  if (draftPatches.some(p => p.id === patch.id)) {
    return patch;
  }

  if (patch.kind === 'class-change') {
    // Dedup: if a staged patch exists for the same elementKey+property, replace it
    const existingIdx = draftPatches.findIndex(
      p => p.kind === 'class-change' && p.elementKey === patch.elementKey && p.property === patch.property && p.status === 'staged'
    );
    if (existingIdx !== -1) {
      draftPatches.splice(existingIdx, 1);
    }
  }
  // Message patches are always appended (no dedup)
  draftPatches.push(patch);
  return patch;
}

export function commitDraft(ids: string[]): Commit {
  const idSet = new Set(ids);
  const commitPatches: Patch[] = [];

  // Extract matching patches from draft, preserving order
  for (let i = draftPatches.length - 1; i >= 0; i--) {
    if (idSet.has(draftPatches[i].id) && draftPatches[i].status === 'staged') {
      draftPatches[i].status = 'committed';
      commitPatches.unshift(draftPatches[i]);
      draftPatches.splice(i, 1);
    }
  }

  const commit: Commit = {
    id: crypto.randomUUID(),
    patches: commitPatches,
    status: 'committed',
    timestamp: new Date().toISOString(),
  };

  // Set commitId on each patch
  for (const p of commit.patches) {
    p.commitId = commit.id;
  }

  commits.push(commit);
  if (commitPatches.length > 0) emitter.emit('committed');
  return commit;
}

/** @deprecated Use commitDraft instead. Backward compat shim. */
export function commitPatches(ids: string[]): number {
  const commit = commitDraft(ids);
  return commit.patches.length;
}

/** Returns the oldest Commit with status 'committed', or null. */
export function getNextCommitted(): Commit | null {
  return commits.find(c => c.status === 'committed') ?? null;
}

/**
 * Resets all commits in 'implementing' status back to 'committed'.
 * Called when a new agent connects via implement_next_change, so orphaned
 * commits from a previously disconnected agent are automatically reclaimed.
 */
export function reclaimImplementingCommits(): number {
  let count = 0;
  for (const commit of commits) {
    if (commit.status === 'implementing') {
      console.log(`[queue] Reclaiming orphaned implementing commit ${commit.id} → committed`);
      commit.status = 'committed';
      for (const p of commit.patches) {
        if (p.status === 'implementing') p.status = 'committed';
      }
      count++;
    }
  }
  return count;
}

export function markCommitImplementing(commitId: string): void {
  const commit = commits.find(c => c.id === commitId);
  if (!commit) return;
  commit.status = 'implementing';
  for (const p of commit.patches) {
    if (p.status === 'committed') p.status = 'implementing';
  }
}

export interface PatchResult {
  patchId: string;
  success: boolean;
  error?: string;
}

export function markCommitImplemented(commitId: string, results: PatchResult[]): void {
  const commit = commits.find(c => c.id === commitId);
  if (!commit) return;

  // Apply results to class-change patches
  for (const result of results) {
    const patch = commit.patches.find(p => p.id === result.patchId);
    if (!patch) continue;
    patch.status = result.success ? 'implemented' : 'error';
    if (result.error) patch.errorMessage = result.error;
  }

  // Message patches are always "implemented" (informational, no action needed)
  for (const patch of commit.patches) {
    if (patch.kind === 'message') patch.status = 'implemented';
  }

  const classChanges = commit.patches.filter(p => p.kind === 'class-change');
  const allSucceeded = classChanges.every(p => p.status === 'implemented');
  const allFailed = classChanges.every(p => p.status === 'error');

  commit.status = classChanges.length === 0 ? 'implemented'  // message-only commit
               : allSucceeded               ? 'implemented'
               : allFailed                   ? 'error'
               :                               'partial';
}

/** Legacy: mark individual patch IDs as implementing (backward compat for old MCP tools). */
export function markImplementing(ids: string[]): number {
  const idSet = new Set(ids);
  let moved = 0;
  for (const commit of commits) {
    for (const p of commit.patches) {
      if (idSet.has(p.id) && p.status === 'committed') {
        p.status = 'implementing';
        moved++;
      }
    }
    // If all patches in commit are implementing, update commit status
    if (commit.status === 'committed' && commit.patches.every(p => p.status !== 'committed')) {
      commit.status = 'implementing';
    }
  }
  return moved;
}

/** Legacy: mark individual patch IDs as implemented (backward compat). */
export function markImplemented(ids: string[]): number {
  const idSet = new Set(ids);
  let moved = 0;
  for (const commit of commits) {
    for (const p of commit.patches) {
      if (idSet.has(p.id) && (p.status === 'committed' || p.status === 'implementing')) {
        p.status = 'implemented';
        moved++;
      }
    }
    // Auto-succeed message patches if all class-changes done
    const classChanges = commit.patches.filter(p => p.kind === 'class-change');
    if (classChanges.length > 0 && classChanges.every(p => p.status === 'implemented')) {
      for (const p of commit.patches) {
        if (p.kind === 'message' && p.status !== 'implemented') p.status = 'implemented';
      }
      commit.status = 'implemented';
    }
  }
  return moved;
}

export function getByStatus(status: PatchStatus): Patch[] {
  const result: Patch[] = [];
  // Draft patches
  for (const p of draftPatches) {
    if (p.status === status) result.push(p);
  }
  // Commit patches
  for (const commit of commits) {
    for (const p of commit.patches) {
      if (p.status === status) result.push(p);
    }
  }
  return result;
}

export function getCounts(): { staged: number; committed: number; implementing: number; implemented: number } {
  const counts = { staged: 0, committed: 0, implementing: 0, implemented: 0 };
  for (const p of draftPatches) {
    if (p.status in counts) counts[p.status as keyof typeof counts]++;
  }
  for (const commit of commits) {
    for (const p of commit.patches) {
      if (p.status in counts) counts[p.status as keyof typeof counts]++;
    }
  }
  return counts;
}

/** Build the full QUEUE_UPDATE payload */
export function getQueueUpdate() {
  // Count commits by status
  let committedCount = 0;
  let implementingCount = 0;
  let implementedCount = 0;
  let partialCount = 0;
  let errorCount = 0;
  for (const c of commits) {
    switch (c.status) {
      case 'committed': committedCount++; break;
      case 'implementing': implementingCount++; break;
      case 'implemented': implementedCount++; break;
      case 'partial': partialCount++; break;
      case 'error': errorCount++; break;
    }
  }

  return {
    draftCount: draftPatches.length,
    committedCount,
    implementingCount,
    implementedCount,
    partialCount,
    errorCount,
    draft: draftPatches.map(toSummary),
    commits: commits.map(toCommitSummary),
    agentWaiting: emitter.listenerCount('committed') > 0,
  };
}

/** @deprecated Use getQueueUpdate instead. Backward compat shim. */
export function getPatchUpdate() {
  const allPatches: Patch[] = [...draftPatches];
  for (const c of commits) allPatches.push(...c.patches);
  const counts = getCounts();
  return {
    ...counts,
    patches: {
      staged: allPatches.filter(p => p.status === 'staged').map(toSummary),
      committed: allPatches.filter(p => p.status === 'committed').map(toSummary),
      implementing: allPatches.filter(p => p.status === 'implementing').map(toSummary),
      implemented: allPatches.filter(p => p.status === 'implemented').map(toSummary),
    },
  };
}

export function discardDraftPatch(id: string): boolean {
  // Remove ALL patches with this ID (guards against any duplicates that
  // slipped through addPatch before the ID-dedup was in place).
  const before = draftPatches.length;
  const remaining = draftPatches.filter(p => p.id !== id);
  draftPatches.length = 0;
  draftPatches.push(...remaining);
  return remaining.length < before;
}

export function clearAll(): { staged: number; committed: number; implementing: number; implemented: number } {
  const counts = getCounts();
  draftPatches.length = 0;
  commits.length = 0;
  return counts;
}

/** Subscribe to commit events. Returns an unsubscribe function. */
export function onCommitted(listener: () => void): () => void {
  emitter.on('committed', listener);
  return () => { emitter.off('committed', listener); };
}
