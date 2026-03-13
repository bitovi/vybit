// Shared message types for overlay ↔ server ↔ panel communication.
// This file is types-only — imported by both overlay and panel builds.

export type ContainerName = 'modal' | 'popover' | 'sidebar' | 'popup';

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
}

export interface ClassPreviewMessage {
  type: 'CLASS_PREVIEW';
  to: 'overlay';
  oldClass: string;
  newClass: string;
}

export interface ClassRevertMessage {
  type: 'CLASS_REVERT';
  to: 'overlay';
}

export interface ClassCommitMessage {
  type: 'CLASS_COMMIT';
  to: 'overlay';
  oldClass: string;
  newClass: string;
  property: string;
}

export interface ChangeMessage {
  type: 'CHANGE';
  component: { name: string };
  target: { tag: string; classes: string; innerText: string };
  change: { property: string; old: string; new: string };
  context: string;
}

export interface ClearHighlightsMessage {
  type: 'CLEAR_HIGHLIGHTS';
  to: 'overlay';
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

export type OverlayToPanel = ElementSelectedMessage;
export type PanelToOverlay = ClassPreviewMessage | ClassRevertMessage | ClassCommitMessage | ClearHighlightsMessage | SwitchContainerMessage;
export type ClientToServer = RegisterMessage | ChangeMessage | PingMessage;
export type ServerToClient = PongMessage;

export type AnyMessage =
  | RegisterMessage
  | ElementSelectedMessage
  | ClassPreviewMessage
  | ClassRevertMessage
  | ClassCommitMessage
  | ChangeMessage
  | ClearHighlightsMessage
  | SwitchContainerMessage
  | PingMessage
  | PongMessage;
