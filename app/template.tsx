"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export default function Template({ children }: { children: ReactNode }) {
  const [showTurnNotice, setShowTurnNotice] = useState(false);
  const wasMyTurn = useRef(false);
  const hideTimer = useRef<number | null>(null);
  const showTimer = useRef<number | null>(null);

  useEffect(() => {
    const clearTimers = () => {
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
      if (showTimer.current !== null) window.clearTimeout(showTimer.current);
      hideTimer.current = null;
      showTimer.current = null;
    };

    const evaluateTurn = () => {
      const labels = Array.from(document.querySelectorAll(".turn-center strong"));
      const isMyTurn = labels.some((node) => node.textContent?.trim() === "Tu turno");

      if (isMyTurn && !wasMyTurn.current) {
        if (showTimer.current !== null) window.clearTimeout(showTimer.current);
        showTimer.current = window.setTimeout(() => {
          // page.tsx already has its own notice. This is only a fallback when
          // that notice did not mount for the player.
          if (!document.querySelector(".turn-notice")) {
            setShowTurnNotice(true);
            if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
            hideTimer.current = window.setTimeout(() => setShowTurnNotice(false), 1600);
          }
        }, 80);
      }

      wasMyTurn.current = isMyTurn;
    };

    evaluateTurn();
    const observer = new MutationObserver(evaluateTurn);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    const dismiss = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (showTurnNotice && !target?.closest(".turn-notice-fallback")) {
        setShowTurnNotice(false);
      }
    };
    document.addEventListener("pointerdown", dismiss, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("pointerdown", dismiss, true);
      clearTimers();
    };
  }, [showTurnNotice]);

  return (
    <>
      {children}
      {showTurnNotice && (
        <button
          type="button"
          className="turn-notice-fallback"
          onClick={() => setShowTurnNotice(false)}
          aria-live="assertive"
        >
          ¡Te toca!
        </button>
      )}
      <style>{`
        /* Drag preview: keep BLOQUEAR TURNO inside the card. */
        .drag-ghost.stop {
          overflow: hidden !important;
          padding: 8px 6px !important;
        }
        .drag-ghost.stop > strong {
          width: 100% !important;
          max-width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
          white-space: normal !important;
          overflow-wrap: normal !important;
          word-break: keep-all !important;
          text-align: center !important;
          font: 900 15px/1.05 Arial, sans-serif !important;
          letter-spacing: 0 !important;
        }

        /* Voting card: keep the played letter at the left and center the word. */
        .vote-word {
          position: relative !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          min-height: 64px !important;
          padding: 0 76px !important;
          text-align: center !important;
        }
        .vote-word .vote-letter {
          position: absolute !important;
          left: 0 !important;
          top: 50% !important;
          transform: translateY(-50%) !important;
        }
        .vote-word h2 {
          width: 100% !important;
          margin: 0 !important;
          text-align: center !important;
        }

        .turn-notice-fallback {
          position: fixed;
          left: 50%;
          top: 44%;
          z-index: 1000;
          transform: translate(-50%, -50%);
          border: 1px solid rgba(255,255,255,.28);
          border-radius: 999px;
          background: var(--gold, #f4bd3b);
          color: var(--ink, #14213d);
          padding: 14px 25px;
          font-size: 18px;
          font-weight: 950;
          box-shadow: 0 18px 45px rgba(0,0,0,.38);
          animation: turnNoticeFallback 1.6s ease both;
        }
        @keyframes turnNoticeFallback {
          0% { opacity: 0; transform: translate(-50%, -42%) scale(.85); }
          12%, 78% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
          100% { opacity: 0; transform: translate(-50%, -55%) scale(.96); }
        }

        @media (max-width: 520px) {
          .vote-word {
            min-height: 54px !important;
            padding: 0 64px !important;
          }
        }
        @media (orientation: landscape) and (max-height: 650px) {
          .turn-notice-fallback { top: 50%; }
        }
      `}</style>
    </>
  );
}
