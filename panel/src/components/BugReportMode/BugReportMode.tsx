import { useState, useEffect, useRef, useCallback } from 'react';
import type { SnapshotMeta, BugReportElement, RecordingSnapshot } from '../../../../shared/types';
import { onMessage, sendTo, send } from '../../ws';
import type { BugReportModeProps, EventGroup, SecondaryItem, SecondaryType } from './types';

// ---------------------------------------------------------------------------
// Grouping: flat snapshot list → EventGroup[]
// ---------------------------------------------------------------------------

function isPrimaryTrigger(trigger: string): boolean {
  return trigger === 'click' || trigger === 'navigation' || trigger === 'page-load' || trigger === 'error';
}

function buildGroups(snapshots: SnapshotMeta[]): EventGroup[] {
  const groups: EventGroup[] = [];
  let currentGroup: EventGroup | null = null;

  for (const snap of snapshots) {
    if (isPrimaryTrigger(snap.trigger)) {
      currentGroup = {
        primary: snap,
        secondaries: buildSecondaries(snap),
        checked: false,
      };
      groups.push(currentGroup);
    } else {
      // Mutation or other non-primary — attach to current group or create background group
      if (!currentGroup) {
        currentGroup = {
          primary: { ...snap, trigger: snap.trigger },
          secondaries: buildSecondaries(snap),
          checked: false,
        };
        groups.push(currentGroup);
      } else {
        // Merge secondary data into current group
        mergeSecondaries(currentGroup, snap);
      }
    }
  }

  return groups;
}

function buildSecondaries(snap: SnapshotMeta): SecondaryItem[] {
  const items: SecondaryItem[] = [];

  if (snap.trigger === 'mutation') {
    items.push({ type: 'mutations', label: '1 mutation', checked: true, count: 1 });
  }

  if (snap.isKeyframe) {
    items.push({ type: 'screenshot', label: 'screenshot', checked: true });
  }

  if (snap.networkErrorCount > 0) {
    items.push({
      type: 'network',
      label: `${snap.networkErrorCount} network error${snap.networkErrorCount > 1 ? 's' : ''}`,
      checked: true,
      count: snap.networkErrorCount,
    });
  }

  if (snap.consoleErrorCount > 0) {
    items.push({
      type: 'logs',
      label: `${snap.consoleErrorCount} log${snap.consoleErrorCount > 1 ? 's' : ''} (${snap.consoleErrorCount} error${snap.consoleErrorCount > 1 ? 's' : ''})`,
      checked: true,
      count: snap.consoleErrorCount,
      errorCount: snap.consoleErrorCount,
    });
  }

  return items;
}

