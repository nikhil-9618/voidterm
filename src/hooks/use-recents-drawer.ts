'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const EDGE_ZONE = 28;
const OPEN_THRESHOLD = 0.35;

type DragState = {
  startX: number;
  startY: number;
  startProgress: number;
  progress: number;
  lastX: number;
  lastT: number;
  startT: number;
  horizontal: boolean;
};

/**
 * Edge-swipe controller for the mobile recents drawer.
 *
 * A right swipe that starts within 28px of the left edge opens the drawer,
 * matching the gesture used by native chat apps. While the drawer is open,
 * a left swipe closes it. The hook deliberately waits for horizontal intent
 * so vertical conversation scrolling and code-block scrolling keep working.
 */
export function useRecentsDrawer(open: boolean, setOpen: (next: boolean) => void) {
  const drawerRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [progress, setProgress] = useState(open ? 1 : 0);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragRef.current) setProgress(open ? 1 : 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const onStart = useCallback(
    (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (!open && touch.clientX > EDGE_ZONE) return;

      dragRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        startProgress: open ? 1 : 0,
        progress: open ? 1 : 0,
        lastX: touch.clientX,
        lastT: performance.now(),
        startT: performance.now(),
        horizontal: false,
      };
      setProgress(open ? 1 : 0);
    },
    [open],
  );

  const onMove = useCallback(
    (event: TouchEvent) => {
      const drag = dragRef.current;
      if (!drag || event.touches.length !== 1) return;

      const touch = event.touches[0];
      const dx = touch.clientX - drag.startX;
      const dy = touch.clientY - drag.startY;

      if (!drag.horizontal) {
        if (Math.abs(dx) < 8) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          dragRef.current = null;
          setDragging(false);
          setProgress(open ? 1 : 0);
          return;
        }
        drag.horizontal = true;
        setDragging(true);
      }

      const width =
        drawerRef.current?.offsetWidth ?? Math.min(340, window.innerWidth * 0.86);
      drag.progress = Math.min(1, Math.max(0, drag.startProgress + dx / width));
      drag.lastX = touch.clientX;
      drag.lastT = performance.now();
      setProgress(drag.progress);
      if (event.cancelable) event.preventDefault();
    },
    [open],
  );

  const onEnd = useCallback(() => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    setDragging(false);
    if (!drag.horizontal) return;

    const elapsed = Math.max(1, drag.lastT - drag.startT);
    const velocity = (drag.lastX - drag.startX) / elapsed;
    const shouldOpen =
      drag.progress >= OPEN_THRESHOLD || (velocity > 0.25 && drag.progress > 0.05);
    setOpen(shouldOpen);
    setProgress(shouldOpen ? 1 : 0);
  }, [setOpen]);

  useEffect(() => {
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [onStart, onMove, onEnd]);

  return { drawerRef, progress, dragging };
}
