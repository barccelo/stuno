"use client";

import { useEffect, useRef, useState } from "react";

type NoticePosition = { x: number; y: number };
type CachedResponse = {
  at: number;
  body: string;
  status: number;
  statusText: string;
  headers: [string, string][];
};

export default function TurnNoticeWatcher() {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<NoticePosition>({ x: 0, y: 0 });
  const wasMyTurn = useRef(false);
  const hideTimer = useRef<number | null>(null);
  const xContainsMode = useRef(false);

  useEffect(() => {
    const positionOverPile = () => {
      const pile = document.querySelector<HTMLElement>(".drop-zone");
      const rect = pile?.getBoundingClientRect();
      setPosition({
        x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
        y: rect ? rect.top + rect.height / 2 : window.innerHeight / 2,
      });
    };

    const show = () => {
      positionOverPile();
      setVisible(true);
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setVisible(false), 1550);
    };

    const syncInjectedContainsButton = () => {
      const bar = document.querySelector<HTMLElement>(".answer-bar");
      if (!bar) {
        xContainsMode.current = false;
        return;
      }
      const letter = bar
        .querySelector<HTMLElement>(".answer-letter")
        ?.textContent?.trim()
        .toUpperCase();
      if (letter !== "X") {
        xContainsMode.current = false;
        return;
      }
      if (bar.querySelector(".contains-toggle")) return;

      const submit = bar.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (!submit) return;
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "contains-toggle contains-toggle-x";
      toggle.textContent = "Contiene";
      toggle.setAttribute("aria-pressed", "false");
      toggle.addEventListener("click", () => {
        xContainsMode.current = !xContainsMode.current;
        toggle.classList.toggle("active", xContainsMode.current);
        toggle.setAttribute("aria-pressed", String(xContainsMode.current));
      });
      submit.before(toggle);
    };

    const normalizePenaltyCopy = () => {
      document
        .querySelectorAll<HTMLElement>(".game-event-popup.penalty")
        .forEach((popup) => {
          const detail = popup.querySelector<HTMLElement>("small");
          const title = popup.querySelector<HTMLElement>("strong")?.textContent ?? "";
          const text = detail?.textContent?.trim() ?? "";
          if (!detail || !/\bte\s+(?:entregó|dio|ha dado)\b/i.test(text)) return;
          const count = Number(title.match(/\d+/)?.[0] ?? 1);
          const actor = text.split(/\s+te\s+/i)[0]?.trim() || "Un jugador";
          detail.textContent = `${actor} te ha hecho robar ${count} ${count === 1 ? "carta" : "cartas"}.`;
        });
    };

    const evaluate = () => {
      const labels = Array.from(document.querySelectorAll(".turn-center strong"));
      const isMyTurn = labels.some((node) => node.textContent?.trim() === "Tu turno");

      if (isMyTurn && !wasMyTurn.current) show();
      wasMyTurn.current = isMyTurn;
      syncInjectedContainsButton();
      normalizePenaltyCopy();
    };

    evaluate();
    const observer = new MutationObserver(evaluate);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    const interval = window.setInterval(evaluate, 220);
    window.addEventListener("resize", positionOverPile);

    return () => {
      observer.disconnect();
      window.clearInterval(interval);
      window.removeEventListener("resize", positionOverPile);
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    };
  }, []);

  useEffect(() => {
    const nativeFetch = window.fetch.bind(window);
    const cache = new Map<string, CachedResponse>();
    let cacheEpoch = 0;

    const urlOf = (input: RequestInfo | URL) => {
      if (typeof input === "string") return input;
      if (input instanceof URL) return input.href;
      return input.url;
    };

    const patchedFetch: typeof window.fetch = async (input, init) => {
      let url: URL;
      try {
        url = new URL(urlOf(input), location.origin);
      } catch {
        return nativeFetch(input, init);
      }

      const requestMethod =
        init?.method ?? (input instanceof Request ? input.method : "GET");
      const method = requestMethod.toUpperCase();
      const isRoomsApi = url.pathname.endsWith("/api/rooms");

      if (isRoomsApi && method === "GET") {
        const hasRoomCode = Boolean(url.searchParams.get("code"));
        const ttl = document.hidden
          ? 12000
          : hasRoomCode
            ? 1700
            : 7000;
        const key = url.href;
        const cached = cache.get(key);
        if (cached && Date.now() - cached.at < ttl) {
          return new Response(cached.body, {
            status: cached.status,
            statusText: cached.statusText,
            headers: cached.headers,
          });
        }

        const epoch = cacheEpoch;
        const response = await nativeFetch(input, init);
        if (response.ok && epoch === cacheEpoch) {
          const clone = response.clone();
          const body = await clone.text();
          cache.set(key, {
            at: Date.now(),
            body,
            status: response.status,
            statusText: response.statusText,
            headers: Array.from(response.headers.entries()),
          });
        }
        return response;
      }

      if (isRoomsApi && method !== "GET") {
        cacheEpoch += 1;
        cache.clear();
        let nextInit = init;

        if (typeof init?.body === "string") {
          try {
            const body = JSON.parse(init.body) as Record<string, unknown>;

            // If SWAP is the last card, exchanging one remaining card is
            // impossible. Resolve it as a whole-hand swap instead of silently
            // doing nothing.
            if (body.action === "play" && body.swapType === "one") {
              const handLabel = document.querySelector<HTMLElement>(
                ".hand-toolbar > strong",
              )?.textContent;
              const handCount = Number(handLabel?.match(/\d+/)?.[0] ?? NaN);
              if (handCount === 1) body.swapType = "whole";
            }

            // X uses the same optional "Contiene" rule as Ñ, Y, Q and Z.
            if (body.action === "play" && xContainsMode.current) {
              body.matchMode = "contains";
              xContainsMode.current = false;
            }
            nextInit = { ...init, body: JSON.stringify(body) };
          } catch {}
        }

        return nativeFetch(input, nextInit);
      }

      return nativeFetch(input, init);
    };

    window.fetch = patchedFetch;
    const refreshOnReturn = () => {
      if (!document.hidden) cache.clear();
    };
    document.addEventListener("visibilitychange", refreshOnReturn);

    return () => {
      window.fetch = nativeFetch;
      document.removeEventListener("visibilitychange", refreshOnReturn);
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
    <div
      className="turn-notice-fallback"
      role="status"
      aria-live="assertive"
      style={{ left: position.x, top: position.y }}
    >
      <strong>¡Te toca!</strong>
    </div>
  );
}
