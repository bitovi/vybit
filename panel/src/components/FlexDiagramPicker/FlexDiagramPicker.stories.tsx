import type { Meta, StoryObj } from '@storybook/react';
import { JustifyDiagrams } from './JustifyDiagrams';
import { AlignDiagrams } from './AlignDiagrams';
import type { FlexDirectionCss } from './JustifyDiagrams';

const DIRECTIONS: FlexDirectionCss[] = ['row', 'column', 'row-reverse', 'column-reverse'];
const JUSTIFY_VALUES = ['justify-start', 'justify-center', 'justify-stretch', 'justify-between', 'justify-around', 'justify-evenly', 'justify-end'];
const ALIGN_VALUES   = ['items-start', 'items-center', 'items-baseline', 'items-stretch', 'items-end'];

type DiagramArgs = { flexDirection: FlexDirectionCss; activeValue: string };

const meta: Meta<DiagramArgs> = {
  title: 'Panel/Flex/FlexDiagrams',
  argTypes: {
    flexDirection: { control: { type: 'radio' }, options: DIRECTIONS },
  },
};
export default meta;
type Story = StoryObj<DiagramArgs>;

const wrap = { padding: 24, background: '#EAECED' };

export const JustifyDiagramsStory: Story = {
  name: 'Justify Diagrams',
  args: { flexDirection: 'row', activeValue: 'justify-start' },
  argTypes: {
    activeValue: { control: { type: 'select' }, options: JUSTIFY_VALUES },
  },
  render: ({ flexDirection, activeValue }) => (
    <div style={wrap}>
      <JustifyDiagrams flexDirection={flexDirection} activeValue={activeValue} />
    </div>
  ),
};

export const AlignDiagramsStory: Story = {
  name: 'Align Diagrams',
  args: { flexDirection: 'row', activeValue: 'items-stretch' },
  argTypes: {
    activeValue: { control: { type: 'select' }, options: ALIGN_VALUES },
  },
  render: ({ flexDirection, activeValue }) => (
    <div style={wrap}>
      <AlignDiagrams flexDirection={flexDirection} activeValue={activeValue} />
    </div>
  ),
};


