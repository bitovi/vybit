import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { FlexDirection } from './FlexDirection';
import type { FlexDirectionValue } from './types';

function Interactive() {
  const [value, setValue] = useState<FlexDirectionValue>('flex-row');
  return (
    <div className="flex items-center gap-4 p-6 bg-bv-bg">
      <FlexDirection
        value={value}
        lockedValue={null}
        locked={false}
        onHover={() => {}}
        onLeave={() => {}}
        onClick={setValue}
      />
      <span className="text-[11px] font-mono text-bv-teal">{value}</span>
    </div>
  );
}

const meta: Meta<typeof FlexDirection> = {
  component: FlexDirection,
  title: 'Panel/Flex/FlexDirection',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof FlexDirection>;

export const Default: Story = { render: () => <Interactive /> };

export const Row: Story = {
  args: { value: 'flex-row', lockedValue: null, locked: false, onHover: () => {}, onLeave: () => {}, onClick: () => {} },
};

export const Col: Story = {
  args: { value: 'flex-col', lockedValue: null, locked: false, onHover: () => {}, onLeave: () => {}, onClick: () => {} },
};

export const Locked: Story = {
  args: { value: 'flex-row', lockedValue: null, locked: true, onHover: () => {}, onLeave: () => {}, onClick: () => {} },
};
