import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ShadowEditor } from './ShadowEditor';
import type { ShadowLayerState } from './types';

const meta: Meta<typeof ShadowEditor> = {
  component: ShadowEditor,
  title: 'Panel/ShadowEditor',
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div style={{ background: '#1e1e1e', padding: 32 }}>
        <div
          style={{
            width: 340,
            background: '#2c2c2c',
            border: '1px solid #4a4a4a',
            borderRadius: 8,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          }}
        >
          <div style={{ padding: 12 }}>
            <div className="flex items-center gap-[5px] mb-2.5">
              <span className="w-[5px] h-[5px] rounded-full bg-bv-teal opacity-50" />
              <span className="text-[9px] font-semibold uppercase tracking-[1px] text-bv-text-mid font-mono flex-1">
                Shadows & Rings
              </span>
            </div>
            <Story />
          </div>
        </div>
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ShadowEditor>;

// ── Layer fixtures ─────────────────────────────────────────────────

const shadowLg: ShadowLayerState = {
  type: 'shadow',
  sizeClass: 'shadow-lg',
  colorClass: 'shadow-blue-500',
  colorHex: '#3b82f6',
  opacity: 50,
  isNone: false,
};

const insetShadowSm: ShadowLayerState = {
  type: 'inset-shadow',
  sizeClass: 'inset-shadow-sm',
  colorClass: null,
  colorHex: null,
  opacity: null,
  isNone: false,
};

const ring2: ShadowLayerState = {
  type: 'ring',
  sizeClass: 'ring-2',
  colorClass: 'ring-red-600',
  colorHex: '#dc2626',
  opacity: null,
  isNone: false,
};

const ring2Indigo: ShadowLayerState = {
  type: 'ring',
  sizeClass: 'ring-2',
  colorClass: 'ring-indigo-500',
  colorHex: '#6366f1',
  opacity: 80,
  isNone: false,
};

const insetRing1: ShadowLayerState = {
  type: 'inset-ring',
  sizeClass: 'inset-ring-1',
  colorClass: 'inset-ring-gray-400',
  colorHex: '#9ca3af',
  opacity: null,
  isNone: false,
};

const shadowNone: ShadowLayerState = {
  type: 'shadow',
  sizeClass: 'shadow-none',
  colorClass: null,
  colorHex: null,
  opacity: null,
  isNone: true,
};

// ── Interactive wrapper ────────────────────────────────────────────

function InteractiveShadowEditor({ initialLayers }: { initialLayers: ShadowLayerState[] }) {
  const [layers, setLayers] = useState<ShadowLayerState[]>(initialLayers);

  function applyChange(oldClass: string, newClass: string) {
    setLayers(prev => prev.map(layer => {
      const classes = [layer.sizeClass, layer.colorClass].filter(Boolean);
      if (!classes.includes(oldClass)) return layer;
      const updated = { ...layer };
      if (layer.sizeClass === oldClass) updated.sizeClass = newClass || null;
      if (layer.colorClass === oldClass) {
        const base = newClass.split('/')[0];
        const opacityMatch = newClass.match(/\/(\d+)$/);
        updated.colorClass = newClass || null;
        updated.opacity = opacityMatch ? parseInt(opacityMatch[1]) : null;
        // Keep colorHex as-is (would be resolved by the real panel)
        updated.colorHex = newClass ? layer.colorHex : null;
      }
      return updated;
    }));
  }

  return (
    <ShadowEditor
      layers={layers}
      onPreview={() => {}}
      onRevert={() => {}}
      onStage={applyChange}
      onAdd={(defaultClass) => {
        const type = defaultClass.startsWith('inset-shadow') ? 'inset-shadow'
          : defaultClass.startsWith('inset-ring') ? 'inset-ring'
          : defaultClass.startsWith('ring') ? 'ring'
          : 'shadow';
        setLayers(prev => [...prev, {
          type: type as ShadowLayerState['type'],
          sizeClass: defaultClass,
          colorClass: null,
          colorHex: null,
          opacity: null,
          isNone: false,
        }]);
      }}
      onRemove={(classes) => {
        setLayers(prev => prev.filter(layer =>
          !classes.includes(layer.sizeClass ?? '') && !classes.includes(layer.colorClass ?? '')
        ));
      }}
      onRemoveHover={() => {}}
    />
  );
}

// ── Stories ─────────────────────────────────────────────────────────

/** ① All four layers active — fully interactive */
export const AllLayersActive: Story = {
  render: () => <InteractiveShadowEditor initialLayers={[shadowLg, insetShadowSm, ring2, insetRing1]} />,
};

/** ② Only shadow + ring, others as ghost rows */
export const PartialLayers: Story = {
  render: () => <InteractiveShadowEditor initialLayers={[{ ...shadowLg, sizeClass: 'shadow-md', opacity: null }, ring2Indigo]} />,
};

/** ③ Shadow set to "none" — controls disabled but row visible */
export const ShadowNone: Story = {
  render: () => <InteractiveShadowEditor initialLayers={[shadowNone, ring2]} />,
};

/** ④ Ring only — shadow + inset types are ghost rows */
export const RingOnly: Story = {
  render: () => <InteractiveShadowEditor initialLayers={[ring2]} />,
};

/** ⑤ No layers at all — all ghost rows with [+] buttons */
export const Empty: Story = {
  render: () => <InteractiveShadowEditor initialLayers={[]} />,
};

/** ⑥ Shadow with 50% opacity */
export const WithOpacity: Story = {
  render: () => <InteractiveShadowEditor initialLayers={[{ ...shadowLg, opacity: 50 }, insetRing1]} />,
};

/** ⑦ Text Shadow active */
export const TextShadowActive: Story = {
  render: () => <InteractiveShadowEditor initialLayers={[{
    type: 'text-shadow',
    sizeClass: 'text-shadow-md',
    colorClass: 'text-shadow-blue-500',
    colorHex: '#3b82f6',
    opacity: null,
    isNone: false,
  }]} />,
};

/** ⑧ Text Shadow only — no explicit color, all other rows are ghosts */
export const TextShadowDefault: Story = {
  render: () => <InteractiveShadowEditor initialLayers={[{
    type: 'text-shadow',
    sizeClass: 'text-shadow-sm',
    colorClass: null,
    colorHex: null,
    opacity: null,
    isNone: false,
  }]} />,
};
