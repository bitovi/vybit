import type { ComponentGroup } from '../../types';

interface ComponentCardFooterProps {
  isArmed: boolean;
  group: ComponentGroup;
  hasArgs: boolean;
  showProps: boolean;
  onToggleProps: () => void;
}

export function ComponentCardFooter({
  isArmed,
  group,
  hasArgs,
  showProps,
  onToggleProps,
}: ComponentCardFooterProps) {
  return (
    <div className="flex items-center justify-between px-2.5 py-1.5 border-t border-bv-border bg-bv-bg">
      {isArmed ? (
        <span className="text-[11px] font-medium text-bv-teal">Click the page to place</span>
      ) : (
        group.stories[0] ? (
          <a
            href={`/storybook/?path=/story/${group.stories[0].id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-bv-text hover:text-bv-orange hover:underline transition-colors"
            onClick={(e) => { e.stopPropagation(); }}
          >
            <ComponentTitle fullTitle={group.fullTitle} />
          </a>
        ) : (
          <span className="text-[11px] text-bv-text">
            <ComponentTitle fullTitle={group.fullTitle} />
          </span>
        )
      )}
      {hasArgs && (
        <button
          className={`w-5.5 h-5.5 rounded flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100 ${
            showProps ? 'opacity-100 bg-bv-surface-hi text-bv-text' : 'text-bv-muted hover:bg-bv-surface-hi hover:text-bv-text'
          }`}
          title="Customize props"
          onClick={(e) => { e.stopPropagation(); onToggleProps(); }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
          </svg>
        </button>
      )}
    </div>
  );
}

function ComponentTitle({ fullTitle }: { fullTitle: string }) {
  const segments = fullTitle.split('/');
  if (segments.length === 1) {
    return <span className="font-semibold">{segments[0]}</span>;
  }
  const path = segments.slice(0, -1);
  const name = segments.at(-1);
  return (
    <>
      <span className="text-bv-muted font-normal">{path.join(' / ')}</span>
      <span className="text-bv-muted font-normal"> / </span>
      <span className="font-semibold">{name}</span>
    </>
  );
}
