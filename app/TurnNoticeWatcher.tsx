"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

type NoticePosition = { x: number; y: number };
type CachedResponse = {
  at: number;
  body: string;
  status: number;
  statusText: string;
  headers: [string, string][];
};
type HandCardSnapshot = {
  label: string;
  left: number;
  top: number;
  width: number;
  height: number;
  rotation: number;
};
type HandSnapshot = {
  cards: HandCardSnapshot[];
  fan: { left: number; top: number; width: number; height: number };
  cardWidth: number;
  cardHeight: number;
};
type SwapMotionCard = {
  key: string;
  label: string;
  left: number;
  top: number;
  targetLeft: number;
  targetTop: number;
  width: number;
  height: number;
  rotation: number;
  targetRotation: number;
  delay: number;
};
type SwapAnimation = {
  token: number;
  mode: "one" | "whole";
  centerX: number;
  centerY: number;
  outgoing: SwapMotionCard[];
  incoming: SwapMotionCard[];
};
type RoomPayload = {
  state?: {
    lastEvent?: {
      kind?: string;
      actorId?: string;
      targets?: { id?: string }[];
      label?: string;
      at?: number;
    } | null;
    players?: {
      id?: string;
      hand?: { id?: string; label?: string; kind?: string }[];
    }[];
  };
};

function cardLabel(element: HTMLElement) {
  const aria = element.getAttribute("aria-label")?.trim() ?? "";
  if (/^Carta\s+/i.test(aria)) return aria.replace(/^Carta\s+/i, "").trim();
  return element.querySelector<HTMLElement>("strong")?.textContent?.trim() || "?";
}

function snapshotHand(excludePlayedSwap = false): HandSnapshot {
  const fanElement = document.querySelector<HTMLElement>(".card-fan");
  const fanRect = fanElement?.getBoundingClientRect();
  let elements = Array.from(
    document.querySelectorAll<HTMLElement>(".card-fan .play-card"),
  );

  if (excludePlayedSwap) {
    const selectedSwap = elements.find(
      (element) => element.classList.contains("swap") && element.classList.contains("selected"),
    );
    const fallbackSwap = elements.find(
      (element) => element.classList.contains("swap"),
    );
    const played = selectedSwap ?? fallbackSwap;
    if (played) elements = elements.filter((element) => element !== played);
  }

  const cards = elements.map((element, index) => {
    const rect = element.getBoundingClientRect();
    return {
      label: cardLabel(element),
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      rotation: Math.max(-7, Math.min(7, (index - (elements.length - 1) / 2) * 1.4)),
    };
  });

  const reference =
    cards[0] ??
    (() => {
      const element = document.querySelector<HTMLElement>(".card-fan .play-card");
      const rect = element?.getBoundingClientRect();
      return rect
        ? {
            label: "?",
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            rotation: 0,
          }
        : null;
    })();

  return {
    cards,
    fan: fanRect
      ? { left: fanRect.left, top: fanRect.top, width: fanRect.width, height: fanRect.height }
      : { left: 0, top: window.innerHeight * 0.72, width: window.innerWidth, height: window.innerHeight * 0.28 },
    cardWidth: reference?.width ?? (window.innerWidth < 760 ? 92 : 124),
    cardHeight: reference?.height ?? (window.innerWidth < 760 ? 120 : 172),
  };
}

function difference(source: string[], comparison: string[]) {
  const counts = new Map<string, number>();
  comparison.forEach((label) => counts.set(label, (counts.get(label) ?? 0) + 1));
  return source.filter((label) => {
    const remaining = counts.get(label) ?? 0;
    if (remaining <= 0) return true;
    counts.set(label, remaining - 1);
    return false;
  });
}

