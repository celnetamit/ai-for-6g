/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import useLocalStorage from '../hooks/useLocalStorage';

beforeEach(() => localStorage.clear());

describe('useLocalStorage', () => {
  it('returns the initial value when nothing is stored', () => {
    const { result } = renderHook(() => useLocalStorage('missing', 'fallback'));
    expect(result.current[0]).toBe('fallback');
  });

  it('reads an existing value', () => {
    localStorage.setItem('theme', JSON.stringify('light'));
    const { result } = renderHook(() => useLocalStorage<'light' | 'dark'>('theme', 'dark'));
    expect(result.current[0]).toBe('light');
  });

  it('persists updates', () => {
    const { result } = renderHook(() => useLocalStorage('count', 0));
    act(() => result.current[1](7));
    expect(result.current[0]).toBe(7);
    expect(JSON.parse(localStorage.getItem('count')!)).toBe(7);
  });

  it('supports functional updates', () => {
    const { result } = renderHook(() => useLocalStorage('count', 1));
    act(() => result.current[1]((previous) => previous + 4));
    expect(result.current[0]).toBe(5);
  });

  /**
   * The setter used to close over `storedValue`, so two updates in one tick both
   * read the pre-update value and the first was silently lost.
   */
  it('does not drop updates batched into a single tick', () => {
    const { result } = renderHook(() => useLocalStorage('count', 0));
    act(() => {
      result.current[1]((previous) => previous + 1);
      result.current[1]((previous) => previous + 1);
      result.current[1]((previous) => previous + 1);
    });
    expect(result.current[0]).toBe(3);
  });

  /**
   * The setter used to be recreated on every render, which invalidated every
   * `useCallback` in the contexts that depend on it and defeated memoisation
   * across the whole app.
   */
  it('keeps a stable setter identity across renders', () => {
    const { result, rerender } = renderHook(() => useLocalStorage('stable', 0));
    const first = result.current[1];
    rerender();
    rerender();
    expect(result.current[1]).toBe(first);
  });

  it('falls back to the initial value when the stored JSON is corrupt', () => {
    localStorage.setItem('broken', '{not json');
    const { result } = renderHook(() => useLocalStorage('broken', 'safe'));
    expect(result.current[0]).toBe('safe');
  });

  it('round-trips objects', () => {
    const initial = { completedLessons: [] as string[] };
    const { result } = renderHook(() => useLocalStorage('progress', initial));
    act(() => result.current[1]({ completedLessons: ['m1-l1'] }));
    expect(result.current[0].completedLessons).toEqual(['m1-l1']);

    const { result: reread } = renderHook(() => useLocalStorage('progress', initial));
    expect(reread.current[0].completedLessons).toEqual(['m1-l1']);
  });

  it('syncs when another tab writes the same key', () => {
    const { result } = renderHook(() => useLocalStorage('theme', 'dark'));
    act(() => {
      localStorage.setItem('theme', JSON.stringify('light'));
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'theme',
          newValue: JSON.stringify('light'),
          storageArea: localStorage,
        }),
      );
    });
    expect(result.current[0]).toBe('light');
  });

  it('ignores storage events for unrelated keys', () => {
    const { result } = renderHook(() => useLocalStorage('theme', 'dark'));
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'somethingElse',
          newValue: '"light"',
          storageArea: localStorage,
        }),
      );
    });
    expect(result.current[0]).toBe('dark');
  });

  it('resets to the initial value when the whole store is cleared', () => {
    localStorage.setItem('theme', JSON.stringify('light'));
    const { result } = renderHook(() => useLocalStorage('theme', 'dark'));
    expect(result.current[0]).toBe('light');

    act(() => {
      localStorage.clear();
      window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: localStorage }));
    });
    expect(result.current[0]).toBe('dark');
  });
});