function mergeSecondaries(group: EventGroup, snap: SnapshotMeta): void {
  // Merge mutation count
  const existingMut = group.secondaries.find(s => s.type === 'mutations');
  if (snap.trigger === 'mutation') {
    if (existingMut) {
      existingMut.count = (existingMut.count ?? 0) + 1;
      existingMut.label = `${existingMut.count} mutation${existingMut.count > 1 ? 's' : ''}`;
    } else {
      group.secondaries.push({ type: 'mutations', label: '1 mutation', checked: true, count: 1 });
    }
  }

  if (snap.isKeyframe && !group.secondaries.some(s => s.type === 'screenshot')) {
    group.secondaries.push({ type: 'screenshot', label: 'screenshot', checked: true });
  }

  if (snap.networkErrorCount > 0) {
    const existing = group.secondaries.find(s => s.type === 'network');
    if (existing) {
      existing.count = (existing.count ?? 0) + snap.networkErrorCount;
      existing.label = `${existing.count} network error${existing.count > 1 ? 's' : ''}`;
    } else {
      group.secondaries.push({
        type: 'network',
        label: `${snap.networkErrorCount} network error${snap.networkErrorCount > 1 ? 's' : ''}`,
        checked: true,
        count: snap.networkErrorCount,
      });
    }
  }

  if (snap.consoleErrorCount > 0) {
    const existing = group.secondaries.find(s => s.type === 'logs');
    if (existing) {
      existing.count = (existing.count ?? 0) + snap.consoleErrorCount;
      existing.errorCount = (existing.errorCount ?? 0) + snap.consoleErrorCount;
      existing.label = `${existing.count} log${existing.count > 1 ? 's' : ''} (${existing.errorCount} error${existing.errorCount! > 1 ? 's' : ''})`;
    } else {
      group.secondaries.push({
        type: 'logs',
        label: `${snap.consoleErrorCount} log${snap.consoleErrorCount > 1 ? 's' : ''} (${snap.consoleErrorCount} error${snap.consoleErrorCount > 1 ? 's' : ''})`,
        checked: true,
        count: snap.consoleErrorCount,
        errorCount: snap.consoleErrorCount,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

function formatDelta(currentTs: string, anchorTs: string): string {
  const diff = (new Date(anchorTs).getTime() - new Date(currentTs).getTime()) / 1000;
  if (Math.abs(diff) < 1) return '0s';
  const secs = Math.round(Math.abs(diff));
  if (secs >= 120) return `−${Math.round(secs / 60)}m`;
  return `−${secs}s`;
}

function formatAbsoluteTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ---------------------------------------------------------------------------
// Badge component
// ---------------------------------------------------------------------------

const badgeStyles: Record<string, string> = {
  click: 'bg-[rgba(0,132,139,0.15)] text-[#5fd4da]',
  navigation: 'bg-[rgba(168,85,247,0.12)] text-[#c084fc]',
  'page-load': 'bg-[rgba(59,130,246,0.12)] text-[#60a5fa]',
  error: 'bg-[rgba(239,68,68,0.12)] text-[#f87171]',
  mutation: 'bg-[rgba(255,255,255,0.06)] text-[#999]',
};

function TriggerBadge({ trigger }: { trigger: string }) {
  const style = badgeStyles[trigger] ?? badgeStyles.mutation;
  return (
    <span className={`text-[9px] px-1.5 rounded-[3px] font-semibold tracking-[0.2px] mr-1.5 shrink-0 leading-[1.4] ${style}`}>
      {trigger}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Checkbox primitives
// ---------------------------------------------------------------------------

function PrimaryCheck({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      className={`w-4 h-4 rounded-[3px] border-[1.5px] flex items-center justify-center shrink-0 cursor-pointer transition-all duration-[120ms] mr-2 ${
        checked
          ? 'border-[#00848B] bg-[rgba(0,132,139,0.12)] text-[#00848B]'
          : 'border-[#666] bg-transparent text-transparent'
      }`}
    >
      {checked && <span className="text-[9px]">✓</span>}
    </button>
  );
}

function SecondaryCheck({ checked, visible, onChange }: { checked: boolean; visible: boolean; onChange: () => void }) {
  if (!visible) return <div className="w-3.5 h-3.5 mr-1.5 shrink-0" />;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      className={`w-3.5 h-3.5 rounded-[3px] border-[1.5px] flex items-center justify-center shrink-0 cursor-pointer transition-all duration-[120ms] mr-1.5 ${
        checked
          ? 'border-[#00848B] bg-[rgba(0,132,139,0.12)] text-[#00848B]'
          : 'border-[#666] bg-transparent text-transparent'
      }`}
    >
      {checked && <span className="text-[8px]">✓</span>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main BugReportMode component
// ---------------------------------------------------------------------------

export function BugReportMode({ onSubmit }: BugReportModeProps) {
  const [groups, setGroups] = useState<EventGroup[]>([]);
  const [description, setDescription] = useState('');
  const [pickedElement, setPickedElement] = useState<BugReportElement | null>(null);
  const [pickMode, setPickMode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  const lastShiftCheckRef = useRef<number | null>(null);

  // Request recording history on mount + listen for live updates
  useEffect(() => {
    sendTo('overlay', { type: 'RECORDING_GET_HISTORY' });

    const off = onMessage((msg: any) => {
      if (msg.type === 'RECORDING_HISTORY') {
        const built = buildGroups(msg.snapshots as SnapshotMeta[]);
        // Auto-select last 3 events
        const start = Math.max(0, built.length - 3);
        for (let i = start; i < built.length; i++) {
          built[i].checked = true;
        }
        setGroups(built);
      } else if (msg.type === 'RECORDING_SNAPSHOT_META') {
        setGroups(prev => {
          const allMetas = flattenToMetas(prev);
          allMetas.push(msg.meta as SnapshotMeta);
          return buildGroups(allMetas);
        });
      } else if (msg.type === 'BUG_REPORT_ELEMENT_PICKED') {
        setPickedElement(msg.element);
        setPickMode(false);
      } else if (msg.type === 'BUG_REPORT_PICK_CANCELLED') {
        setPickMode(false);
      }
    });

    return off;
  }, []);

  // Auto-scroll timeline to bottom on new events
  useEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [groups.length]);

  // Toggle primary checkbox
  const togglePrimary = useCallback((index: number, shiftKey: boolean) => {
    setGroups(prev => {
      const next = prev.map(g => ({ ...g, secondaries: g.secondaries.map(s => ({ ...s })) }));

      if (shiftKey && lastShiftCheckRef.current !== null) {
        const from = Math.min(lastShiftCheckRef.current, index);
        const to = Math.max(lastShiftCheckRef.current, index);
        for (let i = from; i <= to; i++) {
          next[i].checked = true;
          next[i].secondaries.forEach(s => { s.checked = true; });
        }
      } else {
        next[index].checked = !next[index].checked;
        if (next[index].checked) {
          next[index].secondaries.forEach(s => { s.checked = true; });
        }
      }

      lastShiftCheckRef.current = index;
      return next;
    });
  }, []);

  // Toggle secondary checkbox
  const toggleSecondary = useCallback((groupIndex: number, secIndex: number) => {
    setGroups(prev => {
      const next = prev.map(g => ({ ...g, secondaries: g.secondaries.map(s => ({ ...s })) }));
      next[groupIndex].secondaries[secIndex].checked = !next[groupIndex].secondaries[secIndex].checked;
      return next;
    });
  }, []);

  const handlePickElement = () => {
    if (pickMode) {
      // Cancel pick
      sendTo('overlay', { type: 'BUG_REPORT_PICK_CANCELLED' } as any);
      setPickMode(false);
    } else {
      sendTo('overlay', { type: 'BUG_REPORT_PICK_ELEMENT' });
      setPickMode(true);
    }
  };

  const selectedCount = groups.filter(g => g.checked).length;
  const canSubmit = selectedCount > 0 && description.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);

    // Gather selected snapshot IDs
    const selectedIds = groups
      .filter(g => g.checked)
      .map(g => g.primary.id);

    // Request full range data from overlay
    sendTo('overlay', { type: 'RECORDING_GET_RANGE', ids: selectedIds });

    // Wait for the range response
    const rangePromise = new Promise<RecordingSnapshot[]>((resolve) => {
      const off = onMessage((msg: any) => {
        if (msg.type === 'RECORDING_RANGE') {
          off();
          resolve(msg.snapshots);
        }
      });
      // Timeout fallback
      setTimeout(() => { off(); resolve([]); }, 10000);
    });

    const snapshots = await rangePromise;

    // Build patch data from selected snapshots + checked secondaries
    const selectedGroups = groups.filter(g => g.checked);

    // Filter based on which secondaries are unchecked
    const includeScreenshots = selectedGroups.some(g => g.secondaries.some(s => s.type === 'screenshot' && s.checked));
    const includeLogs = selectedGroups.some(g => g.secondaries.some(s => s.type === 'logs' && s.checked));
    const includeNetwork = selectedGroups.some(g => g.secondaries.some(s => s.type === 'network' && s.checked));

    // Build chronological timeline entries from snapshots
    const timeline: import('../../../../shared/types').BugTimelineEntry[] = [];
    const screenshots: string[] = [];

    for (const snap of snapshots) {
      const entry: import('../../../../shared/types').BugTimelineEntry = {
        timestamp: snap.timestamp,
        trigger: snap.trigger,
        url: snap.url,
      };
      if (includeLogs && snap.consoleLogs?.length) entry.consoleLogs = snap.consoleLogs;
      if (includeNetwork && snap.networkErrors?.length) entry.networkErrors = snap.networkErrors;
      if (snap.domSnapshot) entry.domSnapshot = snap.domSnapshot.slice(0, 50000);
      if (snap.domDiff) entry.domDiff = snap.domDiff.slice(0, 10000);
      if (snap.domChanges?.length) entry.domChanges = snap.domChanges;
      if (includeScreenshots && snap.screenshot) {
        screenshots.push(snap.screenshot);
        entry.hasScreenshot = true;
      }
      if (snap.elementInfo) entry.elementInfo = snap.elementInfo;
      if (snap.navigationInfo) entry.navigationInfo = snap.navigationInfo;
      timeline.push(entry);
    }

    const timestamps = selectedGroups.map(g => g.primary.timestamp);
    const timeRange = {
      start: timestamps[0] ?? new Date().toISOString(),
      end: timestamps[timestamps.length - 1] ?? new Date().toISOString(),
    };

    onSubmit({
      bugDescription: description.trim(),
      bugScreenshots: includeScreenshots ? screenshots.slice(0, 5) : [],
      bugTimeline: timeline,
      bugTimeRange: timeRange,
      bugElement: pickedElement,
    });

    // Reset
    setDescription('');
    setPickedElement(null);
    setGroups(prev => prev.map(g => ({
      ...g,
      checked: false,
      secondaries: g.secondaries.map(s => ({ ...s, checked: true })),
    })));
    setSubmitting(false);
  };

  // Determine anchor timestamp (last primary in timeline)
  const anchorTs = groups.length > 0 ? groups[groups.length - 1].primary.timestamp : new Date().toISOString();

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Event Timeline */}
      <div ref={timelineRef} className="flex-1 overflow-y-auto border-b border-bv-border">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
            <div className="text-[11px] text-bv-muted">No recording events yet</div>
            <div className="text-[10px] text-bv-muted/60">
              Interact with the page to start recording events.
            </div>
          </div>
        ) : (
          groups.map((group, gi) => (
            <div
              key={group.primary.id}
              className={`border-b border-white/[0.03] ${
                group.checked ? 'bg-[rgba(0,132,139,0.12)] border-l-2 border-l-[#00848B]' : ''
              }`}
            >
              {/* Primary row */}
              <div
                className="flex items-center px-2.5 py-1.5 cursor-pointer hover:bg-white/[0.025] transition-colors duration-[120ms]"
                onClick={(e) => togglePrimary(gi, e.shiftKey)}
              >
                <span
                  className="w-9 shrink-0 text-right pr-1.5 font-mono text-[10px] text-bv-muted font-medium"
                  title={formatAbsoluteTime(group.primary.timestamp)}
                >
                  {gi === groups.length - 1 ? '0s' : formatDelta(group.primary.timestamp, anchorTs)}
                </span>
                <PrimaryCheck
                  checked={group.checked}
                  onChange={() => togglePrimary(gi, false)}
                />
                <TriggerBadge trigger={group.primary.trigger} />
                <span className="text-[11px] text-bv-text flex-1 min-w-0 truncate">
                  {group.primary.trigger === 'click' && group.primary.elementInfo && (
                    <>
                      on <span className="font-mono text-[10px] text-bv-text-mid">
                        &lt;{group.primary.elementInfo.tag}&gt;
                      </span>
                      {group.primary.elementInfo.componentName && (
                        <>
                          {' '}in <span className="font-mono text-[10px] text-bv-text-mid">
                            &lt;{group.primary.elementInfo.componentName}&gt;
                          </span>
                        </>
                      )}
                    </>
                  )}
                  {group.primary.trigger === 'page-load' && (
                    <span className="font-mono text-[10px] text-bv-text-mid">{group.primary.url}</span>
                  )}
                  {group.primary.trigger === 'navigation' && (
                    <span className="font-mono text-[10px] text-bv-text-mid">{group.primary.url}</span>
                  )}
                  {group.primary.trigger === 'error' && (
                    <span className="text-[#f87171]">
                      {group.primary.consoleErrorCount} error{group.primary.consoleErrorCount > 1 ? 's' : ''}
                    </span>
                  )}
                </span>
                {group.primary.isKeyframe && (
                  <span className="text-[8px] text-[#00848B] font-bold ml-1 shrink-0">◆</span>
                )}
              </div>

              {/* Secondary rows */}
              {group.secondaries.map((sec, si) => (
                <div
                  key={`${group.primary.id}-${sec.type}-${si}`}
                  className={`flex items-center px-2.5 py-0.5 transition-opacity duration-[120ms] ${
                    group.checked && !sec.checked ? 'opacity-30' : ''
                  } ${si === group.secondaries.length - 1 ? 'pb-[5px]' : ''}`}
                >
                  {/* Time spacer (36px) */}
                  <span className="w-9 shrink-0" />
                  {/* Indent (12px) */}
                  <span className="w-3 shrink-0" />
                  <SecondaryCheck
                    checked={sec.checked}
                    visible={group.checked}
                    onChange={() => toggleSecondary(gi, si)}
                  />
                  <span className={`text-[10px] text-bv-text-mid flex-1 min-w-0 truncate ${
                    group.checked && !sec.checked ? 'line-through decoration-white/25' : ''
                  }`}>
                    {sec.type === 'network' && sec.networkStatus && (
                      <span className={`font-bold ${sec.networkStatus >= 400 ? 'text-[#ef4444]' : 'text-[#2E7229]'}`}>
                        {sec.networkStatus}{' '}
                      </span>
                    )}
                    {sec.type === 'logs' && sec.errorCount && sec.errorCount > 0 && (
                      <span className="text-[#f87171] font-semibold">{sec.errorCount} error{sec.errorCount > 1 ? 's' : ''} </span>
                    )}
                    {sec.label}
                  </span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Report Form */}
      <div className="px-3 py-2.5 flex flex-col gap-2">
        {/* Selection summary */}
        <div className="text-[10px] text-bv-text-mid">
          <span className="font-bold text-[#00848B]">{selectedCount}</span> event{selectedCount !== 1 ? 's' : ''} selected
          {selectedCount > 0 && (() => {
            const selected = groups.filter(g => g.checked);
            const start = formatAbsoluteTime(selected[0].primary.timestamp);
            const end = formatAbsoluteTime(selected[selected.length - 1].primary.timestamp);
            return <span className="text-bv-muted font-mono text-[9px] ml-1.5">{start} – {end}</span>;
          })()}
        </div>

        {/* Description textarea */}
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the bug…"
          className="w-full min-h-[48px] max-h-[140px] px-2.5 py-2 rounded-md border border-bv-border bg-bv-surface text-bv-text text-[11px] leading-[1.5] resize-none outline-none transition-colors duration-[120ms] focus:border-[#00848B] placeholder:text-[#666] overflow-y-auto"
          style={{ fieldSizing: 'content' } as any}
        />

        {/* Element picker */}
        <div className="flex items-center gap-1.5">
          {!pickedElement ? (
            <button
              type="button"
              onClick={handlePickElement}
              className={`flex items-center gap-[5px] px-2.5 py-[5px] rounded-md border border-dashed text-[10px] font-medium cursor-pointer transition-all duration-[120ms] whitespace-nowrap ${
                pickMode
                  ? 'border-[#00848B] text-[#00848B] bg-[rgba(0,132,139,0.12)]'
                  : 'border-bv-border text-bv-text-mid bg-transparent hover:border-[#00848B] hover:text-[#00848B] hover:bg-[rgba(0,132,139,0.12)]'
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="shrink-0">
                <path d="M14,0H2C.895,0,0,.895,0,2V14c0,1.105,.895,2,2,2H6c.552,0,1-.448,1-1h0c0-.552-.448-1-1-1H2V2H14V6c0,.552,.448,1,1,1h0c.552,0,1-.448,1-1V2c0-1.105-.895-2-2-2Z"/>
                <path d="M12.043,10.629l2.578-.644c.268-.068,.43-.339,.362-.607-.043-.172-.175-.308-.345-.358l-7-2c-.175-.051-.363-.002-.492,.126-.128,.129-.177,.317-.126,.492l2,7c.061,.214,.257,.362,.48,.362h.009c.226-.004,.421-.16,.476-.379l.644-2.578,3.664,3.664c.397,.384,1.03,.373,1.414-.025,.374-.388,.374-1.002,0-1.389l-3.664-3.664Z"/>
              </svg>
              {pickMode ? 'Click an element…' : 'Pick Element'}
            </button>
          ) : (
            <div className="flex items-center gap-1 flex-1 min-w-0 px-2 py-1 rounded bg-bv-surface border border-bv-border font-mono text-[10px] text-bv-text">
              <span className="text-[#00848B] font-semibold">&lt;{pickedElement.tag}&gt;</span>
              {pickedElement.id && <span className="text-bv-muted">#{pickedElement.id}</span>}
              {pickedElement.componentName && (
                <span className="text-[9px] text-bv-text-mid bg-[rgba(0,132,139,0.1)] px-1 rounded-[2px] font-medium font-sans">
                  {pickedElement.componentName}
                </span>
              )}
              <button
                type="button"
                onClick={() => setPickedElement(null)}
                className="w-3.5 h-3.5 rounded-[3px] border-none bg-white/[0.08] text-bv-muted text-[9px] flex items-center justify-center cursor-pointer ml-auto hover:bg-white/15 hover:text-bv-text"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Submit button */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={`flex items-center justify-center gap-1.5 w-full py-2 rounded-md border-none text-[11px] font-semibold cursor-pointer transition-all duration-[120ms] ${
            canSubmit
              ? 'bg-[#F5532D] text-white hover:bg-[#e04420]'
              : 'bg-bv-surface text-[#555] cursor-not-allowed'
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M11.5,6C11.5,4.067,9.933,2.5,8,2.5S4.5,4.067,4.5,6v1h7V6Z"/>
            <rect x="3" y="8" width="10" height="6" rx="2"/>
            <path d="M1,7.5h2v2H1c-.552,0-1-.448-1-1s.448-1,1-1Z"/>
            <path d="M13,7.5h2c.552,0,1,.448,1,1s-.448,1-1,1h-2v-2Z"/>
            <rect x="7" y="9" width="2" height="4" rx=".5"/>
          </svg>
          Commit Bug Report
        </button>
      </div>
    </div>
  );
}

// Helper: flatten EventGroup[] back to SnapshotMeta[] for re-grouping
function flattenToMetas(groups: EventGroup[]): SnapshotMeta[] {
  return groups.map(g => g.primary);
}
