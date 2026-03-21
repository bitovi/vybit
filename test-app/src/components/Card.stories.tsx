import type { Meta, StoryObj } from '@storybook/react';
import { Card } from './Card';

const meta: Meta<typeof Card> = {
  title: 'Components/Card',
  component: Card,
  argTypes: {
    title: { control: 'text' },
    description: { control: 'text' },
    tag: { control: 'text' },
  },
};
export default meta;

export const Default: StoryObj<typeof Card> = {
  args: {
    title: 'Card Title',
    description: 'Card description goes here.',
    tag: 'Tag',
  },
};

export const Design: StoryObj<typeof Card> = {
  args: {
    title: 'Design System',
    description: 'Create consistent, reusable components for your application.',
    tag: 'UI',
  },
};
