import { useEffect, useRef, useState, useCallback } from "react";

interface Options {
  onRefresh: () => void | Promise<void>;
  threshold?: number; // px to trigger
  disabled?: boolean;
}

/**
 * Lightweight pull-to-refresh hook for PWA.
 * Works even when the document root has overflow:hidden by listening
 * to touch events on the window and detecting a downward swipe
 * when the scrollable container is at the top.
 */
export function usePullToRefresh({ onRefresh, threshold = 70, disabled = false }: Options) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const pulling = useRef(false);

  const isAtTop = useCallback(() => {
    // Check all scrollable ancestors + window
    if (window.scrollY > 0) return false;
    const els = document.querySelectorAll(".ptr-scroll-check");
    for (const el of els) {
      if (el.scrollTop > 0) return false;
    }
    // Also check the main scrollable area
    const main = document.querySelector("main");
    if (main && main.scrollTop > 0) return false;
    return true;
  }, []);

  useEffect(() => {
    if (disabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (refreshing) return;
      if (!isAtTop()) {
        startY.current = null;
        return;
      }
      startY.current = e.touches[0].clientY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (startY.current === null || refreshing) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta > 0 && isAtTop()) {
        pulling.current = true;
        // Dampen the pull (resistance)
        const dampened = Math.min(delta * 0.4, threshold * 1.5);
        setPullDistance(dampened);
        // Prevent native scroll bounce only when actively pulling
        if (delta > 10) {
          e.preventDefault();
        }
      }
    };

    const handleTouchEnd = async () => {
      if (!pulling.current) {
        startY.current = null;
        return;
      }
      pulling.current = false;
      startY.current = null;

      if (pullDistance >= threshold) {
        setRefreshing(true);
        setPullDistance(threshold);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
          setPullDistance(0);
        }
      } else {
        setPullDistance(0);
      }
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [onRefresh, threshold, refreshing, disabled, isAtTop, pullDistance]);

  return { pullDistance, refreshing };
}