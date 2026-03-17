import { useState, useEffect } from 'react';
import { parseClasses } from '../../overlay/src/class-parser';
import { connect, onMessage, onConnect, onDisconnect, isConnected, sendTo } from './ws';
import { Picker } from './Picker';
import { usePatchManager } from './hooks/usePatchManager';
import { PatchPopover } from './components/PatchPopover';
import { TabBar } from './components/TabBar';
import type { Tab } from './components/TabBar';
import { MessageTab } from './components/MessageTab';
import { ContainerSwitcher } from './components/ContainerSwitcher';
import { DrawTab } from './components/DrawTab';
import { DesignMode } from './DesignMode';

// URL param routing: ?mode=design renders the drawing canvas instead of the Picker
const urlParams = new URLSearchParams(window.location.search);
const appMode = urlParams.get('mode');

const TABS: Tab[] = [
  { id: 'design', label: 'Design' },
  { id: 'message', label: 'Message' },
  { id: 'draw', label: 'Draw' },
];

interface ElementData {
  componentName: string;
  instanceCount: number;
  classes: string;
  tailwindConfig: any;
}

export function App() {
  // If URL has ?mode=design, render the design canvas (used inside the overlay iframe)
  if (appMode === 'design') {
    return <DesignMode />;
  }

  return <InspectorApp />;
}

