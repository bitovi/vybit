const { join } = require('path');

module.exports = {
  previewAnnotations(entry = []) {
    return [...entry, join(__dirname, './preview.ts')];
  },
  managerEntries(entry = []) {
    return [...entry, join(__dirname, './manager.tsx')];
  },
};
