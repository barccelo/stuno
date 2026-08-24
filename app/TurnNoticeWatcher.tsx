"use client";

import { useEffect, useRef, useState } from "react";

export default function TurnNoticeWatcher() {
  const [visible, setVisible] = useState(false);
  const wasMyTurn = useRef(false);
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    const show = () => {
      setVisible(true);
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setVisible(false), 1550);
    };

    const evaluate = () => {
      const labels = Array.from(document.querySelectorAll(".turn-center strong"));
      const isMyTurn = labels.some((node) => node.textContent?.trim() === "Tu turno");

      if (isMyTurn && !wasMyTurn.current) show();
      wasMyTurn.current = isMyTurn;
    };

    evaluate();

    // React updates normally trigger this observer. The short interval is an
    // additional safeguard for mobile browsers where a DOM mutation can be
    // coalesced while the tab or viewport is settling.
    const observer = new MutationObserver(evaluate);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    const interval = window.setInterval(evaluate, 180);

    return () => {
      observer.disconnect();
      window.clearInterval(interval);
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
    <div className="turn-notice-fallback" role="status" aria-live="assertive">
      <strong>¡Te toca!</strong>
    </div>
  );
}
