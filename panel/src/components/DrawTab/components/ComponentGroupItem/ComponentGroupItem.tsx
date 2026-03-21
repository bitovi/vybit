import { useState } from 'react';
import type { ArgType, ComponentGroup } from '../../types';
import { StoryRow } from '../StoryRow';

interface ComponentGroupItemProps {
  group: ComponentGroup;
}

export function ComponentGroupItem({ group }: ComponentGroupItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const propEntries = Object.entries(group.argTypes);
  const base = '/storybook';

  return (
    <li>
      <button
        className="w-full flex items-center justify-between px-2 py-1 rounded text-[11px] text-bv-text hover:bg-bv-surface-hi transition-colors"
        onClick={() => setIsExpanded(prev => !prev)}
      >
        <span className="flex items-center gap-1.5">
          <span className="text-bv-muted text-[9px]">{isExpanded ? '▼' : '▶'}</span>
          {group.name}
        </span>
        <span className="text-[10px] text-bv-muted">
          {group.stories.length} {group.stories.length === 1 ? 'story' : 'stories'}
        </span>
      </button>
      {isExpanded && (
        <div className="ml-4 mt-0.5 flex flex-col gap-1">
          <ul className="flex flex-col gap-0.5">
            {group.stories.map(story => (
              <StoryRow
                key={story.id}
                story={story}
                storybookUrl={base}
                iframeSrc={`${base}/iframe.html?id=${story.id}&viewMode=story`}
              />
            ))}
          </ul>
          {propEntries.length > 0 && (
            <div className="border-t border-bv-border pt-1.5">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-bv-muted mb-1">
                Props
              </div>
              <ul className="flex flex-col gap-0.5">
                {propEntries.map(([propName, argType]) => (
                  <PropRow key={propName} name={propName} argType={argType} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function PropRow({ name, argType }: { name: string; argType: ArgType }) {
  return (
    <li className="flex items-center gap-1 px-1 py-0.5 text-[10px]">
      <span className="text-bv-text font-mono">{name}</span>
      <span className="text-bv-muted">·</span>
      <span className="text-bv-text-mid">
        {argType.control}
        {argType.options && argType.options.length > 0 && (
          <span className="text-bv-muted ml-1">({argType.options.join(', ')})</span>
        )}
      </span>
    </li>
  );
}
