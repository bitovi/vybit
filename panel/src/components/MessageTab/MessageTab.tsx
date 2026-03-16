import { useState, useRef, useEffect } from 'react';
import type { PatchSummary } from '../../../../shared/types';

interface MessageTabProps {
  /** Currently staged patches (draft) — used to show staged message list */
  draft: PatchSummary[];
  /** The currently selected element key, or empty if no element selected */
  currentElementKey: string;
  /** Callback to stage a new message patch */
  onAddMessage: (message: string, elementKey: string) => void;
  /** Callback to discard a message patch */
  onDiscard: (id: string) => void;
}

export function MessageTab({
  draft,
  currentElementKey,
  onAddMessage,
  onDiscard,
}: MessageTabProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const messagePatches = draft.filter(p => p.kind === 'message');
  const canAddMessage = Boolean(text.trim()) && Boolean(currentElementKey);

  function handleAdd() {
    const trimmed = text.trim();
    if (!trimmed || !currentElementKey) return;
    onAddMessage(trimmed, currentElementKey);
    setText('');
    textareaRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  }

  return (
    <div className="p-3 flex flex-col gap-3">
      {/* Compose area */}
      <div className="flex flex-col gap-2">
        <textarea
          ref={textareaRef}
          className="w-full min-h-[80px] p-2 bg-bv-bg border border-bv-border rounded text-[13px] font-[family-name:var(--font-ui)] text-bv-text placeholder:text-bv-muted resize-y focus:outline-none focus:border-bv-teal"
          placeholder={currentElementKey ? 'Add context for the AI agent…' : 'Select an element to add contextual message…'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!currentElementKey}
        />
        <div className="flex items-center justify-end">
          <button
            type="button"
            className="px-3 py-1 text-[11px] font-semibold rounded bg-bv-teal text-white border-none cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!canAddMessage}
            onClick={handleAdd}
          >
            Add Message
          </button>
        </div>
      </div>

      {/* Staged messages list */}
      {messagePatches.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span className="w-[5px] h-[5px] rounded-full bg-bv-teal opacity-50 shrink-0" />
            <span className="text-[9px] font-semibold uppercase tracking-[1px] text-bv-text-mid">
              Staged Messages
            </span>
          </div>
          {messagePatches.map((patch) => (
            <div
              key={patch.id}
              className="flex items-start gap-2 p-2 bg-bv-surface rounded border border-bv-border group"
            >
              <span className="text-[12px] shrink-0 mt-0.5">💬</span>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-[family-name:var(--font-ui)] text-bv-text break-words">
                  "{patch.message}"
                </div>
                {patch.elementKey && (
                  <div className="text-[11px] text-bv-text-mid mt-0.5">
                    {patch.component?.name || patch.elementKey}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="shrink-0 text-[10px] px-1 py-0.5 rounded border-none cursor-pointer bg-transparent text-bv-muted hover:text-bv-orange transition-colors opacity-0 group-hover:opacity-100"
                onClick={() => onDiscard(patch.id)}
                title="Discard"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
