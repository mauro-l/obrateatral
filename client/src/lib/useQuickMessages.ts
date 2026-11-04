import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'obrateatral:quick-messages:v1';
export const DEFAULT_QUICK_MESSAGES = ['Ya vuelvo', 'Espera 5', 'Pongo play'];
export const MAX_CUSTOM_QUICK_MESSAGES = 8;
export const MAX_QUICK_MESSAGE_LENGTH = 80;

function readCustomMessages(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(parsed)) return [];

    const uniqueMessages: string[] = [];
    for (const value of parsed) {
      if (typeof value !== 'string') continue;
      const message = value.trim();
      if (
        message &&
        message.length <= MAX_QUICK_MESSAGE_LENGTH &&
        !DEFAULT_QUICK_MESSAGES.some(
          (preset) => preset.toLocaleLowerCase() === message.toLocaleLowerCase(),
        ) &&
        !uniqueMessages.some((existing) => existing.toLocaleLowerCase() === message.toLocaleLowerCase())
      ) {
        uniqueMessages.push(message);
      }
      if (uniqueMessages.length === MAX_CUSTOM_QUICK_MESSAGES) break;
    }
    return uniqueMessages;
  } catch {
    return [];
  }
}

export function useQuickMessages() {
  const [customMessages, setCustomMessages] = useState(readCustomMessages);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(customMessages));
    } catch {
      // Custom messages remain usable for the current page when storage is unavailable.
    }
  }, [customMessages]);

  const addCustomMessage = useCallback(
    (value: string) => {
      const message = value.trim();
      if (
        !message ||
        message.length > MAX_QUICK_MESSAGE_LENGTH ||
        customMessages.length >= MAX_CUSTOM_QUICK_MESSAGES ||
        DEFAULT_QUICK_MESSAGES.some(
          (preset) => preset.toLocaleLowerCase() === message.toLocaleLowerCase(),
        ) ||
        customMessages.some((existing) => existing.toLocaleLowerCase() === message.toLocaleLowerCase())
      ) {
        return false;
      }

      setCustomMessages((current) => [...current, message]);
      return true;
    },
    [customMessages],
  );

  const removeCustomMessage = useCallback((message: string) => {
    setCustomMessages((current) => current.filter((item) => item !== message));
  }, []);

  return { customMessages, addCustomMessage, removeCustomMessage };
}
