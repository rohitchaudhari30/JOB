import { useEffect } from 'react';
import { setUnsavedGuard } from '../utils/unsavedGuard';

const MESSAGE = 'You have unsaved changes. Leave this page and discard them?';

/** While `dirty`, warn on tab close/reload and on in-app navigation (see utils/unsavedGuard). */
export function useUnsavedChanges(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) {
      setUnsavedGuard(null);
      return;
    }
    setUnsavedGuard(MESSAGE);
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      setUnsavedGuard(null);
    };
  }, [dirty]);
}
