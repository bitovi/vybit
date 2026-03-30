import type { RecordingSnapshot, SnapshotTrigger, SnapshotMeta, NavigationInfo, DomChange } from '../../../shared/types';
import { createConsoleInterceptor } from './console-interceptor';
import type { ConsoleInterceptorHandle } from './console-interceptor';
import { createNetworkInterceptor } from './network-interceptor';
import type { NetworkInterceptorHandle } from './network-interceptor';
import { createNavigationInterceptor } from './navigation-interceptor';
import { DomDiffer } from './dom-differ';
import { SnapshotStore } from './snapshot-store';
import { createEventCapture } from './event-capture';
import type { EventCaptureHandle } from './event-capture';

export interface RecordingEngineOptions {
  /** VyBit server origin, used to filter network requests */
  serverOrigin?: string;
  /** Callback when a new snapshot meta is available (for live push to panel) */
  onNewSnapshot?: (meta: SnapshotMeta) => void;
  /** Return true to suppress recording a click (e.g. during select/insert/pick mode) */
  isClickSuppressed?: () => boolean;
}

/**
 * Orchestrates all recording subsystems.
 * Call startRecording() once on overlay init. The engine runs silently
 * in the background regardless of which panel mode is active.
 */
export class RecordingEngine {
  private consoleHandle: ConsoleInterceptorHandle | null = null;
  private networkHandle: NetworkInterceptorHandle | null = null;
  private navigationTeardown: (() => void) | null = null;
  private eventCaptureHandle: EventCaptureHandle | null = null;
  private domDiffer: DomDiffer;
  private snapshotStore: SnapshotStore;
  private options: RecordingEngineOptions;
  private running = false;

  constructor(options: RecordingEngineOptions = {}) {
    this.options = options;
    this.domDiffer = new DomDiffer();
    this.snapshotStore = new SnapshotStore();
  }

  async startRecording(): Promise<void> {
    if (this.running) return;
    this.running = true;

    await this.snapshotStore.open();

    // Check if resuming (existing snapshots in IndexedDB)
    const existing = await this.snapshotStore.getAllSnapshots();
    if (existing.length > 0) {
      for (let i = existing.length - 1; i >= 0; i--) {
        if (existing[i].isKeyframe && existing[i].domSnapshot) {
          this.domDiffer.setBaseline(existing[i].domSnapshot!);
          break;
        }
      }
    }

    // Start all interceptors — each returns a teardown handle
    this.consoleHandle = createConsoleInterceptor();
    this.networkHandle = createNetworkInterceptor({ serverOrigin: this.options.serverOrigin });
    this.navigationTeardown = createNavigationInterceptor((info: NavigationInfo) => {
      this.handleNavigation(info);
    });
    this.eventCaptureHandle = createEventCapture((trigger: SnapshotTrigger, elementInfo?, domChanges?) => {
      this.captureSnapshot(trigger, elementInfo, domChanges);
    }, { isClickSuppressed: this.options.isClickSuppressed });

    // Capture initial page-load keyframe
    await this.captureSnapshot('page-load');
  }

  async stopRecording(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    this.eventCaptureHandle?.teardown();
    this.eventCaptureHandle = null;

    this.navigationTeardown?.();
    this.navigationTeardown = null;

    this.networkHandle?.teardown();
    this.networkHandle = null;

    this.consoleHandle?.teardown();
    this.consoleHandle = null;

    await this.snapshotStore.close();
  }

  /** Get all snapshot metadata (lightweight, for timeline). */
  async getHistory(): Promise<SnapshotMeta[]> {
    return this.snapshotStore.getSnapshotMetas();
  }

  /** Get a single full snapshot by ID. */
  async getSnapshot(id: number): Promise<RecordingSnapshot | undefined> {
    return this.snapshotStore.getSnapshot(id);
  }

  /** Get full snapshots for a range of IDs (with DOM reconstructed). */
  async getRange(startId: number, endId: number): Promise<RecordingSnapshot[]> {
    return this.snapshotStore.getRange(startId, endId);
  }

  private async captureSnapshot(
    trigger: SnapshotTrigger,
    elementInfo?: { tag: string; classes: string; id?: string; innerText?: string },
    domChanges?: DomChange[],
  ): Promise<void> {
    if (!this.running) return;

    const forceKeyframe = trigger === 'page-load' || trigger === 'navigation';
    const currentDom = document.documentElement.outerHTML;
    const diffResult = this.domDiffer.computeDiff(currentDom, forceKeyframe);

    // Flush interceptor buffers
    const consoleLogs = this.consoleHandle?.flush() ?? [];
    const networkErrors = this.networkHandle?.flush() ?? [];

    const snapshot: RecordingSnapshot = {
      timestamp: new Date().toISOString(),
      trigger,
      isKeyframe: diffResult.isKeyframe,
      domSnapshot: diffResult.isKeyframe ? diffResult.fullDom : undefined,
      domDiff: !diffResult.isKeyframe ? diffResult.diff : undefined,
      domChanges: domChanges?.length ? domChanges : undefined,
      consoleLogs,
      networkErrors,
      url: window.location.href,
      scrollPosition: { x: window.scrollX, y: window.scrollY },
      viewportSize: { width: window.innerWidth, height: window.innerHeight },
      elementInfo,
    };

    const id = await this.snapshotStore.addSnapshot(snapshot);

    if (this.options.onNewSnapshot) {
      this.options.onNewSnapshot({
        id,
        timestamp: snapshot.timestamp,
        trigger: snapshot.trigger,
        isKeyframe: snapshot.isKeyframe,
        thumbnail: snapshot.thumbnail,
        elementInfo: snapshot.elementInfo,
        consoleErrorCount: consoleLogs.filter(l => l.level === 'error').length,
        networkErrorCount: networkErrors.length,
        url: snapshot.url,
      });
    }
  }

  private async handleNavigation(info: NavigationInfo): Promise<void> {
    if (!this.running) return;

    // Suppress the subsequent MutationObserver callback (DOM changes from route render)
    this.eventCaptureHandle?.suppressNext();

    const forceKeyframe = true;
    const currentDom = document.documentElement.outerHTML;
    const diffResult = this.domDiffer.computeDiff(currentDom, forceKeyframe);

    const consoleLogs = this.consoleHandle?.flush() ?? [];
    const networkErrors = this.networkHandle?.flush() ?? [];

    const snapshot: RecordingSnapshot = {
      timestamp: new Date().toISOString(),
      trigger: 'navigation',
      isKeyframe: true,
      domSnapshot: diffResult.fullDom,
      consoleLogs,
      networkErrors,
      url: window.location.href,
      scrollPosition: { x: window.scrollX, y: window.scrollY },
      viewportSize: { width: window.innerWidth, height: window.innerHeight },
      navigationInfo: info,
    };

    const id = await this.snapshotStore.addSnapshot(snapshot);

    if (this.options.onNewSnapshot) {
      this.options.onNewSnapshot({
        id,
        timestamp: snapshot.timestamp,
        trigger: 'navigation',
        isKeyframe: true,
        elementInfo: undefined,
        consoleErrorCount: consoleLogs.filter(l => l.level === 'error').length,
        networkErrorCount: networkErrors.length,
        url: snapshot.url,
      });
    }
  }
}
