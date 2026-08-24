"use client";

import { useEffect, useRef, useState } from "react";

export default function TurnNoticeWatcher() {
  const [visible, setVisible] = useState(false);
  const wasMyTurn = useRef(false);
  const showTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    const evaluate = () => {
      const label = document.querySelector(".turn-center strong");
      const isMyTurn = label?.textContent?.trim() === "Tu turno";

      if (isMyTurn && !wasMyTurn.current) {
        if (showTimer.current !== null) window.clearTimeout(showTimer.current);
        showTimer.current = window.setTimeout(() => {
          if (!document.querySelector(".turn-notice")) {
            setVisible(true);
            if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
            hideTimer.current = window.setTimeout(() => setVisible(false), 1600);
          }
        }, 100);
      }

      wasMyTurn.current = isMyTurn;
    };

    evaluate();
    const observer = new MutationObserver(evaluate);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
      if (showTimer.current !== null) window.clearTimeout(showTimer.current);
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".turn-notice-fallback")) setVisible(false);
    };
    document.addEventListener("pointerdown", dismiss, true);
    return () => document.removeEventListener("pointerdown", dismiss, true);
  }, [visible]);

  if (!visible) return null;

  return (
    <button
      type="button"
      className="turn-notice-fallback"
      onClick={() => setVisible(false)}
      aria-live="assertive"
    >
      ¡Te toca!
    </button>
  );
}
