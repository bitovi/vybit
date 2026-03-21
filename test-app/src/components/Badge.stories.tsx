import type { Meta, StoryObj } from '@storybook/react';
import { Badge } from './Badge';

const meta: Meta<typeof Badge> = {
  title: 'Components/Badge',
  component: Badge,
  argTypes: {
    color: { control: 'select', options: ['blue', 'green', 'yellow', 'red', 'gray'] },
    children: { control: 'text' },
  },
};
export default meta;

export const Blue: StoryObj<typeof Badge> = {
  args: { color: 'blue', children: 'New' },
};

export const Green: StoryObj<typeof Badge> = {
  args: { color: 'green', children: 'Active' },
};

export const Yellow: StoryObj<typeof Badge> = {
  args: { color: 'yellow', children: 'Pending' },
};

export const Red: StoryObj<typeof Badge> = {
  args: { color: 'red', children: 'Rejected' },
};

export const Gray: StoryObj<typeof Badge> = {
  args: { color: 'gray', children: 'Draft' },
};