function InspectorApp() {
  const [wsConnected, setWsConnected] = useState(false);
  const [elementData, setElementData] = useState<ElementData | null>(null);
  const [activeTab, setActiveTab] = useState('design');
  const [selectModeActive, setSelectModeActive] = useState(false);
  const patchManager = usePatchManager();

  useEffect(() => {
    const offConnect = onConnect(() => {
      setWsConnected(true);
      // Sync stored container preference to the overlay on every (re)connect,
      // since the overlay and panel run on different origins (different localStorage).
      try {
        const stored = localStorage.getItem('tw-panel-container');
        if (stored && stored !== 'popover') {
          sendTo('overlay', { type: 'SWITCH_CONTAINER', container: stored });
        }
      } catch { /* ignore */ }
    });
    const offDisconnect = onDisconnect(() => setWsConnected(false));

    const offMessage = onMessage((msg) => {
      if (msg.type === 'ELEMENT_SELECTED') {
        setElementData({
          componentName: msg.componentName,
          instanceCount: msg.instanceCount,
          classes: msg.classes,
          tailwindConfig: msg.tailwindConfig,
        });
        setSelectModeActive(false);
      } else if (msg.type === 'SELECT_MODE_CHANGED') {
        setSelectModeActive(!!msg.active);
      } else if (msg.type === 'QUEUE_UPDATE') {
        patchManager.handleQueueUpdate({
          draftCount: msg.draftCount,
          committedCount: msg.committedCount,
          implementingCount: msg.implementingCount,
          implementedCount: msg.implementedCount,
          partialCount: msg.partialCount,
          errorCount: msg.errorCount,
          draft: msg.draft,
          commits: msg.commits,
        });
      } else if (msg.type === 'PATCH_UPDATE') {
        // Legacy backward compat
        patchManager.handlePatchUpdate({
          staged: msg.staged,
          committed: msg.committed,
          implementing: msg.implementing,
          implemented: msg.implemented,
          patches: msg.patches,
        });
      }
    });

    connect();
    setWsConnected(isConnected());
    return () => { offConnect(); offDisconnect(); offMessage(); };
  }, []);

  const { draft, committed, implementing, implemented, partial, error } = patchManager.counts;

  // Merge server draft + local patches for display.
  // Server draft is the source of truth for IDs; local patches carry richer detail.
  // Any server-only draft (e.g. from a second overlay) is also shown.
  const localById = new Map(
    patchManager.patches
      .filter(p => p.status === 'staged')
      .map(p => [p.id, {
        id: p.id,
        kind: p.kind ?? ('class-change' as const),
        elementKey: p.elementKey,
        status: p.status,
        originalClass: p.originalClass,
        newClass: p.newClass,
        property: p.property,
        timestamp: p.timestamp,
        component: p.component,
        message: p.message,
        image: p.image,
      }])
  );
  const serverIds = new Set(patchManager.queueState.draft.map(p => p.id));
  const draftPatches = [
    // All server drafts (use local version if available for richer data)
    ...patchManager.queueState.draft.map(p => localById.get(p.id) ?? p),
    // Any local patches not yet acknowledged by the server
    ...patchManager.patches
      .filter(p => p.status === 'staged' && !serverIds.has(p.id))
      .map(p => localById.get(p.id)!),
  ];

  const committedCommits = patchManager.queueState.commits.filter(c => c.status === 'committed');
  const implementingCommits = patchManager.queueState.commits.filter(c => c.status === 'implementing');
  const implementedCommits = patchManager.queueState.commits.filter(c => c.status === 'implemented');

  const queueFooter = (
    <div className="flex items-center justify-center px-3 py-1.5 border-t border-bv-border shrink-0 gap-2.5">
      <PatchPopover
        label="draft"
        count={draft}
        items={draftPatches}
        activeColor="text-bv-text"
        onDiscard={(id: string) => patchManager.discard(id)}
        onCommitAll={() => patchManager.commitAll()}
        onDiscardAll={() => patchManager.discardAll()}
      />
      <span className="text-bv-border text-[11px]">·</span>
      <PatchPopover
        label="committed"
        count={committed}
        items={committedCommits.flatMap(c => c.patches)}
        activeColor="text-bv-orange"
      />
      <span className="text-bv-border text-[11px]">·</span>
      <PatchPopover
        label="implementing"
        count={implementing}
        items={implementingCommits.flatMap(c => c.patches)}
        activeColor="text-bv-orange"
      />
      <span className="text-bv-border text-[11px]">·</span>
      <PatchPopover
        label="implemented"
        count={implemented}
        items={implementedCommits.flatMap(c => c.patches)}
        activeColor="text-bv-teal"
      />
    </div>
  );

  if (!wsConnected) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6">
          <div className="w-2 h-2 rounded-full bg-bv-orange animate-pulse" />
          <span className="text-bv-text-mid text-[12px]">Waiting for connection…</span>
        </div>
        {queueFooter}
      </div>
    );
  }

  if (!elementData) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-3 pt-3 pb-2 border-b border-bv-border">
          <div className="flex items-center justify-between gap-2">
            <SelectElementButton active={selectModeActive} onToggle={() => {
              const next = !selectModeActive;
              setSelectModeActive(next);
              sendTo('overlay', { type: 'TOGGLE_SELECT_MODE', active: next });
            }} />
            <div className="flex-1 min-w-0">
              {selectModeActive ? (
                <span className="text-[11px] text-bv-teal font-medium">● Selecting… click an element on the page</span>
              ) : (
                <span className="text-[12px] text-bv-muted">No element selected</span>
              )}
            </div>
            <ContainerSwitcher />
          </div>
        </div>
        <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
        <div className="flex-1 overflow-auto">
          {activeTab === 'message' ? (
            <MessageTab
              draft={draftPatches}
              currentElementKey=""
              onAddMessage={(message, elementKey) => patchManager.stageMessage(message, elementKey)}
              onDiscard={(id) => patchManager.discard(id)}
            />
          ) : selectModeActive ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8">
              <div className="w-10 h-10 rounded-full bg-bv-teal text-white flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 12l2.5 6 1.5-3 3-1.5z" />
                </svg>
              </div>
              <span className="text-[12px] text-bv-teal font-medium">Selection mode active</span>
              <span className="text-[10px] text-bv-muted text-center leading-relaxed">
                Hover over elements on the page to preview, then click to select.<br />
                Press <kbd className="font-mono text-[9px] text-bv-text-mid">Esc</kbd> to cancel.
              </span>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-8">
              <button
                onClick={() => {
                  setSelectModeActive(true);
                  sendTo('overlay', { type: 'TOGGLE_SELECT_MODE', active: true });
                }}
                className="flex flex-col items-center gap-3 px-6 py-5 rounded-lg border border-bv-border bg-bv-surface hover:border-bv-teal hover:bg-bv-teal/5 transition-all cursor-pointer"
              >
                <div className="w-10 h-10 rounded-full bg-bv-teal/10 text-bv-teal flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 12l2.5 6 1.5-3 3-1.5z" />
                  </svg>
                </div>
                <span className="text-[12px] text-bv-text font-medium">Select an element to inspect</span>
                <span className="text-[10px] text-bv-muted">or press <kbd className="font-mono text-[9px] text-bv-text-mid font-semibold">⌘⇧C</kbd></span>
              </button>
            </div>
          )}
        </div>
        {queueFooter}
      </div>
    );
  }

  const parsedClasses = parseClasses(elementData.classes);

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 pt-3 pb-2 border-b border-bv-border">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <SelectElementButton active={selectModeActive} onToggle={() => {
              const next = !selectModeActive;
              setSelectModeActive(next);
              sendTo('overlay', { type: 'TOGGLE_SELECT_MODE', active: next });
            }} />
            <div className="font-[family-name:var(--font-display)] font-bold text-[13px] text-bv-text leading-tight truncate">
              {elementData.componentName}{' '}
              <span className="font-[family-name:var(--font-ui)] font-normal text-bv-text-mid">
                — {elementData.instanceCount} instance{elementData.instanceCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <ContainerSwitcher />
        </div>
      </div>
      <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="flex-1 overflow-auto">
        {activeTab === 'design' && (
          <Picker
            componentName={elementData.componentName}
            instanceCount={elementData.instanceCount}
            parsedClasses={parsedClasses}
            tailwindConfig={elementData.tailwindConfig}
            patchManager={patchManager}
          />
        )}
        {activeTab === 'message' && (
          <MessageTab
            draft={draftPatches}
            currentElementKey={elementData.componentName}
            onAddMessage={(message, elementKey) => patchManager.stageMessage(message, elementKey, elementData.componentName)}
            onDiscard={(id) => patchManager.discard(id)}
          />
        )}
        {activeTab === 'draw' && (
          <DrawTab
            componentName={elementData.componentName}
            instanceCount={elementData.instanceCount}
          />
        )}
      </div>
      {queueFooter}
    </div>
  );
}

function SelectElementButton({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title={`${active ? 'Stop selecting' : 'Select an element'} (⌘⇧C)`}
      className={`w-7 h-7 rounded flex items-center justify-center shrink-0 border transition-all
        ${active
          ? 'bg-bv-teal border-bv-teal text-white'
          : 'bg-transparent border-bv-border text-bv-text-mid hover:border-bv-teal hover:text-bv-teal hover:bg-bv-teal/10'
        }`}
    >
      {/* Chrome DevTools-style cursor-in-box icon */}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M8 12l2.5 6 1.5-3 3-1.5z" />
      </svg>
    </button>
  );
}
