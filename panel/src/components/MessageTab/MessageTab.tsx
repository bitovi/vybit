import { useState, useRef, useEffect } from 'react';
import type { PatchSummary } from '../../../../shared/types';

const SpeechRecognitionAPI =
  typeof window !== 'undefined'
    ? (window.SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null) as typeof SpeechRecognition | null
    : null;

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
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const baseTextRef = useRef(''); // text before recording started

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

  function toggleRecording() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    if (!SpeechRecognitionAPI) return;

    baseTextRef.current = text;

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (e) => {
      let transcript = '';
      for (let i = 0; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      const base = baseTextRef.current.trimEnd();
      setText(base ? `${base} ${transcript}` : transcript);
    };

    recognition.onend = () => setListening(false);
    recognition.onerror = (e) => {
      console.error('[mic] SpeechRecognition error:', e.error, e.message);
      setListening(false);
      if (e.error === 'not-allowed') {
        setMicError("Microphone blocked — allow access in your browser's address bar, then reload.");
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
      console.log('[mic] recognition started');
    } catch (err) {
      console.error('[mic] recognition.start() threw:', err);
    }
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
        <div className="flex items-center justify-between">
          {SpeechRecognitionAPI ? (
            <button
              type="button"
              title={listening ? 'Stop recording' : 'Record voice message'}
              onClick={toggleRecording}
              className={`flex items-center justify-center w-7 h-7 rounded-full border-none cursor-pointer transition-colors ${listening ? 'bg-bv-orange text-white' : micError ? 'bg-bv-surface text-bv-orange hover:bg-bv-surface-hi' : 'bg-bv-surface text-bv-text-mid hover:text-bv-teal hover:bg-bv-surface-hi'}`}
            >
              {listening ? (
                <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 1a4 4 0 0 1 4 4v7a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm-1.5 4v7a1.5 1.5 0 0 0 3 0V5a1.5 1.5 0 0 0-3 0zM6 11a1 1 0 0 1 1 1 5 5 0 0 0 10 0 1 1 0 1 1 2 0 7 7 0 0 1-6 6.93V21h2a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2h2v-2.07A7 7 0 0 1 5 12a1 1 0 0 1 1-1z"/>
                </svg>
              )}
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            className="px-3 py-1 text-[11px] font-semibold rounded bg-bv-teal text-white border-none cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!canAddMessage}
            onClick={handleAdd}
          >
            Add Message
          </button>
        </div>
        {micError && (
          <p className="text-[11px] text-bv-orange mt-1">{micError}</p>
        )}
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
