import type { IContainer } from './IContainer';

export class PopupContainer implements IContainer {
  readonly name = 'popup' as const;
  private popup: Window | null = null;

  open(panelUrl: string): void {
    if (this.popup && !this.popup.closed) {
      this.popup.focus();
      return;
    }
    this.popup = window.open(panelUrl, 'tw-panel', 'popup,width=420,height=700');
  }

  close(): void {
    if (this.popup && !this.popup.closed) {
      this.popup.close();
    }
    this.popup = null;
  }

  isOpen(): boolean {
    return this.popup !== null && !this.popup.closed;
  }
}
