
import { useState, useEffect } from 'react';

// FIX: Removed trailing comma from <T,> to <T> as this is a function declaration, not an arrow function.
function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }
    try {
      const item = window.localStorage.getItem(key);
      if (item === null) return initialValue;
      try {
        return JSON.parse(item);
      } catch {
        return item as unknown as T;
      }
    } catch (error) {
      console.error('Error reading from localStorage', error);
      return initialValue;
    }
  });

  // FIX: Correctly type the `value` parameter to allow for functional updates.
  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.error('Error writing to localStorage', error);
    }
  };

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key) {
        try {
            if (e.newValue) {
                try {
                    setStoredValue(JSON.parse(e.newValue));
                } catch {
                    setStoredValue(e.newValue as unknown as T);
                }
            } else {
                setStoredValue(initialValue);
            }
        } catch(error) {
            console.error('Error parsing storage change', error)
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [storedValue, setValue];
}

export default useLocalStorage;
