import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { DesignCanvas } from './DesignCanvas';

const meta: Meta<typeof DesignCanvas> = {
  title: 'Components/DesignCanvas',
  component: DesignCanvas,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof DesignCanvas>;

function DesignCanvasDemo() {
  const [submitted, setSubmitted] = useState<{ dataUrl: string; width: number; height: number } | null>(null);
  const [closed, setClosed] = useState(false);

  if (closed) {
    return (
      <div className="flex items-center justify-center h-screen bg-[var(--bv-bg)] text-[var(--bv-text)]">
        <div className="text-center">
          <p className="mb-4 text-[var(--bv-text-mid)]">Canvas closed.</p>
          <button
            className="px-4 py-2 bg-[var(--bv-teal)] text-white rounded"
            onClick={() => setClosed(false)}
          >
            Reopen
          </button>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-screen bg-[var(--bv-bg)] p-8">
        <p className="text-[var(--bv-text)]">
          Submitted! ({submitted.width}×{submitted.height}px)
        </p>
        <img src={submitted.dataUrl} alt="Drawing result" className="border border-[var(--bv-border)] max-w-full" />
        <button
          className="px-4 py-2 bg-[var(--bv-teal)] text-white rounded"
          onClick={() => setSubmitted(null)}
        >
          Draw again
        </button>
      </div>
    );
  }

  return (
    <div style={{ width: 600, height: 400, border: '10px solid black' }}>
      <DesignCanvas
        onSubmit={(dataUrl, width, height) => setSubmitted({ dataUrl, width, height })}
        onClose={() => setClosed(true)}
      />
    </div>
  );
}

export const Default: Story = {
  render: () => <DesignCanvasDemo />,
};
