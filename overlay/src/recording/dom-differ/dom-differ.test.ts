import { describe, it, expect } from 'vitest';
import { DomDiffer } from './dom-differ';

const SMALL_HTML = '<html><body><div class="hello">Hello</div></body></html>';
const SMALL_HTML_CHANGED = '<html><body><div class="hello world">Hello World</div></body></html>';

describe('DomDiffer', () => {
  describe('computeDiff', () => {
    it('returns keyframe on first call (no previous DOM)', () => {
      const differ = new DomDiffer();
      const result = differ.computeDiff(SMALL_HTML);

      expect(result.isKeyframe).toBe(true);
      expect(result.fullDom).toBe(SMALL_HTML);
      expect(result.diff).toBeUndefined();
    });

    it('returns keyframe when forceKeyframe is true', () => {
      const differ = new DomDiffer();
      differ.computeDiff(SMALL_HTML); // establish baseline
      const result = differ.computeDiff(SMALL_HTML_CHANGED, true);

      expect(result.isKeyframe).toBe(true);
      expect(result.fullDom).toBe(SMALL_HTML_CHANGED);
    });

    it('returns diff for small changes', () => {
      const differ = new DomDiffer();
      differ.computeDiff(SMALL_HTML);
      const result = differ.computeDiff(SMALL_HTML_CHANGED);

      expect(result.isKeyframe).toBe(false);
      expect(result.diff).toBeTruthy();
      expect(result.fullDom).toBeUndefined();
    });

    it('auto-promotes to keyframe when diff is large', () => {
      const differ = new DomDiffer();
      const original = '<html><body><p>A</p></body></html>';
      differ.computeDiff(original);

      // Totally different DOM — diff will be larger than 50% of new DOM
      const newDom = '<html><body>' + '<div>'.repeat(100) + '</body></html>';
      const result = differ.computeDiff(newDom);

      expect(result.isKeyframe).toBe(true);
      expect(result.fullDom).toBe(newDom);
    });

    it('returns diff when identical (empty diff)', () => {
      const differ = new DomDiffer();
      differ.computeDiff(SMALL_HTML);
      const result = differ.computeDiff(SMALL_HTML);

      // Identical DOMs produce a diff with header but no hunks — still small
      expect(result.isKeyframe).toBe(false);
      expect(result.diff).toBeTruthy();
    });
  });

  describe('reconstructDom', () => {
    it('reconstructs DOM from a keyframe and diffs', () => {
      const differ = new DomDiffer();
      differ.computeDiff(SMALL_HTML);
      const diffResult = differ.computeDiff(SMALL_HTML_CHANGED);

      expect(diffResult.isKeyframe).toBe(false);
      const reconstructed = DomDiffer.reconstructDom(SMALL_HTML, [diffResult.diff!]);
      expect(reconstructed).toBe(SMALL_HTML_CHANGED);
    });

    it('applies multiple sequential diffs', () => {
      const differ = new DomDiffer();
      const step0 = '<html><body><p>Step 0</p></body></html>';
      const step1 = '<html><body><p>Step 1</p></body></html>';
      const step2 = '<html><body><p>Step 2</p></body></html>';

      differ.computeDiff(step0);
      const diff1 = differ.computeDiff(step1);
      const diff2 = differ.computeDiff(step2);

      expect(diff1.isKeyframe).toBe(false);
      expect(diff2.isKeyframe).toBe(false);

      const reconstructed = DomDiffer.reconstructDom(step0, [diff1.diff!, diff2.diff!]);
      expect(reconstructed).toBe(step2);
    });

    it('returns base DOM when no diffs', () => {
      const result = DomDiffer.reconstructDom(SMALL_HTML, []);
      expect(result).toBe(SMALL_HTML);
    });

    it('throws on impossible diff application', () => {
      // Create a real diff that conflicts with a different base DOM
      const differ2 = new DomDiffer();
      differ2.computeDiff('<html><body>AAAA</body></html>');
      const result = differ2.computeDiff('<html><body>BBBB</body></html>');
      // Apply this diff to a completely different base — applyPatch returns false
      const differentBase = '<totally><different>DOM</different></totally>';
      expect(() => {
        DomDiffer.reconstructDom(differentBase, [result.diff!]);
      }).toThrow('Failed to apply DOM diff');
    });
  });

  describe('reset', () => {
    it('makes next computeDiff return a keyframe', () => {
      const differ = new DomDiffer();
      differ.computeDiff(SMALL_HTML);
      differ.reset();
      const result = differ.computeDiff(SMALL_HTML_CHANGED);

      expect(result.isKeyframe).toBe(true);
    });
  });

  describe('setBaseline', () => {
    it('sets baseline for next diff computation', () => {
      const differ = new DomDiffer();
      differ.setBaseline(SMALL_HTML);
      const result = differ.computeDiff(SMALL_HTML_CHANGED);

      expect(result.isKeyframe).toBe(false);
      expect(result.diff).toBeTruthy();
    });
  });
});
