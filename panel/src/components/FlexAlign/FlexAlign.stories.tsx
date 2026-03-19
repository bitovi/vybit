import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { FlexAlign } from './FlexAlign';
import { FlexDirection } from '../FlexDirection';
import type { FlexDirectionValue } from '../FlexDirection';
import type { FlexDirectionCss } from './types';

const DIR_TO_CSS: Record<FlexDirectionValue, FlexDirectionCss> = {
  'flex-row':         'row',
  'flex-col':         'column',
  'flex-row-reverse': 'row-reverse',
  'flex-col-reverse': 'column-reverse',
};

function Interactive() {
  const [dir, setDir] = useState<FlexDirectionValue>('flex-row');
  const [value, setValue] = useState('items-stretch');

  return (
    <div className="p-6 bg-bv-bg flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-mono text-bv-muted uppercase tracking-wide">Direction</span>
        <FlexDirection
          value={dir}
          lockedValue={null}
          locked={false}
          onHover={() => {}}
          onLeave={() => {}}
          onClick={setDir}
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-mono text-bv-muted uppercase tracking-wide">Align</span>
        <FlexAlign
          currentValue={value}
          lockedValue={null}
          locked={false}
          flexDirection={DIR_TO_CSS[dir]}
          onHover={() => {}}
          onLeave={() => {}}
          onClick={setValue}
          onRemove={() => setValue('items-stretch')}
        />
      </div>
      <span className="text-[11px] font-mono text-bv-teal">{value}</span>
    </div>
  );
}

const meta: Meta<typeof FlexAlign> = {
  component: FlexAlign,
  title: 'Panel/Flex/FlexAlign',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof FlexAlign>;

export const Default: Story = { render: () => <Interactive /> };

export const Row: Story = {
  args: {
    currentValue: 'items-stretch', lockedValue: null, locked: false, flexDirection: 'row',
    onHover: () => {}, onLeave: () => {}, onClick: () => {},
  },
};

export const Column: Story = {
  args: {
    currentValue: 'items-center', lockedValue: null, locked: false, flexDirection: 'column',
    onHover: () => {}, onLeave: () => {}, onClick: () => {},
  },
};
