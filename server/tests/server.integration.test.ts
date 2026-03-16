import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server } from 'http';
import { WebSocket } from 'ws';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { createApp } from '../app.js';
import { setupWebSocket } from '../websocket.js';
import { registerMcpTools } from '../mcp-tools.js';
import {
  clearAll,
  getByStatus,
  getCounts,
  getNextCommitted,
  markCommitImplementing,
  markCommitImplemented,
  markImplementing,
  markImplemented,
  onCommitted,
  getQueueUpdate,
} from '../queue.js';

import type { Patch } from '../../shared/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePatch(overrides: Partial<Patch> = {}): Patch {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    kind: 'class-change',
    elementKey: 'TestComponent::0/1',
    status: 'staged',
    originalClass: 'px-4',
    newClass: 'px-8',
    property: 'px',
    timestamp: new Date().toISOString(),
    component: { name: 'TestComponent' },
    target: { tag: 'button', classes: 'px-4 py-2 bg-blue-500', innerText: 'Click me' },
    context: '<button class="px-4 py-2 bg-blue-500">Click me</button>',
    ...overrides,
  };
}

/** Wait for the panel WS client to receive a message matching a predicate. */
function waitForPanelMessage(
  messages: any[],
  predicate: (msg: any) => boolean,
  timeoutMs = 5000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    // Check existing messages first
    const existing = messages.find(predicate);
    if (existing) { resolve(existing); return; }

    const startLen = messages.length;
    const interval = setInterval(() => {
      for (let i = startLen; i < messages.length; i++) {
        if (predicate(messages[i])) {
          clearInterval(interval);
          clearTimeout(timer);
          resolve(messages[i]);
          return;
        }
      }
    }, 50);
    const timer = setTimeout(() => {
      clearInterval(interval);
      reject(new Error(`Timed out waiting for panel message. Got ${messages.length} messages: ${JSON.stringify(messages.map(m => m.type))}`));
    }, timeoutMs);
  });
}

function connectWs(port: number, role: 'overlay' | 'panel' | 'design'): Promise<{ ws: WebSocket; messages: any[] }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    const messages: any[] = [];
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'REGISTER', role }));
      // Small delay to let registration complete
      setTimeout(() => resolve({ ws, messages }), 100);
    });
    ws.on('message', (raw) => {
      messages.push(JSON.parse(String(raw)));
    });
    ws.on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

