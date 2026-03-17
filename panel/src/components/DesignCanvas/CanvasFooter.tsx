interface CanvasFooterProps {
  onSubmit: () => void;
  onClose?: () => void;
}

export function CanvasFooter({ onSubmit, onClose }: CanvasFooterProps) {
  return (
    <div className="flex items-center justify-between px-2 py-1.5 bg-bv-bg border-t border-bv-border text-[10px] shrink-0">
      <div className="flex gap-1.5">
        {onClose && (
          <button
            onClick={onClose}
            className="px-2.5 py-0.5 rounded border border-bv-border bg-bv-bg text-bv-muted text-[10px] font-medium cursor-pointer hover:bg-bv-orange/10 hover:border-bv-orange hover:text-bv-orange transition-all"
          >
            ✕ Close
          </button>
        )}
      </div>
      <button
        onClick={onSubmit}
        className="px-2.5 py-0.5 rounded border border-bv-teal bg-bv-teal text-white text-[10px] font-medium cursor-pointer hover:bg-bv-teal/80 transition-all"
      >
        ✓ Queue as Change
      </button>
    </div>
  );
}
