const { join } = require('path');

// Detect SB major version to choose the right entry points.
// SB10 consolidates imports under 'storybook/*'; SB8 uses '@storybook/*'.
let sbMajor = 8;
try {
  const sbPkgPath = require.resolve('storybook/package.json', { paths: [process.cwd()] });
  const ver = require(sbPkgPath).version;
  sbMajor = parseInt(ver.split('.')[0], 10);
} catch { /* default to 8 */ }

const managerFile = sbMajor >= 10 ? './manager-v10.tsx' : './manager.tsx';
const previewFile = sbMajor >= 10 ? './preview-v10.ts' : './preview.ts';

module.exports = {
  managerEntries(entry = []) {
    return [...entry, join(__dirname, managerFile)];
  },
  previewAnnotations(entry = []) {
    return [...entry, join(__dirname, previewFile)];
  },
};
