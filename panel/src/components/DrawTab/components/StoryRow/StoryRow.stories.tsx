import type { Meta, StoryObj } from '@storybook/react';
import { StoryRow } from './StoryRow';

const story = { id: 'components-badge--blue', title: 'Components/Badge', name: 'Blue' };
const iframeSrc = 'http://localhost:6007/iframe.html?id=components-badge--blue&viewMode=story';

const meta: Meta<typeof StoryRow> = {
  component: StoryRow,
  title: 'Panel/DrawTab/StoryRow',
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <ul style={{ width: 240, listStyle: 'none', padding: 0 }}>
        <Story />
      </ul>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof StoryRow>;

export const Default: Story = {
  args: { story, iframeSrc, storybookUrl: 'http://localhost:6007' },
};
