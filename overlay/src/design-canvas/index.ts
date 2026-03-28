export { VbDesignCanvas } from './vb-design-canvas';

import { VbDesignCanvas } from './vb-design-canvas';

if (!customElements.get('vb-design-canvas')) {
  customElements.define('vb-design-canvas', VbDesignCanvas);
}
