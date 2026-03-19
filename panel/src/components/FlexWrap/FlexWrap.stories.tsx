import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { FlexWrap } from './FlexWrap';
import type { FlexWrapValue } from './types';

function Interactive() {
  const [value, setValue] = useState<FlexWrapValue>('flex-nowrap');
  return (
    <div className="flex items-center gap-4 p-6 bg-bv-bg">
      <FlexWrap
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

const meta: Meta<typeof FlexWrap> = {
  component: FlexWrap,
  title: 'Panel/Flex/FlexWrap',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof FlexWrap>;

export const Default: Story = { render: () => <Interactive /> };

export const Nowrap: Story = {
  args: { value: 'flex-nowrap', lockedValue: null, locked: false, onHover: () => {}, onLeave: () => {}, onClick: () => {} },
};

export const Wrap: Story = {
  args: { value: 'flex-wrap', lockedValue: null, locked: false, onHover: () => {}, onLeave: () => {}, onClick: () => {} },
};

export const Locked: Story = {
  args: { value: 'flex-nowrap', lockedValue: null, locked: true, onHover: () => {}, onLeave: () => {}, onClick: () => {} },
};
