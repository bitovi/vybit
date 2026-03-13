// In-memory change queue

export interface ChangePayload {
  id: number;
  timestamp: string;
  component: { name: string };
  target: { tag: string; classes: string; innerText: string };
  change: { property: string; old: string; new: string };
  context: string;
}

let nextId = 1;
const pending: ChangePayload[] = [];

export function addChange(
  change: Omit<ChangePayload, "id" | "timestamp">,
): ChangePayload {
  const entry: ChangePayload = {
    id: nextId++,
    timestamp: new Date().toISOString(),
    ...change,
  };
  pending.push(entry);
  return entry;
}

export function getChanges(): ChangePayload[] {
  return pending.slice();
}

export function markApplied(ids: number[]): number {
  const idSet = new Set(ids);
  let removed = 0;
  for (let i = pending.length - 1; i >= 0; i--) {
    if (idSet.has(pending[i].id)) {
      pending.splice(i, 1);
      removed++;
    }
  }
  return removed;
}

export function clearAll(): number {
  const count = pending.length;
  pending.length = 0;
  return count;
}
