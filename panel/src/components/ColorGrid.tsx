const HUE_ORDER = [
  'slate', 'gray', 'zinc', 'neutral', 'stone',
  'red', 'orange', 'amber', 'yellow', 'lime',
  'green', 'emerald', 'teal', 'cyan', 'sky',
  'blue', 'indigo', 'violet', 'purple', 'fuchsia',
  'pink', 'rose',
];

const SHADE_ORDER = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];

interface ColorGridProps {
  prefix: string;
  currentValue: string;
  colors: Record<string, any>;
  locked: boolean;
  lockedValue: string | null;
  onHover: (fullClass: string) => void;
  onLeave: () => void;
  onClick: (fullClass: string) => void;
  /** When provided, renders a red-X "remove" cell in the special colors row */
  onRemove?: () => void;
  /** Called when the mouse enters the remove cell — use to preview removal */
  onRemoveHover?: () => void;
}

export function ColorGrid({ prefix, currentValue, colors, locked, lockedValue, onHover, onLeave, onClick, onRemove, onRemoveHover }: ColorGridProps) {
  return (
    <div
      className="p-2 bg-bv-surface border border-bv-border rounded-md my-2"
      onMouseLeave={() => { if (!locked) onLeave(); }}
    >
      {/* Special colors: black, white, transparent + optional remove cell */}
      <div className="flex items-center gap-0.5 mb-0.5">
        <span className="w-[52px] text-[10px] text-bv-muted text-right pr-1.5 shrink-0"></span>
        {onRemove && (
          <div
            title="Remove class"
            className={`w-5 h-5 rounded cursor-pointer border-2 shrink-0 transition-[border-color,transform] flex items-center justify-center ${currentValue === '' ? 'outline outline-2 outline-offset-2 outline-bv-orange border-transparent' : 'border-transparent hover:border-bv-orange hover:scale-110'}`}
            onMouseEnter={() => { if (!locked && onRemoveHover) onRemoveHover(); }}
            onClick={onRemove}
          >
            <svg viewBox="0 0 10 10" width="14" height="14" xmlns="http://www.w3.org/2000/svg">
              <line x1="1" y1="1" x2="9" y2="9" stroke="#F5532D" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="9" y1="1" x2="1" y2="9" stroke="#F5532D" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
        )}
        {['black', 'white', 'transparent'].map((name) =>
          colors[name] !== undefined ? (
            <ColorCell
              key={name}
              prefix={prefix}
              colorName={name}
              colorValue={colors[name]}
              isCurrent={name === currentValue}
              isLocked={lockedValue === `${prefix}${name}`}
              locked={locked}
              onHover={onHover}
              onClick={onClick}
            />
          ) : null
        )}
      </div>

      {/* Hue rows */}
      {HUE_ORDER.map((hue) => {
        const hueColors = colors[hue];
        if (!hueColors || typeof hueColors !== 'object') return null;

        return (
          <div key={hue} className="flex items-center gap-0.5 mb-0.5">
            <span className="w-[52px] text-[10px] text-bv-muted text-right pr-1.5 shrink-0">{hue}</span>
            {SHADE_ORDER.map((shade) =>
              hueColors[shade] !== undefined ? (
                <ColorCell
                  key={`${hue}-${shade}`}
                  prefix={prefix}
                  colorName={`${hue}-${shade}`}
                  colorValue={hueColors[shade]}
                  isCurrent={`${hue}-${shade}` === currentValue}
                  isLocked={lockedValue === `${prefix}${hue}-${shade}`}
                  locked={locked}
                  onHover={onHover}
                  onClick={onClick}
                />
              ) : null
            )}
          </div>
        );
      })}
    </div>
  );
}

interface ColorCellProps {
  prefix: string;
  colorName: string;
  colorValue: string;
  isCurrent: boolean;
  isLocked: boolean;
  locked: boolean;
  onHover: (fullClass: string) => void;
  onClick: (fullClass: string) => void;
}

function ColorCell({ prefix, colorName, colorValue, isCurrent, isLocked, locked, onHover, onClick }: ColorCellProps) {
  const fullClass = `${prefix}${colorName}`;

  const borderClass = isLocked
    ? 'outline outline-2 outline-offset-2 outline-bv-teal border-transparent'
    : isCurrent
    ? 'outline outline-2 outline-offset-2 outline-bv-orange border-transparent'
    : locked ? 'border-transparent' : 'border-transparent hover:border-bv-text hover:scale-110 hover:z-10';

  const style = colorName === 'transparent'
    ? { background: 'repeating-conic-gradient(#808080 0% 25%, transparent 0% 50%) 50% / 8px 8px' }
    : { backgroundColor: colorValue };

  return (
    <div
      title={fullClass}
      className={`w-5 h-5 rounded cursor-pointer border-2 shrink-0 transition-[border-color,transform] ${borderClass}`}
      style={style}
      onMouseEnter={() => { if (!locked) onHover(fullClass); }}
      onClick={(e) => { e.stopPropagation(); onClick(fullClass); }}
    />
  );
}

