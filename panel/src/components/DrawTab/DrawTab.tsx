import { sendTo } from '../../ws';

interface DrawTabProps {
  componentName: string;
  instanceCount: number;
}

export function DrawTab({ componentName }: DrawTabProps) {
  const handleInsertDesign = (insertMode: 'before' | 'after' | 'first-child' | 'last-child') => {
    sendTo('overlay', {
      type: 'INSERT_DESIGN_CANVAS',
      insertMode,
    });
  };

  return (
    <div className="p-3 flex flex-col gap-3">
      <div className="text-[11px] text-bv-text-mid leading-relaxed">
        Insert a drawing canvas into the page to visually sketch a new UI element.
        The sketch will be queued as a change for an AI agent to implement.
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="text-[9px] font-semibold uppercase tracking-wider text-bv-muted">
          Insert Drawing Canvas
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={() => handleInsertDesign('before')}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-bv-border bg-bv-bg text-[11px] text-bv-text-mid cursor-pointer hover:bg-bv-teal/5 hover:border-bv-teal hover:text-bv-teal transition-all"
          >
            <span className="text-[13px]">↑</span>
            Before element
          </button>
          <button
            onClick={() => handleInsertDesign('after')}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-bv-border bg-bv-bg text-[11px] text-bv-text-mid cursor-pointer hover:bg-bv-teal/5 hover:border-bv-teal hover:text-bv-teal transition-all"
          >
            <span className="text-[13px]">↓</span>
            After element
          </button>
          <button
            onClick={() => handleInsertDesign('first-child')}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-bv-border bg-bv-bg text-[11px] text-bv-text-mid cursor-pointer hover:bg-bv-teal/5 hover:border-bv-teal hover:text-bv-teal transition-all"
          >
            <span className="text-[13px]">⤒</span>
            First child
          </button>
          <button
            onClick={() => handleInsertDesign('last-child')}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-bv-border bg-bv-bg text-[11px] text-bv-text-mid cursor-pointer hover:bg-bv-teal/5 hover:border-bv-teal hover:text-bv-teal transition-all"
          >
            <span className="text-[13px]">⤓</span>
            Last child
          </button>
        </div>
      </div>

      <div className="text-[9px] text-bv-muted italic">
        The canvas will be injected relative to the selected <span className="font-mono">&lt;{componentName}&gt;</span> element.
      </div>

      <div className="border-t border-bv-border" />

      <div className="flex flex-col gap-1.5">
        <div className="text-[9px] font-semibold uppercase tracking-wider text-bv-muted">
          Screenshot &amp; Annotate
        </div>
        <div className="text-[11px] text-bv-text-mid leading-relaxed">
          Capture the selected element(s) and annotate in the drawing canvas.
          The selected elements will be replaced by the canvas. All selected
          elements must be siblings in the DOM.
        </div>
        <button
          onClick={() => sendTo('overlay', { type: 'CAPTURE_SCREENSHOT' })}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-bv-border bg-bv-bg text-[11px] text-bv-text-mid cursor-pointer hover:bg-bv-teal/5 hover:border-bv-teal hover:text-bv-teal transition-all w-full"
        >
          <span className="text-[13px]">📷</span>
          Screenshot &amp; Annotate
        </button>
      </div>
    </div>
  );
}
