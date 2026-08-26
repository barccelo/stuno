"use client";

import { useEffect, useRef } from "react";

const VOTE_DURATION_MS = 10000;
const VOTE_EVENT = "stuno-vote-timer-state";

type VoteTimerState = {
  key: string;
  expiresAt: number;
} | null;

function roomStateFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const state = row.state;
  return state && typeof state === "object"
    ? (state as Record<string, unknown>)
    : null;
}

function voteStateFromRoom(state: Record<string, unknown> | null): VoteTimerState {
  if (!state) return null;
  const pending = state.pendingVote;
  if (!pending || typeof pending !== "object") return null;
  const vote = pending as Record<string, unknown>;
  const expiresAt = Number(vote.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return null;
  return {
    key: [state.code, vote.playerId, vote.cardId, vote.answer].map(String).join(":"),
    expiresAt,
  };
}

export default function VoteTimerWatcher() {
  const serverVote = useRef<VoteTimerState>(null);
  const fallbackKey = useRef("");
  const fallbackExpiresAt = useRef(0);

  useEffect(() => {
    const previousFetch = window.fetch;
    const wrappedFetch: typeof window.fetch = async (...args) => {
      const response = await previousFetch(...args);
      try {
        const requestUrl =
          typeof args[0] === "string"
            ? args[0]
            : args[0] instanceof URL
              ? args[0].toString()
              : args[0]?.url ?? "";
        if (requestUrl.includes("/api/rooms")) {
          const clone = response.clone();
          const payload = await clone.json();
          const state = roomStateFromPayload(payload);
          if (state) {
            window.dispatchEvent(
              new CustomEvent(VOTE_EVENT, { detail: voteStateFromRoom(state) }),
            );
          }
        }
      } catch {}
      return response;
    };
    window.fetch = wrappedFetch;
    return () => {
      if (window.fetch === wrappedFetch) window.fetch = previousFetch;
    };
  }, []);

  useEffect(() => {
    const onVoteState = (event: Event) => {
      serverVote.current =
        (event as CustomEvent<VoteTimerState>).detail ?? null;
    };
    window.addEventListener(VOTE_EVENT, onVoteState);
    return () => window.removeEventListener(VOTE_EVENT, onVoteState);
  }, []);

  useEffect(() => {
    const renderTimer = () => {
      const panel = document.querySelector<HTMLElement>(".vote-panel");
      const existing = document.querySelector<HTMLElement>(
        ".vote-countdown-watcher",
      );

      if (!panel) {
        existing?.remove();
        fallbackKey.current = "";
        fallbackExpiresAt.current = 0;
        return;
      }

      // If page.tsx already rendered its own timer, do not duplicate it.
      if (panel.querySelector(".vote-countdown:not(.vote-countdown-watcher)")) {
        existing?.remove();
        return;
      }

      const panelIdentity = Array.from(
        panel.querySelectorAll("p, .vote-letter, .vote-word h2"),
      )
        .map((node) => node.textContent?.trim() ?? "")
        .join("|");

      if (!serverVote.current && panelIdentity !== fallbackKey.current) {
        fallbackKey.current = panelIdentity;
        fallbackExpiresAt.current = Date.now() + VOTE_DURATION_MS;
      }

      const expiresAt =
        serverVote.current?.expiresAt ||
        fallbackExpiresAt.current ||
        Date.now() + VOTE_DURATION_MS;
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((expiresAt - now) / 1000));
      const progress = Math.max(
        0,
        Math.min(100, ((expiresAt - now) / VOTE_DURATION_MS) * 100),
      );

      const voteWord = panel.querySelector<HTMLElement>(".vote-word");
      let countdown = existing;
      if (!countdown || !panel.contains(countdown)) {
        countdown = document.createElement("div");
        countdown.className = "vote-countdown vote-countdown-watcher";
        countdown.setAttribute("role", "timer");
        countdown.innerHTML = "<strong></strong><small>SEG</small>";
      }

      // Keep the timer in the same visual row as the letter and answer:
      // letter on the left, answer in the middle, countdown on the right.
      if (voteWord && countdown.parentElement !== voteWord) {
        voteWord.appendChild(countdown);
      } else if (!voteWord && countdown.parentElement !== panel) {
        panel.appendChild(countdown);
      }

      countdown.classList.toggle("ending", remaining <= 3);
      countdown.setAttribute("aria-label", `${remaining} segundos para votar`);
      countdown.style.setProperty("--vote-progress", `${progress}%`);
      const value = countdown.querySelector("strong");
      const nextValue = String(remaining);
      if (value && value.textContent !== nextValue) value.textContent = nextValue;
    };

    // Polling is intentional here: it avoids a MutationObserver feedback loop
    // when the timer itself updates the DOM, and is lightweight on mobile.
    renderTimer();
    const timer = window.setInterval(renderTimer, 250);
    return () => {
      window.clearInterval(timer);
      document.querySelector(".vote-countdown-watcher")?.remove();
    };
  }, []);

  return null;
}