describe('Server integration tests', () => {
  let httpServer: Server;
  let port: number;
  let mcpServer: McpServer;
  let mcpClient: Client;
  let overlayWs: WebSocket;
  let overlayMessages: any[];
  let panelWs: WebSocket;
  let panelMessages: any[];

  beforeEach(async () => {
    // Reset queue state
    clearAll();

    // Set up HTTP + WS server on random port
    const packageRoot = new URL('../..', import.meta.url).pathname;
    const app = createApp(packageRoot);
    httpServer = createServer(app);
    const { broadcastPatchUpdate } = setupWebSocket(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => resolve());
    });
    const addr = httpServer.address();
    port = typeof addr === 'object' && addr ? addr.port : 0;

    // Set up MCP server + client via InMemoryTransport
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    mcpServer = new McpServer(
      { name: 'test-server', version: '0.1.0' },
      { capabilities: { tools: {} } },
    );
    registerMcpTools(mcpServer, {
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
    });
    await mcpServer.connect(serverTransport);

    mcpClient = new Client(
      { name: 'test-client', version: '0.1.0' },
      { capabilities: {} },
    );
    await mcpClient.connect(clientTransport);

    // Connect overlay + panel WS clients
    const overlay = await connectWs(port, 'overlay');
    overlayWs = overlay.ws;
    overlayMessages = overlay.messages;

    const panel = await connectWs(port, 'panel');
    panelWs = panel.ws;
    panelMessages = panel.messages;
  });

  afterEach(async () => {
    overlayWs?.close();
    panelWs?.close();
    await mcpClient?.close?.();
    await mcpServer?.close?.();
    await new Promise<void>((resolve, reject) => {
      httpServer?.close((err) => (err ? reject(err) : resolve()));
    });
    clearAll();
  });

  // -----------------------------------------------------------------------
  // a. Stage → WS notification
  // -----------------------------------------------------------------------
  it('PATCH_STAGED → panel receives QUEUE_UPDATE with draftCount: 1', async () => {
    const patch = makePatch();

    // Clear the initial QUEUE_UPDATE the panel got on registration
    panelMessages.length = 0;

    overlayWs.send(JSON.stringify({ type: 'PATCH_STAGED', patch }));

    const msg = await waitForPanelMessage(panelMessages, (m) =>
      m.type === 'QUEUE_UPDATE' && m.draftCount === 1,
    );
    expect(msg.draftCount).toBe(1);
    expect(msg.draft).toHaveLength(1);
    expect(msg.draft[0].id).toBe(patch.id);
  });

  // -----------------------------------------------------------------------
  // b. Commit → WS notification
  // -----------------------------------------------------------------------
  it('PATCH_COMMIT → panel receives QUEUE_UPDATE with committedCount: 1', async () => {
    const patch = makePatch();

    overlayWs.send(JSON.stringify({ type: 'PATCH_STAGED', patch }));
    await waitForPanelMessage(panelMessages, (m) => m.type === 'QUEUE_UPDATE' && m.draftCount === 1);

    panelMessages.length = 0;
    panelWs.send(JSON.stringify({ type: 'PATCH_COMMIT', ids: [patch.id] }));

    const msg = await waitForPanelMessage(panelMessages, (m) =>
      m.type === 'QUEUE_UPDATE' && m.committedCount === 1,
    );
    expect(msg.committedCount).toBe(1);
    expect(msg.commits).toHaveLength(1);
    expect(msg.commits[0].patches).toHaveLength(1);
    expect(msg.commits[0].patches[0].id).toBe(patch.id);
  });

  // -----------------------------------------------------------------------
  // c. GET /patches?status=committed
  // -----------------------------------------------------------------------
  it('GET /patches?status=committed returns the committed patch', async () => {
    const patch = makePatch();

    overlayWs.send(JSON.stringify({ type: 'PATCH_STAGED', patch }));
    await waitForPanelMessage(panelMessages, (m) => m.type === 'QUEUE_UPDATE' && m.draftCount === 1);

    panelWs.send(JSON.stringify({ type: 'PATCH_COMMIT', ids: [patch.id] }));
    await waitForPanelMessage(panelMessages, (m) => m.type === 'QUEUE_UPDATE' && m.committedCount === 1);

    const res = await fetch(`http://localhost:${port}/patches?status=committed`);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe(patch.id);
    expect(data[0].status).toBe('committed');
  });

  // -----------------------------------------------------------------------
  // d. get_next_change returns immediately when committed commit exists
  // -----------------------------------------------------------------------
  it('get_next_change returns committed commit as raw JSON (single content item)', async () => {
    const patch = makePatch();

    // Stage + commit
    overlayWs.send(JSON.stringify({ type: 'PATCH_STAGED', patch }));
    await waitForPanelMessage(panelMessages, (m) => m.type === 'QUEUE_UPDATE' && m.draftCount === 1);
    panelWs.send(JSON.stringify({ type: 'PATCH_COMMIT', ids: [patch.id] }));
    await waitForPanelMessage(panelMessages, (m) => m.type === 'QUEUE_UPDATE' && m.committedCount === 1);

    panelMessages.length = 0;

    const result = await mcpClient.callTool({ name: 'get_next_change' });

    // Single content item: raw commit JSON only
    expect(result.content).toHaveLength(1);

    const [commitContent] = result.content as any[];
    expect(commitContent.type).toBe('text');
    const commitData = JSON.parse(commitContent.text);
    expect(commitData.patches).toHaveLength(1);
    expect(commitData.patches[0].id).toBe(patch.id);

    // Panel should get QUEUE_UPDATE with implementingCount: 1
    const msg = await waitForPanelMessage(panelMessages, (m) =>
      m.type === 'QUEUE_UPDATE' && m.implementingCount === 1,
    );
    expect(msg.implementingCount).toBe(1);
  });

  // -----------------------------------------------------------------------
  // e. get_next_change waits then resolves
  // -----------------------------------------------------------------------
  it('get_next_change waits for commit then resolves', async () => {
    const patch = makePatch();

    // Start get_next_change BEFORE any patches exist — it should block
    const resultPromise = mcpClient.callTool({ name: 'get_next_change' });

    // Small delay, then stage + commit
    await new Promise((r) => setTimeout(r, 200));

    overlayWs.send(JSON.stringify({ type: 'PATCH_STAGED', patch }));
    await waitForPanelMessage(panelMessages, (m) => m.type === 'QUEUE_UPDATE' && m.draftCount === 1);

    panelWs.send(JSON.stringify({ type: 'PATCH_COMMIT', ids: [patch.id] }));

    // The get_next_change should now resolve
    const result = await resultPromise;
    expect(result.content).toHaveLength(1);

    const commitData = JSON.parse((result.content as any[])[0].text);
    expect(commitData.patches).toHaveLength(1);
    expect(commitData.patches[0].id).toBe(patch.id);
  });

  // -----------------------------------------------------------------------
  // e2. implement_next_change returns commit + loop instructions
  // -----------------------------------------------------------------------
  it('implement_next_change returns committed commit with loop instructions', async () => {
    const patch = makePatch();

    overlayWs.send(JSON.stringify({ type: 'PATCH_STAGED', patch }));
    await waitForPanelMessage(panelMessages, (m) => m.type === 'QUEUE_UPDATE' && m.draftCount === 1);
    panelWs.send(JSON.stringify({ type: 'PATCH_COMMIT', ids: [patch.id] }));
    await waitForPanelMessage(panelMessages, (m) => m.type === 'QUEUE_UPDATE' && m.committedCount === 1);

    panelMessages.length = 0;

    const result = await mcpClient.callTool({ name: 'implement_next_change' });

    // Two content items: structured JSON + markdown instructions
    expect(result.content).toHaveLength(2);

    const [jsonContent, mdContent] = result.content as any[];

    // First: structured data with isComplete + commit
    expect(jsonContent.type).toBe('text');
    const data = JSON.parse(jsonContent.text);
    expect(data.isComplete).toBe(false);
    expect(data.commit.patches).toHaveLength(1);
    expect(data.commit.patches[0].id).toBe(patch.id);
    expect(data.nextAction).toContain('implement_next_change');

    // Second: markdown instructions
    expect(mdContent.type).toBe('text');
    expect(mdContent.text).toContain('implement_next_change');
    expect(mdContent.text).toContain('mark_change_implemented');
    expect(mdContent.text).toContain(patch.originalClass);
    expect(mdContent.text).toContain(patch.newClass);
  });

  // -----------------------------------------------------------------------
  // e3. implement_next_change waits then resolves
  // -----------------------------------------------------------------------
  it('implement_next_change waits for commit then resolves', async () => {
    const patch = makePatch();

    const resultPromise = mcpClient.callTool({ name: 'implement_next_change' });

    await new Promise((r) => setTimeout(r, 200));

    overlayWs.send(JSON.stringify({ type: 'PATCH_STAGED', patch }));
    await waitForPanelMessage(panelMessages, (m) => m.type === 'QUEUE_UPDATE' && m.draftCount === 1);
    panelWs.send(JSON.stringify({ type: 'PATCH_COMMIT', ids: [patch.id] }));

    const result = await resultPromise;
    expect(result.content).toHaveLength(2);
    const resultData = JSON.parse((result.content as any[])[0].text);
    expect(resultData.commit.patches[0].id).toBe(patch.id);
  });

  // -----------------------------------------------------------------------
  // f. GET /patches?status=implementing
  // -----------------------------------------------------------------------
  it('GET /patches?status=implementing returns the patch after get_next_change', async () => {
    const patch = makePatch();

    overlayWs.send(JSON.stringify({ type: 'PATCH_STAGED', patch }));
    await waitForPanelMessage(panelMessages, (m) => m.type === 'QUEUE_UPDATE' && m.draftCount === 1);
    panelWs.send(JSON.stringify({ type: 'PATCH_COMMIT', ids: [patch.id] }));
    await waitForPanelMessage(panelMessages, (m) => m.type === 'QUEUE_UPDATE' && m.committedCount === 1);

    await mcpClient.callTool({ name: 'get_next_change' });

    const res = await fetch(`http://localhost:${port}/patches?status=implementing`);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe(patch.id);
    expect(data[0].status).toBe('implementing');
  });

  // -----------------------------------------------------------------------
  // g. mark_change_implemented (legacy ids)
  // -----------------------------------------------------------------------
  it('mark_change_implemented → panel receives QUEUE_UPDATE with implementedCount: 1', async () => {
    const patch = makePatch();

    overlayWs.send(JSON.stringify({ type: 'PATCH_STAGED', patch }));
    await waitForPanelMessage(panelMessages, (m) => m.type === 'QUEUE_UPDATE' && m.draftCount === 1);
    panelWs.send(JSON.stringify({ type: 'PATCH_COMMIT', ids: [patch.id] }));
    await waitForPanelMessage(panelMessages, (m) => m.type === 'QUEUE_UPDATE' && m.committedCount === 1);

    await mcpClient.callTool({ name: 'get_next_change' });
    await waitForPanelMessage(panelMessages, (m) => m.type === 'QUEUE_UPDATE' && m.implementingCount === 1);

    panelMessages.length = 0;

    const result = await mcpClient.callTool({
      name: 'mark_change_implemented',
      arguments: { ids: [patch.id] },
    });
    // Two content items: structured JSON + loop directive text
    expect(result.content).toHaveLength(2);
    const resultData = JSON.parse((result.content as any[])[0].text);
    expect(resultData.moved).toBe(1);
    expect(resultData.isComplete).toBe(false);
    expect(resultData.nextAction).toContain('implement_next_change');

    // Loop directive text should tell agent to call implement_next_change
    const loopText = (result.content as any[])[1].text;
    expect(loopText).toContain('implement_next_change');

    const msg = await waitForPanelMessage(panelMessages, (m) =>
      m.type === 'QUEUE_UPDATE' && m.implementedCount === 1,
    );
    expect(msg.implementedCount).toBe(1);
  });

  // -----------------------------------------------------------------------
  // h. GET /patches?status=implemented
  // -----------------------------------------------------------------------
  it('GET /patches?status=implemented returns the implemented patch', async () => {
    const patch = makePatch();

    overlayWs.send(JSON.stringify({ type: 'PATCH_STAGED', patch }));
    await waitForPanelMessage(panelMessages, (m) => m.type === 'QUEUE_UPDATE' && m.draftCount === 1);
    panelWs.send(JSON.stringify({ type: 'PATCH_COMMIT', ids: [patch.id] }));
    await waitForPanelMessage(panelMessages, (m) => m.type === 'QUEUE_UPDATE' && m.committedCount === 1);
    await mcpClient.callTool({ name: 'get_next_change' });
    await waitForPanelMessage(panelMessages, (m) => m.type === 'QUEUE_UPDATE' && m.implementingCount === 1);
    await mcpClient.callTool({ name: 'mark_change_implemented', arguments: { ids: [patch.id] } });

    const res = await fetch(`http://localhost:${port}/patches?status=implemented`);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe(patch.id);
    expect(data[0].status).toBe('implemented');
  });

  // -----------------------------------------------------------------------
  // i. list_changes with status filter
  // -----------------------------------------------------------------------
  it('list_changes with status filter returns matching patches', async () => {
    const patch = makePatch();

    overlayWs.send(JSON.stringify({ type: 'PATCH_STAGED', patch }));
    await waitForPanelMessage(panelMessages, (m) => m.type === 'QUEUE_UPDATE' && m.draftCount === 1);
    panelWs.send(JSON.stringify({ type: 'PATCH_COMMIT', ids: [patch.id] }));
    await waitForPanelMessage(panelMessages, (m) => m.type === 'QUEUE_UPDATE' && m.committedCount === 1);
    await mcpClient.callTool({ name: 'implement_next_change' });
    await mcpClient.callTool({ name: 'mark_change_implemented', arguments: { ids: [patch.id] } });

    const result = await mcpClient.callTool({
      name: 'list_changes',
      arguments: { status: 'implemented' },
    });
    const data = JSON.parse((result.content as any[])[0].text);
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe(patch.id);
    expect(data[0].status).toBe('implemented');
  });

  // -----------------------------------------------------------------------
  // j. list_changes without filter returns queue state
  // -----------------------------------------------------------------------
  it('list_changes without filter returns queue state', async () => {
    const patch = makePatch();

    overlayWs.send(JSON.stringify({ type: 'PATCH_STAGED', patch }));
    await waitForPanelMessage(panelMessages, (m) => m.type === 'QUEUE_UPDATE' && m.draftCount === 1);

    const result = await mcpClient.callTool({
      name: 'list_changes',
      arguments: {},
    });
    const data = JSON.parse((result.content as any[])[0].text);
    expect(data.draftCount).toBe(1);
    expect(data.draft).toHaveLength(1);
    expect(data.draft[0].id).toBe(patch.id);
  });

  // -----------------------------------------------------------------------
  // k. discard_all_changes
  // -----------------------------------------------------------------------
  it('discard_all_changes clears everything and notifies panel', async () => {
    const patch = makePatch();

    overlayWs.send(JSON.stringify({ type: 'PATCH_STAGED', patch }));
    await waitForPanelMessage(panelMessages, (m) => m.type === 'QUEUE_UPDATE' && m.draftCount === 1);

    panelMessages.length = 0;

    const result = await mcpClient.callTool({ name: 'discard_all_changes' });
    const counts = JSON.parse((result.content as any[])[0].text);
    expect(counts.staged).toBe(1);

    const msg = await waitForPanelMessage(panelMessages, (m) =>
      m.type === 'QUEUE_UPDATE' && m.draftCount === 0 && m.committedCount === 0,
    );
    expect(msg.draftCount).toBe(0);
    expect(msg.committedCount).toBe(0);
    expect(msg.implementingCount).toBe(0);
    expect(msg.implementedCount).toBe(0);
  });

  // -----------------------------------------------------------------------
  // l. MESSAGE_STAGE → message patch in draft
  // -----------------------------------------------------------------------
  it('MESSAGE_STAGE → panel receives QUEUE_UPDATE with message in draft', async () => {
    panelMessages.length = 0;

    panelWs.send(JSON.stringify({
      type: 'MESSAGE_STAGE',
      id: 'msg-1',
      message: 'Make description more readable',
      elementKey: 'Card',
    }));

    const msg = await waitForPanelMessage(panelMessages, (m) =>
      m.type === 'QUEUE_UPDATE' && m.draftCount === 1,
    );
    expect(msg.draftCount).toBe(1);
    expect(msg.draft).toHaveLength(1);
    expect(msg.draft[0].kind).toBe('message');
    expect(msg.draft[0].message).toBe('Make description more readable');
  });

  // -----------------------------------------------------------------------
  // m. Mixed class-change + message commit
  // -----------------------------------------------------------------------
  it('commit with class-change + message preserves order', async () => {
    const patch = makePatch();

    overlayWs.send(JSON.stringify({ type: 'PATCH_STAGED', patch }));
    await waitForPanelMessage(panelMessages, (m) => m.type === 'QUEUE_UPDATE' && m.draftCount === 1);

    panelWs.send(JSON.stringify({
      type: 'MESSAGE_STAGE',
      id: 'msg-1',
      message: 'Explain this change',
      elementKey: 'Card',
    }));
    await waitForPanelMessage(panelMessages, (m) => m.type === 'QUEUE_UPDATE' && m.draftCount === 2);

    panelMessages.length = 0;
    panelWs.send(JSON.stringify({ type: 'PATCH_COMMIT', ids: [patch.id, 'msg-1'] }));

    const msg = await waitForPanelMessage(panelMessages, (m) =>
      m.type === 'QUEUE_UPDATE' && m.committedCount === 1,
    );
    expect(msg.commits).toHaveLength(1);
    expect(msg.commits[0].patches).toHaveLength(2);
    expect(msg.commits[0].patches[0].kind).toBe('class-change');
    expect(msg.commits[0].patches[1].kind).toBe('message');
  });

  // -----------------------------------------------------------------------
  // n. mark_change_implemented with commitId + results
  // -----------------------------------------------------------------------
  it('mark_change_implemented with commitId and per-patch results', async () => {
    const patch = makePatch();

    overlayWs.send(JSON.stringify({ type: 'PATCH_STAGED', patch }));
    await waitForPanelMessage(panelMessages, (m) => m.type === 'QUEUE_UPDATE' && m.draftCount === 1);
    panelWs.send(JSON.stringify({ type: 'PATCH_COMMIT', ids: [patch.id] }));
    await waitForPanelMessage(panelMessages, (m) => m.type === 'QUEUE_UPDATE' && m.committedCount === 1);

    const implResult = await mcpClient.callTool({ name: 'implement_next_change' });
    const implData = JSON.parse((implResult.content as any[])[0].text);
    const commitId = implData.commit.id;

    panelMessages.length = 0;

    const result = await mcpClient.callTool({
      name: 'mark_change_implemented',
      arguments: {
        commitId,
        results: [{ patchId: patch.id, success: true }],
      },
    });
    expect(result.content).toHaveLength(2);
    const resultData = JSON.parse((result.content as any[])[0].text);
    expect(resultData.moved).toBe(1);

    const msg = await waitForPanelMessage(panelMessages, (m) =>
      m.type === 'QUEUE_UPDATE' && m.implementedCount === 1,
    );
    expect(msg.implementedCount).toBe(1);
  });

  // -----------------------------------------------------------------------
  // o. DESIGN_SUBMIT → design patch in draft with image
  // -----------------------------------------------------------------------
  it('DESIGN_SUBMIT → panel receives QUEUE_UPDATE with design patch including image', async () => {
    const designWsConn = await connectWs(port, 'design');
    const designWs = designWsConn.ws;

    // A small 1x1 red PNG as a data URL
    const testImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

    panelMessages.length = 0;

    designWs.send(JSON.stringify({
      type: 'DESIGN_SUBMIT',
      image: testImage,
      componentName: 'Hero',
      target: { tag: 'div', classes: 'flex items-center', innerText: 'Hello' },
      context: '<div class="flex items-center">Hello</div>',
      insertMode: 'before',
      canvasWidth: 400,
      canvasHeight: 300,
    }));

    const msg = await waitForPanelMessage(panelMessages, (m) =>
      m.type === 'QUEUE_UPDATE' && m.draftCount === 1,
    );
    expect(msg.draftCount).toBe(1);
    expect(msg.draft).toHaveLength(1);
    expect(msg.draft[0].kind).toBe('design');
    expect(msg.draft[0].image).toBe(testImage);
    expect(msg.draft[0].component?.name).toBe('Hero');

    designWs.close();
  });

  // -----------------------------------------------------------------------
  // p. DESIGN_SUBMIT → overlay receives DESIGN_SUBMITTED with image
  // -----------------------------------------------------------------------
  it('DESIGN_SUBMIT → overlay receives DESIGN_SUBMITTED echo', async () => {
    const designWsConn = await connectWs(port, 'design');
    const designWs = designWsConn.ws;

    const testImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

    overlayMessages.length = 0;

    designWs.send(JSON.stringify({
      type: 'DESIGN_SUBMIT',
      image: testImage,
      componentName: 'Card',
      target: { tag: 'section', classes: 'p-4', innerText: 'Content' },
      context: '<section class="p-4">Content</section>',
      insertMode: 'after',
      canvasWidth: 600,
      canvasHeight: 400,
    }));

    const msg = await waitForPanelMessage(overlayMessages, (m) =>
      m.type === 'DESIGN_SUBMITTED',
    );
    expect(msg.type).toBe('DESIGN_SUBMITTED');
    expect(msg.image).toBe(testImage);

    designWs.close();
  });

  // -----------------------------------------------------------------------
  // q. Design patch full lifecycle: stage → commit → implement
  // -----------------------------------------------------------------------
  it('design patch flows through commit → implement_next_change → mark_change_implemented', async () => {
    const designWsConn = await connectWs(port, 'design');
    const designWs = designWsConn.ws;

    const testImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

    panelMessages.length = 0;

    designWs.send(JSON.stringify({
      type: 'DESIGN_SUBMIT',
      image: testImage,
      componentName: 'Nav',
      target: { tag: 'nav', classes: 'flex', innerText: 'Menu' },
      context: '<nav class="flex">Menu</nav>',
      insertMode: 'first-child',
      canvasWidth: 500,
      canvasHeight: 350,
    }));

    // Wait for draft
    const draftMsg = await waitForPanelMessage(panelMessages, (m) =>
      m.type === 'QUEUE_UPDATE' && m.draftCount === 1,
    );
    const designPatchId = draftMsg.draft[0].id;

    // Commit the design patch
    panelMessages.length = 0;
    panelWs.send(JSON.stringify({ type: 'PATCH_COMMIT', ids: [designPatchId] }));
    await waitForPanelMessage(panelMessages, (m) =>
      m.type === 'QUEUE_UPDATE' && m.committedCount === 1,
    );

    // implement_next_change should return the design commit with image
    panelMessages.length = 0;
    const implResult = await mcpClient.callTool({ name: 'implement_next_change' });
    const implData = JSON.parse((implResult.content as any[])[0].text);
    expect(implData.commit.patches).toHaveLength(1);
    expect(implData.commit.patches[0].kind).toBe('design');
    expect(implData.commit.patches[0].image).toBe(testImage);

    // Mark implemented
    panelMessages.length = 0;
    await mcpClient.callTool({
      name: 'mark_change_implemented',
      arguments: { commitId: implData.commit.id, results: [{ patchId: designPatchId, success: true }] },
    });

    const finalMsg = await waitForPanelMessage(panelMessages, (m) =>
      m.type === 'QUEUE_UPDATE' && m.implementedCount === 1,
    );
    expect(finalMsg.implementedCount).toBe(1);

    designWs.close();
  });
});
