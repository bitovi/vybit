import type { Meta, StoryObj } from '@storybook/react';
import { ModeToggle } from './ModeToggle';

const meta: Meta<typeof ModeToggle> = {
  component: ModeToggle,
  title: 'Panel/ModeToggle',
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ModeToggle>;

export const SelectMode: Story = {
  args: {
    mode: 'select',
  },
};

export const InsertMode: Story = {
  args: {
    mode: 'insert',
  },
};

export const BugReportMode: Story = {
  args: {
    mode: 'bug-report',
  },
};

export const NoMode: Story = {
  args: {
    mode: null,
  },
};
