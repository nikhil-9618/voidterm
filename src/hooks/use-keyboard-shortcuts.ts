'use client';

import { useEffect } from 'react';

export type ShortcutDefinition = {
  /** Lower-case `event.key`, e.g. 'k', '/', 'escape'. */
  key: string;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** Allow the shortcut while focus is inside an input/textarea. */
  allowInInput?: boolean;
  handler: (event: KeyboardEvent) => void;
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/**
 * Global keyboard bindings. `meta` matches both Cmd (macOS) and Ctrl
 * (Windows/Linux) so the interface is keyboard-identical across platforms.
 */
export function useKeyboardShortcuts(
  shortcuts: ShortcutDefinition[],
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) continue;

        const metaPressed = event.metaKey || event.ctrlKey;
        if (Boolean(shortcut.meta) !== metaPressed) continue;
        if (Boolean(shortcut.shift) !== event.shiftKey) continue;
        if (Boolean(shortcut.alt) !== event.altKey) continue;
        if (!shortcut.allowInInput && isEditableTarget(event.target)) continue;

        event.preventDefault();
        shortcut.handler(event);
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shortcuts, enabled]);
}
