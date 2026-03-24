// Shared types for the PATCH protocol.
// Imported by overlay (esbuild), panel (Vite), and server (tsx).

/** Cached ghost HTML + host styles for instant component preview placeholders. */
export interface GhostCacheEntry {
  storyId: string;
  argsHash: string;
  ghostHtml: string;
  hostStyles: Record<string, string>;
  storyBackground?: string;
  componentName: string;
  componentPath?: string;
  extractedAt: number;
}

export type ContainerName = 'modal' | 'popover' | 'sidebar' | 'popup';

/** A component placed on the Fabric.js design canvas */
export interface CanvasComponent {
  componentName: string;
  componentPath?: string;       // e.g. './src/components/Button.tsx'
  storyId?: string;
  args?: Record<string, unknown>;
  // Position/size on the canvas (px, relative to canvas top-left)
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PatchKind = 'class-change' | 'message' | 'design' | 'component-drop' | 'text-change';

export type PatchStatus = 'staged' | 'committed' | 'implementing' | 'implemented' | 'error';

export interface Patch {
  id: string;               // UUID
  kind: PatchKind;          // discriminator
  elementKey: string;        // stable identifier (empty string for general messages)
  status: PatchStatus;
  // Class-change fields (used when kind === 'class-change'):
  originalClass: string;     // classToken before edit ('' if adding new)
  newClass: string;          // classToken after edit
  property: string;          // prefix of the change
  timestamp: string;         // ISO 8601
  // Populated at stage time by the overlay (has DOM access):
  pageUrl?: string;          // URL of the inspected page
  component?: { name: string; instanceCount?: number };
  target?: { tag: string; classes: string; innerText: string };
  context?: string;
  errorMessage?: string;
  // Message field (used when kind === 'message'):
  message?: string;          // free-form text
  // Design fields (used when kind === 'design'):
  image?: string;            // data URL of the canvas snapshot
  insertMode?: string;       // before | after | first-child | last-child
  canvasWidth?: number;
  canvasHeight?: number;
  canvasComponents?: CanvasComponent[]; // Components placed on the design canvas
  // Component-drop fields (used when kind === 'component-drop'):
  ghostHtml?: string;        // HTML of the dropped component (overlay preview only — stripped from MCP response)
  componentStoryId?: string; // Storybook story ID
  componentPath?: string;    // Source file of the component, e.g. './src/components/Button.tsx'
  componentArgs?: Record<string, unknown>; // Props the user configured before dropping
  parentComponent?: { name: string }; // React component that contains the drop target
  targetPatchId?: string;    // If target is a ghost from an earlier drop, references that patch
  targetComponentName?: string; // Name of the ghost component being referenced
  // Text-change fields (used when kind === 'text-change'):
  originalText?: string;     // text before edit
  newText?: string;          // text after edit
  // Commit reference:
  commitId?: string;         // Set when committed into a Commit
}

export type CommitStatus = 'staged' | 'committed' | 'implementing' | 'implemented' | 'partial' | 'error';

export interface Commit {
  id: string;               // UUID
  patches: Patch[];         // Ordered: class-changes AND messages interleaved
  status: CommitStatus;
  timestamp: string;        // ISO 8601 — set when committed
}

/** Lightweight patch info for UI display (omits context/target for smaller WS payloads) */
export interface PatchSummary {
  id: string;
  kind: PatchKind;
  elementKey: string;
  status: PatchStatus;
  originalClass: string;
  newClass: string;
  property: string;
  timestamp: string;
  component?: { name: string; instanceCount?: number };
  errorMessage?: string;
  message?: string;
  image?: string;
  canvasComponents?: CanvasComponent[];
  // Component-drop display fields:
  insertMode?: string;
  parentComponent?: { name: string };
  targetComponentName?: string;
  targetPatchId?: string;
  // Text-change display fields:
  originalText?: string;
  newText?: string;
}

export interface CommitSummary {
  id: string;
  status: CommitStatus;
  timestamp: string;
  patches: PatchSummary[];  // ordered — class-changes and messages interleaved
}

// ---------------------------------------------------------------------------
// WebSocket messages
// ---------------------------------------------------------------------------

// Kept unchanged
export interface RegisterMessage {
  type: 'REGISTER';
  role: 'overlay' | 'panel';
}

export interface ElementSelectedMessage {
  type: 'ELEMENT_SELECTED';
  to: 'panel';
  componentName: string;
  instanceCount: number;
  classes: string;
  tailwindConfig: any;
  /** Direct text content of the element (text nodes only, no child element text) */
  textContent?: string;
  /** True when the element contains only text nodes (no child elements), safe for contentEditable */
  hasEditableText?: boolean;
}

export interface ClearHighlightsMessage {
  type: 'CLEAR_HIGHLIGHTS';
  to: 'overlay';
  /** When true, also clears the selected element context (currentTargetEl, currentBoundary, etc). */
  deselect?: boolean;
}

export interface SwitchContainerMessage {
  type: 'SWITCH_CONTAINER';
  to: 'overlay';
  container: ContainerName;
}

export interface PingMessage {
  type: 'PING';
}

export interface PongMessage {
  type: 'PONG';
}

// New PATCH_* messages

/** Panel → Overlay: live-preview a class swap */
export interface PatchPreviewMessage {
  type: 'PATCH_PREVIEW';
  to: 'overlay';
  oldClass: string;
  newClass: string;
}

/** Panel → Overlay: live-preview multiple class swaps atomically */
export interface PatchPreviewBatchMessage {
  type: 'PATCH_PREVIEW_BATCH';
  to: 'overlay';
  pairs: Array<{ oldClass: string; newClass: string }>;
}

/** Panel → Overlay: revert any active preview */
export interface PatchRevertMessage {
  type: 'PATCH_REVERT';
  to: 'overlay';
}

/**
 * Panel → Overlay: undo a previously staged class change.
 * Applies oldClass → newClass to the DOM and commits it as the new baseline,
 * WITHOUT sending anything to the server.
 * Use when the user stages back to the original value, removing a draft patch.
 */
export interface PatchRevertStagedMessage {
  type: 'PATCH_REVERT_STAGED';
  to: 'overlay';
  oldClass: string; // currently in the DOM (the staged newClass)
  newClass: string; // what to restore to (the original class)
}

/** Panel → Overlay: stage a change (overlay fills context, sends PATCH_STAGED to server) */
export interface PatchStageMessage {
  type: 'PATCH_STAGE';
  to: 'overlay';
  id: string;
  oldClass: string;
  newClass: string;
  property: string;
}

/** Overlay → Server: patch with full context, added to server queue */
export interface PatchStagedMessage {
  type: 'PATCH_STAGED';
  patch: Patch;
}

/** Panel → Server: move staged patches to committed status */
export interface PatchCommitMessage {
  type: 'PATCH_COMMIT';
  ids: string[];            // includes both class-change AND message patch IDs
}

/** Panel → Server: stage a message patch */
export interface MessageStageMessage {
  type: 'MESSAGE_STAGE';
  id: string;               // UUID (generated by panel)
  message: string;          // the user's text
  elementKey?: string;      // optional — current element, or empty for general context
  component?: { name: string; instanceCount?: number };
}

/** Server → Panel/Overlay: broadcast full queue state */
export interface QueueUpdateMessage {
  type: 'QUEUE_UPDATE';
  // Counts for the footer pills
  draftCount: number;       // patches in the draft (staged, not yet committed)
  committedCount: number;   // commits with status 'committed'
  implementingCount: number;
  implementedCount: number;
  partialCount: number;
  errorCount: number;
  // Draft: the in-progress group (ordered by insertion)
  draft: PatchSummary[];    // all staged patches in order (class-changes + messages)
  // Finalized commits by status
  commits: CommitSummary[];
}

/** @deprecated Use QueueUpdateMessage instead */
export interface PatchUpdateMessage {
  type: 'PATCH_UPDATE';
  staged: number;
  committed: number;
  implementing: number;
  implemented: number;
  patches: {
    staged: PatchSummary[];
    committed: PatchSummary[];
    implementing: PatchSummary[];
    implemented: PatchSummary[];
  };
}

/** Server → Panel: agent reports work-in-progress */
export interface PatchImplementingMessage {
  type: 'PATCH_IMPLEMENTING';
  ids: string[];
}

/** Server → Panel: agent marks changes done */
export interface PatchImplementedMessage {
  type: 'PATCH_IMPLEMENTED';
  ids: string[];
}

/** Server → Panel: error on a specific patch */
export interface PatchErrorMessage {
  type: 'PATCH_ERROR';
  id: string;
  errorMessage: string;
}

// ---------------------------------------------------------------------------
// Design canvas messages
// ---------------------------------------------------------------------------

export type InsertMode = 'before' | 'after' | 'first-child' | 'last-child' | 'replace';

/** Panel → Overlay: request to inject a design canvas */
export interface InsertDesignCanvasMessage {
  type: 'INSERT_DESIGN_CANVAS';
  to: 'overlay';
  insertMode: InsertMode;
}

/** Panel → Overlay: capture screenshot of selected element(s) and replace with canvas */
export interface CaptureScreenshotMessage {
  type: 'CAPTURE_SCREENSHOT';
  to: 'overlay';
}

/** Overlay → Design iframe: element context for the canvas */
export interface ElementContextMessage {
  type: 'ELEMENT_CONTEXT';
  to: 'design';
  componentName: string;
  instanceCount: number;
  target: {
    tag: string;
    classes: string;
    innerText: string;
  };
  context: string;
  insertMode: InsertMode;
  screenshot?: string;  // base64 PNG data URL; present when insertMode is 'replace'
}

/** Design iframe → Server: submit the sketch */
export interface DesignSubmitMessage {
  type: 'DESIGN_SUBMIT';
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
  canvasComponents?: CanvasComponent[];
}

/** Design iframe → Overlay: close the canvas wrapper */
export interface DesignCloseMessage {
  type: 'DESIGN_CLOSE';
}

/** Panel → Overlay: close the inspector panel */
export interface ClosePanelMessage {
  type: 'CLOSE_PANEL';
}

/** Overlay → Server: story changed in Storybook, clear panel selection */
export interface ResetSelectionMessage {
  type: 'RESET_SELECTION';
}

/** Panel → Overlay: enter contentEditable text editing on the selected element */
export interface TextEditStartMessage {
  type: 'TEXT_EDIT_START';
  to: 'overlay';
}

/** Overlay → Panel: text editing completed, new text captured */
export interface TextEditEndMessage {
  type: 'TEXT_EDIT_END';
  to: 'panel';
  originalText: string;
  newText: string;
}

/** Overlay → Panel: text editing cancelled (Escape) */
export interface TextEditCancelMessage {
  type: 'TEXT_EDIT_CANCEL';
  to: 'panel';
}

/** Panel → Overlay: preview theme color overrides via CSS custom properties */
export interface ThemePreviewMessage {
  type: 'THEME_PREVIEW';
  to: 'overlay';
  overrides: Array<{ variable: string; value: string }>;
}

// ---------------------------------------------------------------------------
// Component arm-and-place messages
// ---------------------------------------------------------------------------

/** Panel → Overlay: user armed a component for placement from the Draw tab */
export interface ComponentArmMessage {
  type: 'COMPONENT_ARM';
  to: 'overlay';
  componentName: string;
  storyId: string;
  ghostHtml: string;
  componentPath?: string;  // Source file path from Storybook index, e.g. './src/components/Button.tsx'
  args?: Record<string, unknown>; // Current prop values from ArgsForm
}

/** Panel → Overlay: user cancelled the armed state (panel click or escape) */
export interface ComponentDisarmMessage {
  type: 'COMPONENT_DISARM';
  to: 'overlay';
}

/** Overlay → Panel: overlay has disarmed (user placed or pressed Escape in app) */
export interface ComponentDisarmedMessage {
  type: 'COMPONENT_DISARMED';
  to: 'panel';
}

/** Overlay → Server: component was placed, stage a patch */
export interface ComponentDroppedMessage {
  type: 'COMPONENT_DROPPED';
  patch: Patch;
}

// ---------------------------------------------------------------------------
// Union types
// ---------------------------------------------------------------------------

export type OverlayToPanel = ElementSelectedMessage | TextEditEndMessage | TextEditCancelMessage;
export type PanelToOverlay =
  | PatchPreviewMessage
  | PatchPreviewBatchMessage
  | PatchRevertMessage
  | PatchStageMessage
  | ClearHighlightsMessage
  | SwitchContainerMessage
  | InsertDesignCanvasMessage
  | CaptureScreenshotMessage
  | ClosePanelMessage
  | ComponentArmMessage
  | ComponentDisarmMessage
  | ThemePreviewMessage
  | TextEditStartMessage;
export type OverlayToServer = PatchStagedMessage | ComponentDroppedMessage | ResetSelectionMessage;
export type PanelToServer = PatchCommitMessage | MessageStageMessage;
export type ClientToServer =
  | RegisterMessage
  | PatchStagedMessage
  | PatchCommitMessage
  | MessageStageMessage
  | DesignSubmitMessage
  | DesignCloseMessage
  | ComponentDroppedMessage
  | ResetSelectionMessage
  | PingMessage;
export type ServerToClient =
  | PongMessage
  | QueueUpdateMessage
  | ResetSelectionMessage
  | PatchUpdateMessage
  | PatchImplementingMessage
  | PatchImplementedMessage
  | PatchErrorMessage;

export type AnyMessage =
  | RegisterMessage
  | ElementSelectedMessage
  | PatchPreviewMessage
  | PatchRevertMessage
  | PatchStageMessage
  | PatchStagedMessage
  | PatchCommitMessage
  | MessageStageMessage
  | QueueUpdateMessage
  | PatchUpdateMessage
  | PatchImplementingMessage
  | PatchImplementedMessage
  | PatchErrorMessage
  | ClearHighlightsMessage
  | SwitchContainerMessage
  | InsertDesignCanvasMessage
  | ElementContextMessage
  | DesignSubmitMessage
  | DesignCloseMessage
  | ClosePanelMessage
  | ComponentArmMessage
  | ComponentDisarmMessage
  | ComponentDisarmedMessage
  | ComponentDroppedMessage
  | ResetSelectionMessage
  | ThemePreviewMessage
  | TextEditStartMessage
  | TextEditEndMessage
  | TextEditCancelMessage
  | PingMessage
  | PongMessage;
