import type { NavigationInfo } from '../../../../shared/types';

export type NavigationCallback = (info: NavigationInfo) => void;

/**
 * Start intercepting SPA navigations (pushState/replaceState/popstate) and
 * full-page navigations (beforeunload/pagehide).
 * Returns a teardown function that restores all originals.
 *
 * Usage:
 *   const teardown = createNavigationInterceptor(info => handleNav(info));
 *   // ... later ...
 *   teardown();
 */
export function createNavigationInterceptor(callback: NavigationCallback): () => void {
  let lastUrl = window.location.href;

  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = function patchedPushState(data: any, unused: string, url?: string | URL | null) {
    const from = lastUrl;
    originalPushState(data, unused, url);
    const to = window.location.href;
    lastUrl = to;
    callback({ from, to, method: 'pushState' });
  };

  history.replaceState = function patchedReplaceState(data: any, unused: string, url?: string | URL | null) {
    const from = lastUrl;
    originalReplaceState(data, unused, url);
    const to = window.location.href;
    lastUrl = to;
    callback({ from, to, method: 'replaceState' });
  };

  const popstateHandler = () => {
    const from = lastUrl;
    const to = window.location.href;
    lastUrl = to;
    callback({ from, to, method: 'popstate' });
  };
  window.addEventListener('popstate', popstateHandler);

  const beforeUnloadHandler = () => {
    callback({ from: lastUrl, to: null, method: 'full-page' });
  };
  window.addEventListener('beforeunload', beforeUnloadHandler);

  return function teardown() {
    history.pushState = originalPushState;
    history.replaceState = originalReplaceState;
    window.removeEventListener('popstate', popstateHandler);
    window.removeEventListener('beforeunload', beforeUnloadHandler);
  };
}
