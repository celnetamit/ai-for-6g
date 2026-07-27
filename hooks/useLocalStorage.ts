import { useCallback, useEffect, useRef, useState } from 'react';

type SetValue<T> = (value: T | ((previous: T) => T)) => void;

/**
 * State backed by `localStorage`, synchronised across tabs.
 *
 * Three properties matter and each fixes a defect in the previous version:
 *
 *  1. **The setter is referentially stable.** It was recreated on every render,
 *     so every `useCallback` in AuthContext / ThemeContext / ProgressContext that
 *     listed it as a dependency was invalidated on every render too. That made
 *     the context values change identity constantly and defeated memoisation
 *     across the whole tree.
 *  2. **Updates read the latest state.** The old setter closed over
 *     `storedValue`, so two updates in the same tick silently lost the first.
 *  3. **Cross-tab sync uses the current initial value**, held in a ref, instead
 *     of a value captured on first render.
 */
function useLocalStorage<T>(key: string, initialValue: T): [T, SetValue<T>] {
  const initialRef = useRef(initialValue);
  initialRef.current = initialValue;

  const read = useCallback((): T => {
    if (typeof window === 'undefined') return initialRef.current;
    try {
      const item = window.localStorage.getItem(key);
      if (item === null) return initialRef.current;
      return JSON.parse(item) as T;
    } catch {
      // Corrupt or non-JSON entry (or storage blocked). Fall back rather than
      // crashing the provider that owns this key.
      return initialRef.current;
    }
  }, [key]);

  const [storedValue, setStoredValue] = useState<T>(read);

  // Mirrors state so the setter can resolve functional updates without listing
  // `storedValue` as a dependency, which is what keeps its identity stable.
  const valueRef = useRef(storedValue);
  valueRef.current = storedValue;

  const setValue = useCallback<SetValue<T>>(
    (value) => {
      const next = value instanceof Function ? value(valueRef.current) : value;
      valueRef.current = next;
      setStoredValue(next);
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Quota exceeded or private mode: keep the in-memory value working.
      }
    },
    [key],
  );

  // Re-read when the key changes, so a remounted hook does not keep stale data.
  useEffect(() => {
    setStoredValue(read());
  }, [read]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      // `key === null` means the whole store was cleared.
      if (event.key !== null && event.key !== key) return;
      if (event.storageArea && event.storageArea !== window.localStorage) return;
      setStoredValue(read());
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key, read]);

  return [storedValue, setValue];
}

export default useLocalStorage;
