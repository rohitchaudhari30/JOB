import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { confirmLeave, setUnsavedGuard } from '../utils/unsavedGuard';

afterEach(() => {
  setUnsavedGuard(null);
  vi.restoreAllMocks();
});

describe('unsaved changes guard', () => {
  it('lets you leave when nothing is dirty and never prompts', () => {
    const spy = vi.spyOn(window, 'confirm');
    renderHook(() => useUnsavedChanges(false));
    expect(confirmLeave()).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('asks before leaving when dirty, and respects the answer', () => {
    const spy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderHook(() => useUnsavedChanges(true));
    expect(confirmLeave()).toBe(false);
    expect(confirmLeave()).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('clears the guard on unmount and when it becomes clean', () => {
    const spy = vi.spyOn(window, 'confirm');
    const { rerender, unmount } = renderHook(({ d }) => useUnsavedChanges(d), { initialProps: { d: true } });
    rerender({ d: false });
    expect(confirmLeave()).toBe(true);
    rerender({ d: true });
    unmount();
    expect(confirmLeave()).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('registers a beforeunload warning only while dirty', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const { unmount } = renderHook(() => useUnsavedChanges(true));
    expect(add.mock.calls.some((c) => c[0] === 'beforeunload')).toBe(true);
    const remove = vi.spyOn(window, 'removeEventListener');
    unmount();
    expect(remove.mock.calls.some((c) => c[0] === 'beforeunload')).toBe(true);
  });
});
