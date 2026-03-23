import type { StorybookConfig } from '@storybook/react-vite';
import { join } from 'path';

const config: StorybookConfig = {
  stories: ['../../../test-app/src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-essentials', join(__dirname, '../../../storybook-addon')],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
};

export default config;
