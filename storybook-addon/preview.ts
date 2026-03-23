import { addons } from '@storybook/preview-api';

let injected = false;

export const decorators = [
  (StoryFn: any, context: any) => {
    const serverUrl =
      context.parameters?.vybit?.serverUrl ?? 'http://localhost:3333';

    if (!injected) {
      const script = document.createElement('script');
      script.src = `${serverUrl}/overlay.js`;
      document.head.appendChild(script);
      injected = true;
    }

    return StoryFn();
  },
];

const channel = addons.getChannel();
let lastStoryId: string | undefined;

channel.on('storyRendered', (storyId?: string) => {
  // Only reset selection on actual story navigation, not HMR updates
  if (storyId && storyId === lastStoryId) return;
  lastStoryId = storyId;
  window.postMessage({ type: 'STORYBOOK_STORY_RENDERED' }, '*');
});
