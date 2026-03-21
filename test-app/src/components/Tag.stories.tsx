import type { Meta, StoryObj } from '@storybook/react';
import { Tag } from './Tag';

const meta: Meta<typeof Tag> = {
  title: 'Components/Tag',
  component: Tag,
  argTypes: {
    color: { control: 'select', options: ['blue', 'red', 'green'] },
    children: { control: 'text' },
  },
};
export default meta;

export const Blue: StoryObj<typeof Tag> = {
  args: { color: 'blue', children: 'Design' },
};

export const Red: StoryObj<typeof Tag> = {
  args: { color: 'red', children: 'Bug' },
};

export const Green: StoryObj<typeof Tag> = {
  args: { color: 'green', children: 'Feature' },
};
