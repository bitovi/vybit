/**
 * Text editing module — allows inline contentEditable editing of selected elements.
 * Produces `text-change` patches that flow through the commit/queue/MCP pipeline.
 */
import { computePosition, flip, offset, autoUpdate } from "@floating-ui/dom";

interface TextEditDeps {
  sendTo: (role: string, msg: any) => void;
  send: (msg: any) => void;
  currentBoundary: { componentName: string } | null;
  currentTargetEl: HTMLElement | null;
  currentEquivalentNodes: HTMLElement[];
  buildTextContext: (target: HTMLElement, originalClassMap: Map<HTMLElement, string>) => string;
  positionToolbar: () => void;
  shadowRoot: ShadowRoot;
  onDone?: () => void;
}

let isEditing = false;
let originalHtml = '';
let editTarget: HTMLElement | null = null;
let deps: TextEditDeps | null = null;
let actionBarEl: HTMLElement | null = null;
let blurTimer: number | null = null;
let cleanupAutoUpdate: (() => void) | null = null;

// Listeners stored for cleanup
let keydownHandler: ((e: KeyboardEvent) => void) | null = null;
let blurHandler: (() => void) | null = null;

export function isTextEditing(): boolean {
  return isEditing;
}

export function startTextEdit(targetEl: HTMLElement, injectedDeps: TextEditDeps): void {
  if (isEditing) endTextEdit(false);

  deps = injectedDeps;
  editTarget = targetEl;
  originalHtml = targetEl.innerHTML;
  isEditing = true;

  // Make element editable
  targetEl.contentEditable = 'true';
  targetEl.style.outline = '2px dashed #00848B';
  targetEl.style.outlineOffset = '2px';
  targetEl.focus();

  // Select all text content
  const selection = window.getSelection();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(targetEl);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  // Show floating action bar
  showActionBar();

  // Register listeners
  keydownHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      endTextEdit(false);
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      e.stopPropagation();
      endTextEdit(true);
    }
  };
  targetEl.addEventListener('keydown', keydownHandler);

  blurHandler = () => {
    // Delay to allow action bar click to fire first
    blurTimer = window.setTimeout(() => {
      if (isEditing) endTextEdit(true);
    }, 200);
  };
  targetEl.addEventListener('blur', blurHandler);

  // Notify panel
  deps.sendTo('panel', { type: 'TEXT_EDIT_ACTIVE' });
}

export function endTextEdit(confirm: boolean): void {
  if (!isEditing || !editTarget || !deps) return;

  if (confirm && editTarget.innerHTML !== originalHtml) {
    // Build and send text-change patch
    const id = crypto.randomUUID();
    const context = deps.buildTextContext(editTarget, new Map());
    const patch = {
      id,
      kind: 'text-change' as const,
      elementKey: deps.currentBoundary?.componentName ?? editTarget.tagName.toLowerCase(),
      status: 'staged' as const,
      originalClass: '',
      newClass: '',
      originalHtml,
      newHtml: editTarget.innerHTML,
      property: 'text',
      timestamp: new Date().toISOString(),
      pageUrl: window.location.href,
      component: { name: deps.currentBoundary?.componentName ?? '' },
      target: {
        tag: editTarget.tagName.toLowerCase(),
        classes: typeof editTarget.className === 'string' ? editTarget.className : '',
        innerText: (editTarget.innerText || '').trim().slice(0, 60),
      },
      context,
    };

    deps.send({ type: 'PATCH_STAGED', patch });
  } else if (!confirm) {
    // Revert
    editTarget.innerHTML = originalHtml;
  }

  // Cleanup element
  editTarget.removeAttribute('contentEditable');
  editTarget.style.outline = '';
  editTarget.style.outlineOffset = '';

  // Remove listeners
  if (keydownHandler) {
    editTarget.removeEventListener('keydown', keydownHandler);
    keydownHandler = null;
  }
  if (blurHandler) {
    editTarget.removeEventListener('blur', blurHandler);
    blurHandler = null;
  }
  if (blurTimer != null) {
    clearTimeout(blurTimer);
    blurTimer = null;
  }

  // Remove action bar
  removeActionBar();

  // Reset state
  isEditing = false;
  editTarget = null;
  originalHtml = '';

  // Notify panel
  deps.sendTo('panel', { type: 'TEXT_EDIT_DONE' });

  // Restore toolbar
  if (deps.onDone) deps.onDone();
}

// ── Floating Action Bar ──────────────────────────────────

function showActionBar(): void {
  if (!deps || !editTarget) return;
  removeActionBar();

  const bar = document.createElement('div');
  bar.className = 'text-action-bar';
  bar.style.left = '0px';
  bar.style.top = '0px';
  deps.shadowRoot.appendChild(bar);
  actionBarEl = bar;

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'text-action-confirm';
  confirmBtn.textContent = '✓ Queue as Change';
  confirmBtn.addEventListener('mousedown', (e) => {
    e.preventDefault(); // Prevent blur on editTarget
  });
  confirmBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (blurTimer != null) { clearTimeout(blurTimer); blurTimer = null; }
    endTextEdit(true);
  });
  bar.appendChild(confirmBtn);

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'text-action-cancel';
  cancelBtn.textContent = '✕ Cancel';
  cancelBtn.addEventListener('mousedown', (e) => {
    e.preventDefault(); // Prevent blur on editTarget
  });
  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (blurTimer != null) { clearTimeout(blurTimer); blurTimer = null; }
    endTextEdit(false);
  });
  bar.appendChild(cancelBtn);

  // Use autoUpdate for automatic repositioning on scroll/resize/layout changes
  if (editTarget && actionBarEl) {
    cleanupAutoUpdate = autoUpdate(editTarget, bar, () => {
      repositionActionBar();
    });
  }
}

async function repositionActionBar(): Promise<void> {
  if (!actionBarEl || !editTarget) return;
  const { x, y } = await computePosition(editTarget, actionBarEl, {
    placement: 'top-start',
    middleware: [offset(6), flip()],
  });
  actionBarEl.style.left = `${x}px`;
  actionBarEl.style.top = `${y}px`;
}

function removeActionBar(): void {
  if (cleanupAutoUpdate) {
    cleanupAutoUpdate();
    cleanupAutoUpdate = null;
  }
  actionBarEl?.remove();
  actionBarEl = null;
}
