import type { Meta, StoryObj } from '@storybook/react';
import { DrawTab } from './DrawTab';

const meta: Meta<typeof DrawTab> = {
  component: DrawTab,
  title: 'Panel/DrawTab',
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  decorators: [
    (Story) => (
      <div style={{ width: 280 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof DrawTab>;

export const Default: Story = {
  args: {},
};
