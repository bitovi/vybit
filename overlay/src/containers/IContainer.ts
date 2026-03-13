export type ContainerName = 'modal' | 'popover' | 'sidebar' | 'popup';

export interface IContainer {
  readonly name: ContainerName;
  open(panelUrl: string): void;
  close(): void;
  isOpen(): boolean;
}
