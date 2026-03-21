import type { Meta, StoryObj } from '@storybook/react';
import { ComponentGroupItem } from './ComponentGroupItem';
import type { ComponentGroup } from '../../types';

const groupNoArgs: ComponentGroup = {
  name: 'Button',
  stories: [
    { id: 'components-button--primary', title: 'Components/Button', name: 'Primary' },
    { id: 'components-button--secondary', title: 'Components/Button', name: 'Secondary' },
  ],
  argTypes: {},
};

const groupWithArgs: ComponentGroup = {
  name: 'Badge',
  stories: [
    { id: 'components-badge--blue', title: 'Components/Badge', name: 'Blue' },
    { id: 'components-badge--green', title: 'Components/Badge', name: 'Green' },
  ],
  argTypes: {
    color: { control: 'select', options: ['blue', 'green', 'yellow', 'red', 'gray'] },
    children: { control: 'text' },
  },
};

const meta: Meta<typeof ComponentGroupItem> = {
  component: ComponentGroupItem,
  title: 'Panel/DrawTab/ComponentGroupItem',
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ul style={{ width: 260, listStyle: 'none', padding: 0 }}>
        <Story />
      </ul>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ComponentGroupItem>;

export const NoArgs: Story = {
  args: { group: groupNoArgs },
};

export const WithArgs: Story = {
  args: { group: groupWithArgs },
};
