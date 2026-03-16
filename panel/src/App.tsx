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
  const patchManager = usePatchManager();

  useEffect(() => {
    onConnect(() => {
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
    onDisconnect(() => setWsConnected(false));

    onMessage((msg) => {
      if (msg.type === 'ELEMENT_SELECTED') {
        setElementData({
          componentName: msg.componentName,
          instanceCount: msg.instanceCount,
          classes: msg.classes,
          tailwindConfig: msg.tailwindConfig,
        });
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
  }, []);

  const { draft, committed, implementing, implemented, partial, error } = patchManager.counts;

  // Merge local draft patches and server draft for display
  const draftPatches = patchManager.patches.length > 0
    ? patchManager.patches.filter(p => p.status === 'staged').map(p => ({
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
      }))
    : patchManager.queueState.draft;

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
        <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
        <div className="flex-1 overflow-auto">
          {activeTab === 'message' ? (
            <MessageTab
              draft={draftPatches}
              currentElementKey=""
              onAddMessage={(message, elementKey) => patchManager.stageMessage(message, elementKey)}
              onDiscard={(id) => patchManager.discard(id)}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6">
              <span className="text-3xl mb-2 opacity-30">⊕</span>
              <span className="text-bv-text-mid text-[12px]">Click an element to inspect</span>
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
        <div className="flex items-start justify-between gap-2">
          <div className="font-[family-name:var(--font-display)] font-bold text-[13px] text-bv-text leading-tight">
            {elementData.componentName}{' '}
            <span className="font-[family-name:var(--font-ui)] font-normal text-bv-text-mid">
              — {elementData.instanceCount} instance{elementData.instanceCount !== 1 ? 's' : ''} on this page
            </span>
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