export default function TurnNoticeWatcher() {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<NoticePosition>({ x: 0, y: 0 });
  const [swapAnimation, setSwapAnimation] = useState<SwapAnimation | null>(null);
  const wasMyTurn = useRef(false);
  const hideTimer = useRef<number | null>(null);
  const swapTimer = useRef<number | null>(null);
  const seenSwapAt = useRef(0);
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

    const fanTargets = (
      labels: string[],
      snapshot: HandSnapshot,
      centerLeft: number,
      centerTop: number,
    ) => {
      const visibleLabels = labels.slice(0, 14);
      const count = visibleLabels.length;
      const spread = count > 1
        ? Math.min(38, Math.max(16, (snapshot.fan.width - snapshot.cardWidth) / Math.max(1, count - 1)))
        : 0;
      const total = spread * Math.max(0, count - 1);
      const start = snapshot.fan.left + snapshot.fan.width / 2 - total / 2 - snapshot.cardWidth / 2;
      const baseTop = Math.min(
        window.innerHeight - snapshot.cardHeight * 0.58,
        snapshot.fan.top + Math.max(12, snapshot.fan.height * 0.28),
      );

      return visibleLabels.map((label, index) => ({
        key: `in-${index}-${label}`,
        label,
        left: centerLeft,
        top: centerTop,
        targetLeft: start + spread * index,
        targetTop: baseTop + Math.abs(index - (count - 1) / 2) * 2,
        width: snapshot.cardWidth,
        height: snapshot.cardHeight,
        rotation: (index - (count - 1) / 2) * 1.1,
        targetRotation: Math.max(-7, Math.min(7, (index - (count - 1) / 2) * 1.35)),
        delay: index * 24,
      } satisfies SwapMotionCard));
    };

    const startSwapAnimation = (
      mode: "one" | "whole",
      snapshot: HandSnapshot,
      nextLabels: string[],
    ) => {
      const pileRect = document.querySelector<HTMLElement>(".drop-zone")?.getBoundingClientRect();
      const centerX = pileRect ? pileRect.left + pileRect.width / 2 : window.innerWidth / 2;
      const centerY = pileRect ? pileRect.top + pileRect.height / 2 : window.innerHeight / 2;
      const centerLeft = centerX - snapshot.cardWidth / 2;
      const centerTop = centerY - snapshot.cardHeight / 2;
      const previousLabels = snapshot.cards.map((card) => card.label);

      let outgoingCards = snapshot.cards;
      let incomingLabels = nextLabels;

      if (mode === "one") {
        const removed = difference(previousLabels, nextLabels)[0];
        const added = difference(nextLabels, previousLabels)[0];
        const chosen =
          snapshot.cards.find((card) => card.label === removed) ?? snapshot.cards[0];
        outgoingCards = chosen ? [chosen] : [];
        incomingLabels = [added ?? nextLabels[0] ?? "?"];
      }

      outgoingCards = outgoingCards.slice(0, 14);
      const outgoing = outgoingCards.map((card, index) => ({
        key: `out-${index}-${card.label}`,
        label: card.label,
        left: card.left,
        top: card.top,
        targetLeft: centerLeft + (index - (outgoingCards.length - 1) / 2) * 2.2,
        targetTop: centerTop + Math.abs(index - (outgoingCards.length - 1) / 2) * 1.5,
        width: card.width || snapshot.cardWidth,
        height: card.height || snapshot.cardHeight,
        rotation: card.rotation,
        targetRotation: (index - (outgoingCards.length - 1) / 2) * 1.7,
        delay: index * 22,
      } satisfies SwapMotionCard));
      const incoming = fanTargets(incomingLabels, snapshot, centerLeft, centerTop);

      if (swapTimer.current !== null) window.clearTimeout(swapTimer.current);
      document.documentElement.classList.toggle("swap-whole-animating", mode === "whole");
      setSwapAnimation({
        token: Date.now(),
        mode,
        centerX,
        centerY,
        outgoing,
        incoming,
      });
      swapTimer.current = window.setTimeout(() => {
        document.documentElement.classList.remove("swap-whole-animating");
        setSwapAnimation(null);
      }, mode === "whole" ? 1120 : 920);
    };

    const inspectRoomBody = (
      bodyText: string,
      localPlayerId: string,
      before: HandSnapshot | null,
    ) => {
      if (!localPlayerId || !before) return;
      try {
        const payload = JSON.parse(bodyText) as RoomPayload;
        const state = payload.state;
        const event = state?.lastEvent;
        if (!state || event?.kind !== "swap" || !event.at) return;
        if (event.at <= seenSwapAt.current) return;

        const involved =
          event.actorId === localPlayerId ||
          Boolean(event.targets?.some((target) => target.id === localPlayerId));
        if (!involved) return;

        seenSwapAt.current = event.at;
        if (Date.now() - event.at > 5500) return;
        const me = state.players?.find((item) => item.id === localPlayerId);
        const nextLabels = (me?.hand ?? []).map((card) => card.label ?? "?");
        const mode = event.label === "una carta" ? "one" : "whole";
        startSwapAnimation(mode, before, nextLabels);
      } catch {}
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
        const localPlayerId = url.searchParams.get("playerId") ?? "";
        const before = hasRoomCode ? snapshotHand(false) : null;
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
          if (hasRoomCode) inspectRoomBody(body, localPlayerId, before);
        }
        return response;
      }

      if (isRoomsApi && method !== "GET") {
        cacheEpoch += 1;
        cache.clear();
        let nextInit = init;
        let localPlayerId = "";
        let beforeSwap: HandSnapshot | null = null;
        let isSwapRequest = false;

        if (typeof init?.body === "string") {
          try {
            const body = JSON.parse(init.body) as Record<string, unknown>;
            localPlayerId = String(body.playerId ?? "");
            isSwapRequest = body.action === "play" && typeof body.swapType === "string";
            if (isSwapRequest) beforeSwap = snapshotHand(true);

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

        const response = await nativeFetch(input, nextInit);
        if (response.ok && isSwapRequest && beforeSwap && localPlayerId) {
          const body = await response.clone().text();
          inspectRoomBody(body, localPlayerId, beforeSwap);
        }
        return response;
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
      document.documentElement.classList.remove("swap-whole-animating");
      if (swapTimer.current !== null) window.clearTimeout(swapTimer.current);
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

  const motionStyle = (card: SwapMotionCard) =>
    ({
      width: card.width,
      height: card.height,
      "--swap-left": `${card.left}px`,
      "--swap-top": `${card.top}px`,
      "--swap-target-left": `${card.targetLeft}px`,
      "--swap-target-top": `${card.targetTop}px`,
      "--swap-rotation": `${card.rotation}deg`,
      "--swap-target-rotation": `${card.targetRotation}deg`,
      "--swap-delay": `${card.delay}ms`,
    }) as CSSProperties;

  return (
    <>
      {visible && (
        <div
          className="turn-notice-fallback"
          role="status"
          aria-live="assertive"
          style={{ left: position.x, top: position.y }}
        >
          <strong>¡Te toca!</strong>
        </div>
      )}
      {swapAnimation && (
        <div
          key={swapAnimation.token}
          className={`swap-animation-layer ${swapAnimation.mode}`}
          aria-hidden="true"
        >
          {swapAnimation.outgoing.map((card) => (
            <div
              key={card.key}
              className="swap-motion-card outgoing"
              style={motionStyle(card)}
            >
              <span>{card.label}</span>
            </div>
          ))}
          <div
            className="swap-animation-mark"
            style={{ left: swapAnimation.centerX, top: swapAnimation.centerY }}
          >
            ⇄
          </div>
          {swapAnimation.incoming.map((card) => (
            <div
              key={card.key}
              className="swap-motion-card incoming"
              style={motionStyle(card)}
            >
              <span>{card.label}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
