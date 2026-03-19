import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { CornerModel } from './CornerModel';
import type { CornerModelState, SlotKey } from './types';

const RADIUS_SCALE = [
  'rounded-none',
  'rounded-sm',
  'rounded',
  'rounded-md',
  'rounded-lg',
  'rounded-xl',
  'rounded-2xl',
  'rounded-3xl',
  'rounded-full',
];

/** Build scale values scoped to a corner or side (e.g. "rounded-tl-lg") */
function cornerScale(prefix: string) {
  return [
    `${prefix}-none`,
    `${prefix}-sm`,
    prefix, // bare = md
    `${prefix}-md`,
    `${prefix}-lg`,
    `${prefix}-xl`,
    `${prefix}-2xl`,
    `${prefix}-3xl`,
    `${prefix}-full`,
  ];
}

/** Build a full CornerModelState with scale values on every slot */
function makeState(overrides: Partial<{
  all: string | null;
  t: string | null; r: string | null; b: string | null; l: string | null;
  tl: string | null; tr: string | null; br: string | null; bl: string | null;
}>): CornerModelState {
  return {
    shorthandValue: overrides.all ?? null,
    shorthandScaleValues: RADIUS_SCALE,
    slots: [
      { key: 'all', value: overrides.all ?? null, placeholder: 'all', scaleValues: RADIUS_SCALE },
      { key: 't',  value: overrides.t  ?? null, placeholder: 't',  scaleValues: cornerScale('rounded-t') },
      { key: 'r',  value: overrides.r  ?? null, placeholder: 'r',  scaleValues: cornerScale('rounded-r') },
      { key: 'b',  value: overrides.b  ?? null, placeholder: 'b',  scaleValues: cornerScale('rounded-b') },
      { key: 'l',  value: overrides.l  ?? null, placeholder: 'l',  scaleValues: cornerScale('rounded-l') },
      { key: 'tl', value: overrides.tl ?? null, placeholder: 'tl', scaleValues: cornerScale('rounded-tl') },
      { key: 'tr', value: overrides.tr ?? null, placeholder: 'tr', scaleValues: cornerScale('rounded-tr') },
      { key: 'br', value: overrides.br ?? null, placeholder: 'br', scaleValues: cornerScale('rounded-br') },
      { key: 'bl', value: overrides.bl ?? null, placeholder: 'bl', scaleValues: cornerScale('rounded-bl') },
    ],
  };
}

const meta: Meta<typeof CornerModel> = {
  component: CornerModel,
  title: 'Panel/CornerModel',
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div style={{ padding: 32, fontFamily: "'Inter', sans-serif", background: '#f8f8f8', display: 'inline-block' }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof CornerModel>;

/* ══════════════════════════════════════════════════════════
   Empty — no radius applied
   ══════════════════════════════════════════════════════════ */
export const Empty: Story = {
  args: { state: makeState({}) },
};

/* ══════════════════════════════════════════════════════════
   Shorthand — rounded-lg
   ══════════════════════════════════════════════════════════ */
export const Shorthand: Story = {
  args: { state: makeState({ all: 'rounded-lg' }) },
};

/* ══════════════════════════════════════════════════════════
   Full pill — rounded-full
   ══════════════════════════════════════════════════════════ */
export const FullPill: Story = {
  args: { state: makeState({ all: 'rounded-full' }) },
};

/* ══════════════════════════════════════════════════════════
   Top side only — rounded-t-lg
   ══════════════════════════════════════════════════════════ */
export const TopSide: Story = {
  args: { state: makeState({ t: 'rounded-t-lg' }) },
};

/* ══════════════════════════════════════════════════════════
   Mixed corners — different values per corner
   ══════════════════════════════════════════════════════════ */
export const MixedCorners: Story = {
  args: {
    state: makeState({
      tl: 'rounded-tl-xl',
      tr: 'rounded-tr-sm',
      br: 'rounded-br-full',
      bl: 'rounded-bl-none',
    }),
  },
};

/* ══════════════════════════════════════════════════════════
   Interactive — stateful with console logging
   ══════════════════════════════════════════════════════════ */
function InteractiveDemo() {
  const [state, setState] = useState<CornerModelState>(makeState({ all: 'rounded-md' }));

  const handleChange = (key: SlotKey, value: string) => {
    setState(prev => ({
      ...prev,
      shorthandValue: key === 'all' ? value : prev.shorthandValue,
      slots: prev.slots.map(s =>
        s.key === key ? { ...s, value } : s
      ),
    }));
  };

  const handleRemove = (key: SlotKey) => {
    setState(prev => ({
      ...prev,
      shorthandValue: key === 'all' ? null : prev.shorthandValue,
      slots: prev.slots.map(s =>
        s.key === key ? { ...s, value: null } : s
      ),
    }));
  };

  return (
    <CornerModel
      state={state}
      onSlotChange={handleChange}
      onSlotRemove={handleRemove}
    />
  );
}

export const Interactive: Story = {
  render: () => <InteractiveDemo />,
};

/* ══════════════════════════════════════════════════════════
   Frozen — locked while another editor is active
   ══════════════════════════════════════════════════════════ */
export const Frozen: Story = {
  args: {
    state: makeState({ all: 'rounded-lg' }),
    frozen: true,
  },
};

/* ══════════════════════════════════════════════════════════
   Side demo — show how each side controls two corners
   ══════════════════════════════════════════════════════════ */
export const SidesDemo: Story = {
  args: {
    state: makeState({
      t: 'rounded-t-2xl',
      r: 'rounded-r-sm',
    }),
  },
};
