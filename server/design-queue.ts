// In-memory design request queue

import { EventEmitter } from 'node:events';
import type { InsertMode } from '../shared/types.js';

export interface DesignRequest {
  id: number;
  timestamp: string;
  image: string;
  componentName: string;
  target: {
    tag: string;
    classes: string;
    innerText: string;
  };
  context: string;
  insertMode: InsertMode;
  canvasWidth: number;
  canvasHeight: number;
  applied: boolean;
}

const emitter = new EventEmitter();
const designRequests: DesignRequest[] = [];
let nextId = 1;

export function addDesignRequest(
  payload: Omit<DesignRequest, 'id' | 'timestamp' | 'applied'>
): DesignRequest {
  const request: DesignRequest = {
    ...payload,
    id: nextId++,
    timestamp: new Date().toISOString(),
    applied: false,
  };
  designRequests.push(request);
  emitter.emit('design-submitted');
  return request;
}

export function getDesignRequests(): DesignRequest[] {
  return designRequests.filter(r => !r.applied);
}

export function markDesignApplied(ids: number[]): number {
  const idSet = new Set(ids);
  let count = 0;
  for (const req of designRequests) {
    if (idSet.has(req.id) && !req.applied) {
      req.applied = true;
      count++;
    }
  }
  return count;
}

export function clearDesignRequests(): number {
  const count = designRequests.length;
  designRequests.length = 0;
  return count;
}

export function onDesignSubmitted(listener: () => void): () => void {
  emitter.on('design-submitted', listener);
  return () => { emitter.off('design-submitted', listener); };
}
