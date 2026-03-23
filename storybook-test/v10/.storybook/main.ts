import type { StorybookConfig } from '@storybook/react-vite';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  stories: ['../../../test-app/src/**/*.stories.@(ts|tsx)'],
  addons: [join(__dirname, '../../../storybook-addon')],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
};

export default config;
