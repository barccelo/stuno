"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CategoryCard, GameCard } from "../lib/game";
import { DEFAULT_CATEGORY_CARDS } from "../lib/categories";

type Screen = "home" | "create" | "join" | "editor" | "game";
type PublicPlayer = {
  id: string;
  name: string;
  wins: number;
  cardCount: number;
  hand?: GameCard[];
};
type AvailableRoom = {
  code: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  mode: "classic" | "simultaneous";
  playStyle: "online" | "live";
  turnSeconds: number;
};
type Room = {
  code: string;
  hostId: string;
  status: "lobby" | "playing" | "finished" | "closed";
  winnerId: string | null;
  pausedAt?: number | null;
  startCountdownEndsAt?: number | null;
  settings: {
    mode: "classic" | "simultaneous";
    playStyle: "online" | "live";
    turnSeconds: number;
    startDelaySeconds: number;
  };
  players: PublicPlayer[];
  spectators: { id: string; name: string }[];
  turnIndex: number;
  direction: 1 | -1;
  turnStartedAt: number;
  categoryOptions?: { easy: string; medium: string; expert: string } | null;
  currentCategory: { level: "easy" | "medium" | "expert"; text: string } | null;
  categoryChooserId?: string | null;
  categoryOwnerId?: string | null;
  pendingVote: {
    playerId: string;
    cardId: string;
    answer: string;
    votes: Record<string, boolean>;
  } | null;
  selectedCategory?: {
    level: "easy" | "medium" | "expert";
    text: string;
  } | null;
  pendingLive?: {
    playerId: string;
    cardId: string;
    answer: string;
    expiresAt: number;
    passes?: string[];
  } | null;
  pendingPenalty?: {
    playerId: string;
    total: number;
    cardLabel: string;
    continuation: "classic" | "simultaneous";
    finishAfter: boolean;
  } | null;
  lastPlay?: {
    playerId: string;
    playerName: string;
    label: string;
    kind: string;
    at: number;
  } | null;
  centerPile?: {
    playerId: string;
    playerName: string;
    label: string;
    kind: string;
    at: number;
    round: number;
  }[];
  roundNumber?: number;
  pileSettledAt?: number | null;
  lastDraw?: { playerId: string; count: number; at: number } | null;
  drawEvents?: { playerId: string; count: number; at: number }[];
  lastEvent?: {
    kind: "block" | "penalty" | "reverse" | "category" | "swap" | "draw";
    actorId: string;
    actorName: string;
    targets: { id: string; name: string; count?: number }[];
    amount?: number;
    label?: string;
    reason?: "timeout" | "pass" | "rejected";
    global?: boolean;
    at: number;
  } | null;
  submissions: Record<
    string,
    { playerId: string; cardId: string; answer: string }
  >;
  message: string;
  deck: { count: number };
  categories: CategoryCard[];
};

const starterCategories = DEFAULT_CATEGORY_CARDS.map(
  ({ easy, medium, expert }) => [easy, medium, expert],
);

type IconName =
  | "arrow_back"
  | "content_copy"
  | "link"
  | "pause"
  | "play"
  | "help"
  | "arrow_forward"
  | "add"
  | "close"
  | "delete"
  | "shuffle"
  | "casino"
  | "category"
  | "groups"
  | "search"
  | "skip_next"
  | "block";
function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, string> = {
    arrow_back: "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.42-1.41L7.83 13H20v-2Z",
    content_copy:
      "M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1Zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2Zm0 16H8V7h11v14Z",
    link: "M3.9 12c0-2.25 1.85-4.1 4.1-4.1h3V6H8a6 6 0 0 0 0 12h3v-1.9H8A4.1 4.1 0 0 1 3.9 12Zm5.1 1h6v-2H9v2Zm7-7h-3v1.9h3a4.1 4.1 0 1 1 0 8.2h-3V18h3a6 6 0 0 0 0-12Z",
    pause: "M6 19h4V5H6v14Zm8-14v14h4V5h-4Z",
    play: "m8 5 11 7-11 7V5Z",
    help: "M11 18h2v-2h-2v2Zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm0-14c-2.21 0-4 1.79-4 4h2a2 2 0 1 1 2.83 1.82c-1.1.5-1.83 1.6-1.83 2.81V15h2v-.37c0-.43.25-.82.64-1C15.03 13 16 11.6 16 10c0-2.21-1.79-4-4-4Z",
    arrow_forward:
      "m12 4-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8-8-8Z",
    add: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2Z",
    close:
      "M18.3 5.71 16.89 4.3 12 9.17 7.11 4.3 5.7 5.71 10.59 10.59 5.7 15.48 7.11 16.89 12 12 16.89 16.89 18.3 15.48 13.41 10.59 18.3 5.71Z",
    delete:
      "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12ZM8 9h8v10H8V9Zm7.5-5-1-1h-5l-1 1H5v2h14V4h-3.5Z",
    shuffle:
      "M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41ZM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5Zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13Z",
    casino:
      "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2ZM7.5 18A1.5 1.5 0 1 1 7.5 15a1.5 1.5 0 0 1 0 3Zm0-9A1.5 1.5 0 1 1 7.5 6a1.5 1.5 0 0 1 0 3Zm4.5 4.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm4.5 4.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm0-9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z",
    category:
      "M12 2 2 7l10 5 8.18-4.09V14H22V7L12 2Zm6 9.03v6L12 20l-6-3v-5.97l6 3 6-3Z",
    groups:
      "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3Zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3Zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13Zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5Z",
    search:
      "M9.5 3a6.5 6.5 0 1 0 3.98 11.64L19.85 21 21 19.85l-6.36-6.37A6.5 6.5 0 0 0 9.5 3Zm0 2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z",
    skip_next: "M6 18 14.5 12 6 6v12Zm9-12v12h2V6h-2Z",
    block:
      "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2ZM4 12c0-1.85.63-3.55 1.69-4.9L16.9 18.31A7.9 7.9 0 0 1 12 20c-4.41 0-8-3.59-8-8Zm14.31 4.9L7.1 5.69A7.9 7.9 0 0 1 12 4c4.41 0 8 3.59 8 8 0 1.85-.63 3.55-1.69 4.9Z",
  };
  return (
    <svg
      className="material-icon"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}

function TimeWheel({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const touchY = useRef<number | null>(null);
  const currentValue = useRef(value);

  useEffect(() => {
    currentValue.current = value;
    setDraft(String(value));
  }, [value]);

  const changeBy = (amount: number) => {
    const next = Math.min(max, Math.max(min, currentValue.current + amount));
    currentValue.current = next;
    onChange(next);
  };

  const commitDraft = () => {
    const parsed = Number.parseInt(draft, 10);
    const next = Number.isFinite(parsed)
      ? Math.min(max, Math.max(min, parsed))
      : value;
    setDraft(String(next));
    onChange(next);
  };

  return (
    <div className="time-wheel-card">
      <span className="time-wheel-title">{label}</span>
      <label
        className="time-manual-input"
        title="Desliza o usa la rueda para cambiar el tiempo"
        onWheel={(event) => {
          event.preventDefault();
          changeBy(event.deltaY < 0 ? 1 : -1);
        }}
        onTouchStart={(event) => {
          touchY.current = event.touches[0]?.clientY ?? null;
        }}
        onTouchMove={(event) => {
          const currentY = event.touches[0]?.clientY;
          if (touchY.current === null || currentY === undefined) return;
          const distance = touchY.current - currentY;
          if (Math.abs(distance) < 18) return;
          event.preventDefault();
          changeBy(distance > 0 ? 1 : -1);
          touchY.current = currentY;
        }}
        onTouchEnd={() => {
          touchY.current = null;
        }}
      >
        <input
          aria-label={`${label}, segundos. Desliza para cambiar o toca para escribir.`}
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          type="number"
          value={draft}
          onChange={(event) => {
            const nextDraft = event.target.value;
            setDraft(nextDraft);
            const parsed = Number.parseInt(nextDraft, 10);
            if (Number.isFinite(parsed) && parsed >= min && parsed <= max) {
              onChange(parsed);
            }
          }}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
        <span>seg</span>
      </label>
    </div>
  );
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("home");
  const [mode, setMode] = useState<"classic" | "simultaneous">("classic");
  const [playStyle, setPlayStyle] = useState<"online" | "live">("online");
  const [seconds, setSeconds] = useState(20);
  const [startDelay, setStartDelay] = useState(5);
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [categories, setCategories] = useState(starterCategories);
  const [room, setRoom] = useState<Room | null>(null);
  const [playerId, setPlayerId] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [swapCard, setSwapCard] = useState<string | null>(null);
  const [swapTarget, setSwapTarget] = useState("");
  const [swapType, setSwapType] = useState<"whole" | "one">("whole");
  const [penaltyAllocations, setPenaltyAllocations] = useState<
    Record<string, number>
  >({});
  const [exitModal, setExitModal] = useState(false);
  const [availableRooms, setAvailableRooms] = useState<AvailableRoom[]>([]);
  const [participantPortal, setParticipantPortal] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [categoryAdminKey, setCategoryAdminKey] = useState("");
  const [categoryEditorUnlocked, setCategoryEditorUnlocked] = useState(false);
  const [categorySaving, setCategorySaving] = useState(false);
  const [shuffleStep, setShuffleStep] = useState<number | null>(null);
  const [shuffling, setShuffling] = useState(false);
  const [flyingCard, setFlyingCard] = useState<{
    card: GameCard;
    token: number;
    targetX: number;
    targetY: number;
  } | null>(null);
  const [incomingCards, setIncomingCards] = useState(0);
  const [sortMode, setSortMode] = useState<
    "az" | "za" | "special-first" | "special-last"
  >("az");
  const [letterOrder, setLetterOrder] = useState<"az" | "za">("az");
  const lastDrawAt = useRef(0);
  const [dragging, setDragging] = useState<{
    card: GameCard;
    x: number;
    y: number;
  } | null>(null);
  const dragStart = useRef<{
    card: GameCard;
    x: number;
    y: number;
    active: boolean;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const handRef = useRef<HTMLDivElement | null>(null);
  const dropRef = useRef<HTMLDivElement | null>(null);
  const codeInputRef = useRef<HTMLInputElement | null>(null);
  const categoryWheelRef = useRef<HTMLDivElement | null>(null);
  const wheelResetting = useRef(false);
  const title = useMemo(
    () =>
      screen === "create"
        ? "Crear una sala"
        : screen === "join"
          ? "Entrar a una sala"
          : screen === "editor"
            ? "Tus categorías"
            : "",
    [screen],
  );
  const me = room?.players.find((item) => item.id === playerId);
  const hand = me?.hand ?? [];
  const sortedHand = useMemo(() => {
    const cards = [...hand];
    const isSpecial = (card: GameCard) => card.kind !== "letter";
    if (sortMode === "az" || sortMode === "za")
      return cards.sort((a, b) => {
        const result = a.label.localeCompare(b.label, "es", {
          sensitivity: "base",
        });
        return sortMode === "az" ? result : -result;
      });
    return cards.sort((a, b) => {
      const difference = Number(isSpecial(a)) - Number(isSpecial(b));
      if (difference)
        return sortMode === "special-first" ? -difference : difference;
      const result = a.label.localeCompare(b.label, "es", {
        sensitivity: "base",
      });
      return letterOrder === "az" ? result : -result;
    });
  }, [hand, sortMode, letterOrder]);
  const current = room?.players[room.turnIndex];
  const categoryChooserId = room
    ? (room.categoryChooserId ??
      (room.settings.mode === "classic"
        ? current?.id
        : room.categoryOwnerId ?? room.hostId))
    : undefined;
  const categoryChooser = room?.players.find(
    (item) => item.id === categoryChooserId,
  );
  const nextPlayer = room?.players.length
    ? room.players[
        (room.turnIndex + room.direction + room.players.length) %
          room.players.length
      ]
    : undefined;
  const myLatestDraw = useMemo(() => {
    const events = room?.drawEvents?.length
      ? room.drawEvents
      : room?.lastDraw
        ? [room.lastDraw]
        : [];
    return [...events]
      .reverse()
      .find((event) => event.playerId === playerId);
  }, [room?.drawEvents, room?.lastDraw, playerId]);
  const penaltyAssigned = Object.values(penaltyAllocations).reduce(
    (sum, count) => sum + count,
    0,
  );
  const penaltyRemaining = Math.max(
    0,
    (room?.pendingPenalty?.total ?? 0) - penaltyAssigned,
  );
  const penaltyTargets = useMemo(() => {
    const ownerId = room?.pendingPenalty?.playerId;
    if (!room || !ownerId || room.players.length < 2) return [];
    const ownerIndex = room.players.findIndex((item) => item.id === ownerId);
    return Array.from({ length: room.players.length - 1 }, (_, offset) => {
      const index =
        (ownerIndex + room.direction * (offset + 1) + room.players.length * 4) %
        room.players.length;
      return room.players[index];
    });
  }, [room?.pendingPenalty?.playerId, room?.players, room?.direction]);
  const startCountdownRemaining = room?.startCountdownEndsAt
    ? Math.max(0, Math.ceil((room.startCountdownEndsAt - now) / 1000))
    : 0;
  const remaining =
    room?.status === "playing"
      ? Math.max(
          0,
          Math.ceil(
            (room.settings.turnSeconds * 1000 -
              ((room.pausedAt ?? now) - room.turnStartedAt)) /
              1000,
          ),
        )
      : (room?.settings.turnSeconds ?? seconds);
  const canPlay = Boolean(
    room &&
    !room.pausedAt &&
    room.currentCategory &&
    room.status === "playing" &&
    !room.pendingVote &&
    !room.pendingLive &&
    !room.pendingPenalty &&
    (room.settings.mode === "simultaneous"
      ? !room.submissions[playerId]
      : current?.id === playerId),
  );
  const canPassAndDraw = Boolean(
    room?.settings.mode === "classic" && canPlay && current?.id === playerId,
  );

  useEffect(() => {
    let active = true;
    try {
      setCategoryAdminKey(
        sessionStorage.getItem("stuno-category-admin-key") ?? "",
      );
    } catch {}
    void fetch("/api/categories", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = (await response.json()) as {
          categories?: { easy: string; medium: string; expert: string }[];
        };
        if (active && data.categories?.length)
          setCategories(
            data.categories.map(({ easy, medium, expert }) => [
              easy,
              medium,
              expert,
            ]),
          );
      })
      .catch(() => {
        try {
          const saved = localStorage.getItem("letrario-categories");
          if (!saved || !active) return;
          const parsed = JSON.parse(saved) as unknown;
          if (Array.isArray(parsed)) setCategories(parsed as string[][]);
        } catch {}
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get("room");
    const isParticipant = params.get("join") === "1" || Boolean(code);
    const forceNew = params.get("new") === "1";
    setParticipantPortal(isParticipant);
    localStorage.removeItem("letrario-session");
    if (code) {
      setRoomCode(code.toUpperCase().slice(0, 4));
      setScreen("join");
    } else if (isParticipant) setScreen("join");
    if (isParticipant && forceNew) {
      sessionStorage.removeItem("letrario-player-session");
      return;
    }
    const storage = isParticipant ? sessionStorage : localStorage;
    const key = isParticipant
      ? "letrario-player-session"
      : "letrario-host-session";
    const saved = storage.getItem(key);
    if (!saved) return;
    try {
      const session = JSON.parse(saved) as { code: string; playerId: string };
      if (code && session.code !== code.toUpperCase()) return;
      void fetch(
        `/api/rooms?code=${session.code}&playerId=${session.playerId}`,
        { cache: "no-store" },
      )
        .then(async (response) => {
          if (!response.ok) throw new Error();
          const data = await response.json();
          setRoomCode(session.code);
          setPlayerId(session.playerId);
          setRoom(data.state);
          setScreen("game");
        })
        .catch(() => storage.removeItem(key));
    } catch {
      storage.removeItem(key);
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("letrario-categories", JSON.stringify(categories));
    } catch {}
  }, [categories]);
  useEffect(() => {
    if (screen !== "home" && screen !== "join") return;
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/rooms", { cache: "no-store" });
        if (response.ok) {
          const data = await response.json();
          if (active) setAvailableRooms(data.rooms ?? []);
        }
      } catch {}
    };
    void refresh();
    const timer = window.setInterval(refresh, 4000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [screen]);
  useEffect(() => {
    if (screen !== "game" || !room?.code) return;
    const timer = window.setInterval(async () => {
      setNow(Date.now());
      try {
        const response = await fetch(
          `/api/rooms?code=${room.code}&playerId=${playerId}`,
          { cache: "no-store" },
        );
        if (response.ok) {
          const data = await response.json();
          setRoom(data.state);
        }
      } catch {}
    }, 900);
    return () => window.clearInterval(timer);
  }, [screen, room?.code, playerId]);
  useEffect(() => {
    if (
      !room ||
      room.pausedAt ||
      room.status !== "playing" ||
      remaining > 0 ||
      room.pendingVote ||
      room.pendingLive ||
      room.pendingPenalty
    )
      return;
    void act("timeout");
  }, [
    remaining,
    room?.status,
    room?.pendingVote,
    room?.pendingLive,
    room?.pendingPenalty,
    room?.pausedAt,
  ]);
  useEffect(() => {
    if (room?.pendingLive && now >= room.pendingLive.expiresAt)
      void act("finalizeLive");
  }, [now, room?.pendingLive?.expiresAt]);
  useEffect(() => {
    const event = myLatestDraw;
    if (!event || event.at <= lastDrawAt.current)
      return;
    lastDrawAt.current = event.at;
    setIncomingCards(Math.max(1, Math.min(3, event.count)));
    const timer = window.setTimeout(() => setIncomingCards(0), 1200);
    return () => window.clearTimeout(timer);
  }, [myLatestDraw?.at, playerId]);
  useEffect(() => {
    setPenaltyAllocations({});
  }, [
    room?.pendingPenalty?.playerId,
    room?.pendingPenalty?.total,
    room?.players.length,
  ]);
  useEffect(() => {
    if (!selected || canPlay) return;
    setSelected(null);
    setAnswer("");
    setSwapCard(null);
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
  }, [canPlay, selected]);
  useEffect(() => {
    if (room?.status !== "lobby" || playerId !== room.hostId) return;
    const frame = requestAnimationFrame(() => scrollToSelectedCategory("auto"));
    return () => cancelAnimationFrame(frame);
  }, [room?.status, room?.categories.length, categorySearch, playerId]);

  function show(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2000);
  }
  async function unlockCategoryEditor() {
    if (!categoryAdminKey.trim()) return;
    setCategorySaving(true);
    try {
      const response = await fetch("/api/categories?verify=1", {
        cache: "no-store",
        headers: { "x-stuno-admin-key": categoryAdminKey.trim() },
      });
      if (!response.ok) throw new Error("Clave administrativa incorrecta.");
      sessionStorage.setItem(
        "stuno-category-admin-key",
        categoryAdminKey.trim(),
      );
      setCategoryEditorUnlocked(true);
    } catch (error) {
      show(error instanceof Error ? error.message : "No se pudo acceder.");
    } finally {
      setCategorySaving(false);
    }
  }
  async function saveGlobalCategories() {
    setCategorySaving(true);
    try {
      const response = await fetch("/api/categories", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-stuno-admin-key": categoryAdminKey.trim(),
        },
        body: JSON.stringify({
          categories: categories.map(([easy, medium, expert]) => ({
            easy,
            medium,
            expert,
          })),
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        categories?: { easy: string; medium: string; expert: string }[];
      };
      if (!response.ok) throw new Error(data.error || "No se pudo guardar.");
      if (data.categories)
        setCategories(
          data.categories.map(({ easy, medium, expert }) => [
            easy,
            medium,
            expert,
          ]),
        );
      show("Categorías guardadas para todos los dispositivos.");
    } catch (error) {
      show(error instanceof Error ? error.message : "No se pudo guardar.");
    } finally {
      setCategorySaving(false);
    }
  }
  function clearCardSelection() {
    setSelected(null);
    setAnswer("");
    setSwapCard(null);
    if (document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
  }
  function dismissSelectionFromBackground(
    event: React.PointerEvent<HTMLElement>,
  ) {
    const target = event.target as HTMLElement;
    if (
      room?.pendingLive &&
      room.pendingLive.playerId !== playerId &&
      !room.pendingLive.passes?.includes(playerId) &&
      !target.closest(".live-challenge")
    ) {
      void act("passChallenge");
    }
    if (
      target.closest(
        ".play-card,.answer-bar,.action-picker,.vote-panel,.live-challenge,.pass-draw,.icon-button",
      )
    )
      return;
    if (selected || swapCard) clearCardSelection();
  }
  async function request(payload: Record<string, unknown>) {
    setBusy(true);
    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo completar");
      if (data.playerId) setPlayerId(data.playerId);
      if (data.code) setRoomCode(data.code);
      if (data.state) setRoom(data.state);
      if (data.playerId && data.code) {
        const isHost = data.state?.hostId === data.playerId;
        const storage = isHost ? localStorage : sessionStorage;
        const key = isHost
          ? "letrario-host-session"
          : "letrario-player-session";
        storage.setItem(
          key,
          JSON.stringify({ code: data.code, playerId: data.playerId }),
        );
      }
      return data;
    } catch (error) {
      show(error instanceof Error ? error.message : "Ocurrió un error");
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function createRoom() {
    const custom = categories.map(([easy, medium, expert]) => ({
      easy,
      medium,
      expert,
    }));
    const data = await request({
      action: "create",
      name,
      mode,
      playStyle,
      turnSeconds: seconds,
      startDelaySeconds: startDelay,
      categories: custom,
    });
    if (data) setScreen("game");
  }
  async function joinRoom(spectator = false) {
    const data = await request({
      action: "join",
      code: roomCode,
      name: name || "Mesa",
      spectator,
    });
    if (data) {
      history.replaceState(
        null,
        "",
        `${location.pathname}?join=1&room=${data.code}`,
      );
      setScreen("game");
    }
  }
  async function act(action: string, extra: Record<string, unknown> = {}) {
    if (!room) return;
    return request({ action, code: room.code, playerId, ...extra });
  }
  function animatePlay(card: GameCard, commit: () => void) {
    const target = dropRef.current?.getBoundingClientRect();
    setFlyingCard({
      card,
      token: Date.now(),
      targetX: target ? target.left + target.width / 2 : window.innerWidth / 2,
      targetY: target ? target.top + target.height / 2 : window.innerHeight / 2,
    });
    window.setTimeout(() => {
      setFlyingCard(null);
      commit();
    }, 340);
  }
  function playSelectedCard(card: GameCard) {
    if (!canPlay)
      return show(
        room?.settings.mode === "classic"
          ? "Espera tu turno"
          : "Tu respuesta ya está lista",
      );
    if (card.kind === "swap") {
      setSwapCard(card.id);
      setSwapTarget(
        room?.players.find((item) => item.id !== playerId)?.id ?? "",
      );
      return;
    }
    if (
      ["letter", "joker"].includes(card.kind) &&
      room?.settings.playStyle === "online"
    ) {
      setSelected(card.id);
      show(
        card.kind === "joker"
          ? "Comodín: puedes responder con cualquier letra."
          : `Tu respuesta debe comenzar por ${card.label}.`,
      );
      return;
    }
    animatePlay(card, () => {
      void act("play", {
        cardId: card.id,
        answer: "",
      });
      setSelected(null);
      setAnswer("");
    });
  }
  function selectCard(
    card: GameCard,
    event?: React.MouseEvent<HTMLButtonElement>,
  ) {
    if (suppressClick.current) {
      event?.preventDefault();
      return;
    }
    if (!canPlay)
      return show(
        room?.settings.mode === "classic"
          ? "Espera tu turno"
          : "Tu respuesta ya está lista",
      );
    if (selected === card.id) {
      playSelectedCard(card);
      return;
    }
    setSelected(card.id);
    event?.currentTarget.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
    if (card.kind === "joker")
      show("Carta comodín: permite responder con cualquier letra.");
    else show("Carta seleccionada. Tócala otra vez o arrástrala al centro.");
  }
  function pointerDown(
    event: React.PointerEvent<HTMLButtonElement>,
    card: GameCard,
  ) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const active = selected === card.id;
    dragStart.current = {
      card,
      x: event.clientX,
      y: event.clientY,
      active,
      moved: false,
    };
    if (active) setDragging({ card, x: event.clientX, y: event.clientY });
  }
  function pointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const start = dragStart.current;
    if (!start) return;
    const dx = event.clientX - start.x,
      dy = event.clientY - start.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 4) start.moved = true;
    const shouldDrag =
      start.active ||
      (event.pointerType === "mouse"
        ? distance > 4
        : dy < -6 && Math.abs(dy) > Math.abs(dx));
    if (shouldDrag) {
      start.active = true;
      setDragging({ card: start.card, x: event.clientX, y: event.clientY });
    }
  }
  function pointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    const start = dragStart.current;
    if (!start) return;
    if (start.active && start.moved) {
      const rect = dropRef.current?.getBoundingClientRect();
      if (
        rect &&
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      )
        playSelectedCard(start.card);
      else show("Suelta la carta dentro del recuadro central.");
      suppressClick.current = true;
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 80);
    }
    dragStart.current = null;
    setDragging(null);
  }
  function confirmSwap() {
    if (!swapCard || !swapTarget) return;
    const card = hand.find((item) => item.id === swapCard);
    if (!card) return;
    animatePlay(card, () => {
      void act("play", { cardId: swapCard, targetId: swapTarget, swapType });
      setSwapCard(null);
      setSelected(null);
    });
  }
  function changePenaltyTarget(targetId: string, amount: number) {
    const total = room?.pendingPenalty?.total ?? 0;
    setPenaltyAllocations((current) => {
      const assigned = Object.values(current).reduce(
        (sum, count) => sum + count,
        0,
      );
      const existing = current[targetId] ?? 0;
      const nextValue = Math.max(
        0,
        Math.min(total, existing + Math.min(amount, total - assigned)),
      );
      const next = { ...current, [targetId]: nextValue };
      if (!nextValue) delete next[targetId];
      return next;
    });
  }
  async function confirmPenalty() {
    if (!room?.pendingPenalty || penaltyRemaining !== 0) return;
    await act("allocatePenalty", { allocations: penaltyAllocations });
    setPenaltyAllocations({});
  }
  function submitAnswer() {
    if (!selected || !answer.trim()) return;
    const card = hand.find((item) => item.id === selected);
    if (!card) return;
    const submitted = answer;
    animatePlay(card, () => {
      void act("play", { cardId: selected, answer: submitted });
      setSelected(null);
      setAnswer("");
    });
  }
  function cardClass(card: GameCard) {
    return card.kind === "stop"
      ? "coral"
      : card.kind === "reverse"
        ? "violet"
        : card.kind === "swap"
          ? "teal"
        : card.kind === "joker"
          ? "gold"
          : card.kind === "category"
            ? "orange"
            : "";
  }
  function cardCorner(card: GameCard) {
    return card.kind === "joker"
      ? "COMODÍN"
      : card.kind === "category"
        ? "NUEVA CATEGORÍA"
        : card.kind === "stop"
          ? ""
          : card.kind === "reverse"
            ? "SWITCH"
          : card.label;
  }
  function cardFace(card: GameCard) {
    return card.kind === "reverse"
      ? "↔"
      : card.kind === "swap"
        ? "⇄"
        : card.kind === "category"
          ? ""
          : card.kind === "stop"
            ? "BLOQUEAR\nTURNO"
          : card.label;
  }
  function centerCardLabel(kind: string, label: string) {
    return kind === "category"
      ? "NUEVA\nCATEGORÍA"
      : kind === "stop"
        ? "BLOQUEAR\nTURNO"
        : kind === "joker"
          ? "★"
          : label;
  }
  function renderRoomMessage(message: string) {
    const blocked = message.startsWith("[BLOCK]");
    const cleanMessage = blocked ? message.slice(7).trim() : message;
    const lines = cleanMessage.match(/[^.]+(?:\.|$)/g)?.map((line) => line.trim()).filter(Boolean) ?? [cleanMessage];
    return (
      <span className="turn-message-lines">
        {lines.map((line, index) => (
          <span key={`${line}-${index}`} className={blocked && index === 0 ? "inline-game-event" : ""}>
            {blocked && index === 0 && <Icon name="block" size={14} />}
            {line}
          </span>
        ))}
      </span>
    );
  }
  function eventCopy(event: NonNullable<Room["lastEvent"]>) {
    if (event.actorId === playerId && !event.global) return null;
    const mine = event.targets.find((target) => target.id === playerId);
    const targetNames = event.targets.map((target) => target.name).join(" y ");
    if (event.kind === "block")
      return mine
        ? { title: "Fuiste bloqueado", detail: `${event.actorName} bloqueó tu turno.` }
        : { title: `${targetNames} fue bloqueado`, detail: `${event.actorName} bloqueó su turno.` };
    if (event.kind === "penalty") {
      const count = mine?.count ?? event.amount ?? 1;
      return mine
        ? {
            title: `Recibes ${count} ${count === 1 ? "carta" : "cartas"}`,
            detail: `${event.actorName} te ${count === 1 ? "entregó una carta" : `entregó ${count} cartas`}.`,
          }
        : {
            title: `${targetNames} ${event.targets.length === 1 ? "recibe" : "reciben"} cartas`,
            detail: `${event.actorName} repartió +${event.amount ?? 1}.`,
          };
    }
    if (event.kind === "swap")
      return mine
        ? { title: "Intercambio contigo", detail: `${event.actorName} intercambió ${event.label ?? "cartas"} contigo.` }
        : { title: "Intercambio de cartas", detail: `${event.actorName} intercambió ${event.label ?? "cartas"} con ${targetNames}.` };
    if (event.kind === "reverse")
      return { title: "Cambió el sentido", detail: `${event.actorName} invirtió el orden de juego.` };
    if (event.kind === "category")
      return { title: "Nueva categoría", detail: `${event.actorName} eligió «${event.label}».` };
    if (event.kind === "draw") {
      const count = mine?.count ?? event.amount ?? 1;
      const reason = event.reason === "timeout"
        ? "Se agotó el tiempo."
        : event.reason === "rejected"
          ? "La respuesta no fue aceptada."
          : `${event.actorName} pasó y robó.`;
      return mine
        ? { title: `Recibes ${count === 1 ? "una carta" : `${count} cartas`}`, detail: reason }
        : { title: `${targetNames} ${event.targets.length === 1 ? "recibe" : "reciben"} ${count === 1 ? "una carta" : `${count} cartas`}`, detail: reason };
    }
    return null;
  }
  function leave() {
    const ended = room?.status === "closed" || room?.status === "finished";
    if (room && playerId === room.hostId)
      localStorage.removeItem("letrario-host-session");
    else sessionStorage.removeItem("letrario-player-session");
    setRoom(null);
    setPlayerId("");
    setSelected(null);
    if (ended) setRoomCode("");
    if (participantPortal) {
      history.replaceState(null, "", `${location.pathname}?join=1`);
      setScreen("join");
    } else setScreen("home");
  }
  async function leaveRoom() {
    await act("leave");
    leave();
  }
  function requestExit() {
    if (room && playerId === room.hostId) setExitModal(true);
    else void leaveRoom();
  }
  async function closeRoom() {
    const result = await act("close");
    if (result) {
      setExitModal(false);
      leave();
    }
  }
  function levelName(level: "easy" | "medium" | "expert") {
    return { easy: "FÁCIL", medium: "MEDIA", expert: "EXPERTA" }[level];
  }
  function clearRoomCode() {
    setRoomCode("");
    history.replaceState(
      null,
      "",
      participantPortal ? `${location.pathname}?join=1` : location.pathname,
    );
    window.setTimeout(() => codeInputRef.current?.focus(), 0);
  }
  function chooseAvailableRoom(code: string) {
    setRoomCode(code);
    setScreen("join");
    history.replaceState(null, "", `${location.pathname}?join=1&room=${code}`);
    window.setTimeout(() => codeInputRef.current?.focus(), 0);
  }
  function roomList(compact = false) {
    return (
      <section className={`open-rooms ${compact ? "compact" : ""}`}>
        <div className="open-rooms-heading">
          <div>
            <p className="eyebrow">SALAS DISPONIBLES</p>
            <h2>
              {availableRooms.length
                ? "Elige una sala abierta"
                : "No hay salas abiertas"}
            </h2>
          </div>
          {availableRooms.length > 0 && (
            <span>
              {availableRooms.length}{" "}
              {availableRooms.length === 1 ? "sala" : "salas"}
            </span>
          )}
        </div>
        {availableRooms.length > 0 ? (
          <div className="room-list">
            {availableRooms.map((item) => (
              <button
                key={item.code}
                className="room-row"
                onClick={() => chooseAvailableRoom(item.code)}
              >
                <span className="room-code-small">{item.code}</span>
                <span className="room-host">
                  <b>{item.hostName}</b>
                  <small>
                    {item.mode === "classic" ? "Por turnos" : "Simultáneo"} ·{" "}
                    {item.playStyle === "online" ? "En línea" : "En vivo"}
                  </small>
                </span>
                <span className="room-players">
                  <Icon name="groups" size={18} />
                  {item.playerCount}/{item.maxPlayers}
                </span>
                <Icon name="arrow_forward" size={20} />
              </button>
            ))}
          </div>
        ) : (
          <p className="rooms-empty">
            Cuando alguien cree una sala, aparecerá aquí automáticamente.
          </p>
        )}
      </section>
    );
  }
  function scrollToSelectedCategory(behavior: ScrollBehavior = "smooth") {
    const wheel = categoryWheelRef.current;
    const item =
      wheel?.querySelector<HTMLElement>(
        '[data-selected="true"][data-cycle="2"]',
      ) ?? wheel?.querySelector<HTMLElement>('[data-cycle="2"]');
    if (!wheel || !item) return;
    const top = item.offsetTop - (wheel.clientHeight - item.offsetHeight) / 2;
    wheel.scrollTo({ top: Math.max(0, top), behavior });
  }
  async function animateCategoryShuffle() {
    if (!room || shuffling) return;
    const levels = ["easy", "medium", "expert"] as const;
    const options = room.categories.flatMap((card, cardIndex) =>
      levels.map((level) => ({ text: card[level], level, cardIndex })),
    );
    if (!options.length) return;
    const currentIndex = options.findIndex(
      (option) =>
        option.text === room.selectedCategory?.text &&
        option.level === room.selectedCategory?.level,
    );
    let targetIndex = Math.floor(Math.random() * options.length);
    if (options.length > 1 && targetIndex === currentIndex)
      targetIndex = (targetIndex + 1) % options.length;
    const target = options[targetIndex];
    setCategorySearch("");
    setShuffling(true);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const wheel = categoryWheelRef.current;
    if (wheel) {
      const landing = wheel.querySelector<HTMLElement>(
        `[data-cycle="4"][data-category-index="${targetIndex}"]`,
      );
      const destination = landing
        ? landing.offsetTop - (wheel.clientHeight - landing.offsetHeight) / 2
        : wheel.scrollTop;
      const origin = wheel.scrollTop;
      await new Promise<void>((resolve) => {
        const started = performance.now();
        const duration = 1250;
        const frame = (time: number) => {
          const progress = Math.min(1, (time - started) / duration);
          const eased = 1 - Math.pow(1 - progress, 4);
          wheel.scrollTop = origin + (destination - origin) * eased;
          if (progress < 1) requestAnimationFrame(frame);
          else resolve();
        };
        requestAnimationFrame(frame);
      });
    }
    setShuffleStep(targetIndex);
    const result = await act("selectCategory", {
      index: target.cardIndex,
      level: target.level,
    });
    if (result) {
      const normalized = wheel?.querySelector<HTMLElement>(
        `[data-cycle="2"][data-category-index="${targetIndex}"]`,
      );
      if (wheel && normalized)
        wheel.scrollTop =
          normalized.offsetTop -
          (wheel.clientHeight - normalized.offsetHeight) / 2;
      window.setTimeout(() => setShuffleStep(null), 80);
    }
    setShuffling(false);
  }
  function previewCategoryScroll(event: React.UIEvent<HTMLDivElement>) {
    const wheel = event.currentTarget;
    if (!shuffling && !wheelResetting.current) {
      const first = wheel.querySelector<HTMLElement>('[data-cycle="0"]');
      const second = wheel.querySelector<HTMLElement>('[data-cycle="1"]');
      const cycleHeight =
        first && second ? second.offsetTop - first.offsetTop : 0;
      if (cycleHeight) {
        if (wheel.scrollTop < cycleHeight * 0.75) {
          wheelResetting.current = true;
          wheel.scrollTop += cycleHeight * 2;
          requestAnimationFrame(() => (wheelResetting.current = false));
        } else if (wheel.scrollTop > cycleHeight * 3.25) {
          wheelResetting.current = true;
          wheel.scrollTop -= cycleHeight * 2;
          requestAnimationFrame(() => (wheelResetting.current = false));
        }
      }
    }
    const box = wheel.getBoundingClientRect();
    const center = box.top + box.height / 2;
    let closest: number | null = null;
    let distance = Infinity;
    wheel
      .querySelectorAll<HTMLElement>("[data-category-index]")
      .forEach((item) => {
        const rect = item.getBoundingClientRect();
        const next = Math.abs(rect.top + rect.height / 2 - center);
        if (next < distance) {
          distance = next;
          closest = Number(item.dataset.categoryIndex);
        }
      });
    if (closest !== null) setShuffleStep(closest);
  }
  async function selectCategoryCard(
    cardIndex: number,
    level: "easy" | "medium" | "expert",
  ) {
    if (shuffling) return;
    const result = await act("selectCategory", { index: cardIndex, level });
    if (result) {
      setShuffleStep(null);
      setCategorySearch("");
      window.setTimeout(() => scrollToSelectedCategory("auto"), 40);
      show("Categoría seleccionada para iniciar.");
    }
  }
  function categoryBrowser() {
    if (!room || playerId !== room.hostId) return null;
    const query = categorySearch.trim().toLocaleLowerCase("es");
    const levels = ["easy", "medium", "expert"] as const;
    const allOptions = room.categories.flatMap((card, cardIndex) =>
      levels.map((level) => ({ text: card[level], level, cardIndex })),
    );
    const filtered = allOptions
      .map((option, index) => ({ ...option, index }))
      .filter(
        ({ text }) => !query || text.toLocaleLowerCase("es").includes(query),
      );
    const selectedText = room.selectedCategory?.text ?? allOptions[0]?.text;
    const selectedLevel = room.selectedCategory?.level ?? allOptions[0]?.level;
    const selectedFlatIndex = allOptions.findIndex(
      (option) =>
        option.text === selectedText && option.level === selectedLevel,
    );
    const activeIndex = shuffleStep ?? selectedFlatIndex;
    return (
      <section className="category-browser">
        <div
          ref={categoryWheelRef}
          className={`category-wheel ${shuffling ? "shuffling" : ""}`}
          onScroll={previewCategoryScroll}
        >
          <div className="category-wheel-track">
            {Array.from({ length: 5 }).flatMap((_, cycle) =>
              filtered.map(({ text, level, cardIndex, index }) => {
                const isSelected =
                  text === selectedText && level === selectedLevel;
                return (
                  <button
                    type="button"
                    key={`${cycle}-${cardIndex}-${level}`}
                    data-cycle={cycle}
                    data-category-index={index}
                    data-selected={isSelected ? "true" : "false"}
                    className={`${activeIndex === index ? "active" : ""} ${isSelected ? "selected" : ""}`}
                    onClick={() => selectCategoryCard(cardIndex, level)}
                  >
                    {text}
                  </button>
                );
              }),
            )}
            {!filtered.length && (
              <p>No encontramos categorías con esa búsqueda.</p>
            )}
          </div>
        </div>
        <div className="category-browser-actions">
          <label className="category-search">
            <Icon name="search" size={18} />
            <input
              value={categorySearch}
              onChange={(event) => setCategorySearch(event.target.value)}
              placeholder="Buscar categoría…"
            />
          </label>
          <button
            className="shuffle-wheel-button"
            onClick={animateCategoryShuffle}
            disabled={shuffling || busy}
          >
            <Icon name="shuffle" size={18} />
            {shuffling ? "Mezclando…" : "Mezclar categorías"}
          </button>
        </div>
      </section>
    );
  }
  function exitDialog() {
    return exitModal ? (
      <section className="confirm-exit">
        <p>CERRAR SALA</p>
        <h2>¿Finalizar la partida para todos?</h2>
        <span>
          Como eres el anfitrión, los demás jugadores también saldrán de la
          sala.
        </span>
        <div>
          <button onClick={() => setExitModal(false)}>Cancelar</button>
          <button className="danger" onClick={closeRoom}>
            Cerrar partida
          </button>
        </div>
      </section>
    ) : null;
  }

  if (screen === "game" && room) {
    const formatChangeBlocked = Boolean(
      room.pendingVote ||
        room.pendingLive ||
        room.pendingPenalty ||
        room.categoryOptions ||
        Object.keys(room.submissions).length,
    );
    if (room.status === "closed")
      return (
        <main className="closed-shell">
          <section>
            <span>×</span>
            <p>PARTIDA FINALIZADA</p>
            <h1>El anfitrión cerró la sala</h1>
            <button className="primary" onClick={leave}>
              Volver al inicio
            </button>
          </section>
        </main>
      );
    if (room.status === "lobby")
      return (
        <main className="waiting-shell">
          <header className="game-topbar lobby-topbar">
            <button
              className="icon-button"
              aria-label="Salir de la sala"
              title="Salir de la sala"
              onClick={requestExit}
            >
              <Icon name="arrow_back" />
            </button>
            <div className="room-pill">
              <span>SALA</span> {room.code}
            </div>
            <button
              className="icon-button"
              aria-label="Copiar enlace para jugadores"
              title="Copiar enlace para jugadores"
              onClick={() =>
                navigator.clipboard
                  ?.writeText(
                    `${location.origin}${location.pathname}?join=1&room=${room.code}&new=1`,
                  )
                  .then(() =>
                    show(`Enlace de jugadores copiado · ${room.code}`),
                  )
              }
            >
              <Icon name="link" />
            </button>
          </header>
          <section className="waiting-card">
            <p className="eyebrow">SALA PREPARADA</p>
            <h1>Esperando jugadores</h1>
            <div className="big-code">{room.code}</div>
            {categoryBrowser()}
            {playerId === room.hostId && !room.startCountdownEndsAt && (
              <div className="starter-picker">
                <button onClick={() => act("shuffleStarter")} disabled={busy}>
                  <Icon name="casino" size={18} /> Sortear quién inicia
                </button>
                <p>
                  <span>Comienza</span>
                  <b>{room.players[room.turnIndex]?.name}</b>
                </p>
              </div>
            )}
            <p className="play-order-note">
              Orden de juego · según el orden de entrada
            </p>
            <div className="waiting-players">
              {room.players.map((item, index) => (
                <span key={item.id}>
                  <i className="player-order">{index + 1}.º</i>
                  <b>{item.name.slice(0, 1).toUpperCase()}</b>
                  {item.name}
                  {item.id === room.hostId && <small>ANFITRIÓN</small>}
                </span>
              ))}
              {Array.from({ length: Math.max(0, 2 - room.players.length) }).map(
                (_, index) => (
                  <span className="empty" key={index}>
                    + Esperando…
                  </span>
                ),
              )}
            </div>
            {playerId === room.hostId ? (
              <button
                className="primary"
                disabled={room.players.length < 2 || busy}
                onClick={() => act("start")}
              >
                {room.players.length < 2
                  ? "Falta un jugador"
                  : "Comenzar partida"}
                <Icon name="arrow_forward" size={20} />
              </button>
            ) : (
              <span aria-hidden="true" />
            )}
          </section>
          {exitDialog()}
          {toast && <div className="toast">{toast}</div>}
        </main>
      );
    const voteOwner =
      room.pendingVote &&
      room.players.find((item) => item.id === room.pendingVote?.playerId);
    const winner = room.players.find((item) => item.id === room.winnerId);
    return (
      <main className="game-shell" onPointerDown={dismissSelectionFromBackground}>
        <header className="game-topbar">
          <button
            className="icon-button"
            aria-label="Salir de la partida"
            title="Salir de la partida"
            onClick={requestExit}
          >
            <Icon name="arrow_back" />
          </button>
          <div className="room-pill">
            <span>{room.settings.mode === "classic" ? "PT" : "SIM"}</span>{" "}
            {room.code}
          </div>
          <div className="topbar-spacer" />
          <div className="top-actions">
            {playerId === room.hostId && !room.startCountdownEndsAt && (
              <button
                className="icon-button"
                aria-label={
                  room.pausedAt ? "Reanudar partida" : "Pausar partida"
                }
                title={room.pausedAt ? "Reanudar partida" : "Pausar partida"}
                onClick={() => act("togglePause")}
              >
                <Icon name={room.pausedAt ? "play" : "pause"} />
              </button>
            )}
            <button
              className="icon-button"
              aria-label="Copiar enlace para jugadores"
              title="Copiar enlace para jugadores"
              onClick={() =>
                navigator.clipboard
                  ?.writeText(
                    `${location.origin}${location.pathname}?join=1&room=${room.code}&new=1`,
                  )
                  .then(() =>
                    show(`Enlace de jugadores copiado · ${room.code}`),
                  )
              }
            >
              <Icon name="link" />
            </button>
          </div>
        </header>
        <section
          className={`turn-board ${room.players.length > 4 ? "two-rows" : "one-row"}`}
          aria-label={`Orden de juego ${room.direction === 1 ? "hacia la derecha" : "hacia la izquierda"}`}
        >
          <span
            key={`direction-${room.direction}`}
            className="turn-board-direction"
            title={
              room.direction === 1
                ? "El turno avanza hacia la derecha"
                : "El turno avanza hacia la izquierda"
            }
          >
            {room.direction === 1 ? "→" : "←"}
          </span>
          <div
            className="turn-board-grid"
            style={
              {
                "--turn-columns": Math.min(4, room.players.length),
              } as React.CSSProperties
            }
          >
            {room.players.map((item, index) => {
              const isCurrent =
                room.settings.mode === "classic" && index === room.turnIndex;
              const isNext =
                room.settings.mode === "classic" && item.id === nextPlayer?.id;
              return (
                <span
                  key={item.id}
                  className={`turn-board-player ${isCurrent ? "active" : ""} ${isNext ? "next" : ""}`}
                  title={`${item.name}: ${item.cardCount} ${item.cardCount === 1 ? "carta" : "cartas"}${isCurrent ? ", turno actual" : isNext ? ", juega después" : ""}`}
                >
                  <b>{item.name.slice(0, 1).toUpperCase()}</b>
                  <span>{item.name}</span>
                  <strong>{item.cardCount}</strong>
                </span>
              );
            })}
          </div>
        </section>
        <section
          className={`table-zone ${room.categoryOptions && !room.currentCategory ? "choosing-category" : ""}`}
        >
          {room.categoryOptions && !room.currentCategory ? (
            <section className="category-picker category-picker-inline">
              <h2>Carta de categorías</h2>
              {(["easy", "medium", "expert"] as const).map((level) => (
                <button
                  key={level}
                  disabled={
                    categoryChooserId !== playerId
                  }
                  onClick={() => act("chooseCategory", { level })}
                >
                  <small>
                    {
                      { easy: "FÁCIL", medium: "MEDIA", expert: "EXPERTA" }[
                        level
                      ]
                    }
                  </small>
                  <strong>{room.categoryOptions?.[level]}</strong>
                </button>
              ))}
              {categoryChooserId !== playerId && (
                <span>
                  {categoryChooser?.name ?? "Otro jugador"} está escogiendo la
                  categoría…
                </span>
              )}
            </section>
          ) : (
            <>
              <div className="category-card">
                <span className="category-level">{`CATEGORÍA · ${levelName(room.currentCategory!.level)}`}</span>
                <h1>{room.currentCategory!.text}</h1>
                <span className="deck-count">
                  {room.deck.count} en el montón
                </span>
              </div>
              <div
                className={`turn-status ${canPassAndDraw ? "has-action" : "no-action"}`}
              >
                <div className="turn-timer">
                  <div
                    className="timer-ring"
                    style={
                      {
                        "--progress": `${(remaining / (room.settings.turnSeconds || 1)) * 100}%`,
                      } as React.CSSProperties
                    }
                  >
                    <span>{room.pausedAt ? "Ⅱ" : remaining}</span>
                    <small>{room.pausedAt ? "PAUSA" : "SEG"}</small>
                  </div>
                </div>
                <div className="turn-center">
                  <p>
                    <strong>
                      {room.pausedAt
                        ? "Partida en pausa"
                        : room.settings.mode === "simultaneous"
                          ? room.submissions[playerId]
                            ? "Respuesta lista"
                            : "Todos juegan"
                          : current?.id === playerId
                            ? "Tu turno"
                            : `Turno de ${current?.name}`}
                    </strong>
                    <br />
                    {renderRoomMessage(room.message)}
                  </p>
                </div>
                <div className="turn-action">
                  {canPassAndDraw ? (
                    <button
                      className="pass-draw"
                      onClick={() => {
                        setSelected(null);
                        setAnswer("");
                        void act("passAndDraw");
                      }}
                      disabled={busy}
                    >
                      <Icon name="skip_next" size={17} /> Paso y robo
                    </button>
                  ) : (
                    <span aria-hidden="true" />
                  )}
                </div>
              </div>
              <div className="event-slot" aria-live="polite">
                {room.lastEvent && now - room.lastEvent.at < 2400 && (() => {
                  const copy = eventCopy(room.lastEvent!);
                  if (!copy) return null;
                  return (
                    <div className={`game-event-popup ${room.lastEvent!.kind}`}>
                      <span className="game-event-symbol">
                        {room.lastEvent!.kind === "block" ? (
                          <Icon name="block" size={24} />
                        ) : room.lastEvent!.kind === "penalty" || room.lastEvent!.kind === "draw" ? (
                          `+${room.lastEvent!.amount ?? room.lastEvent!.targets.find((target) => target.id === playerId)?.count ?? 1}`
                        ) : room.lastEvent!.kind === "reverse" ? (
                          "↔"
                        ) : room.lastEvent!.kind === "swap" ? (
                          "⇄"
                        ) : (
                          "C"
                        )}
                      </span>
                      <strong>{copy.title}</strong>
                      <small>{copy.detail}</small>
                    </div>
                  );
                })()}
              </div>
              <div
                ref={dropRef}
                className={`drop-zone ${dragging ? "drag-ready" : ""} ${room.pileSettledAt && now - room.pileSettledAt < 650 ? "pile-settling" : ""}`}
              >
                <span className="drop-instruction">
                  {dragging ? "Suelta la carta" : "Arrastra aquí"}
                </span>
                {Boolean(room.centerPile?.length) && (
                  <div className="center-pile" aria-label="Cartas jugadas en el centro">
                    {room.centerPile!.slice(-10).map((play, index, visible) => {
                      const activeRound = play.round === (room.roundNumber ?? 0);
                      const active = visible.filter(
                        (item) => item.round === (room.roundNumber ?? 0),
                      );
                      const activeIndex = active.findIndex(
                        (item) => item.at === play.at && item.playerId === play.playerId,
                      );
                      const activeMid = (active.length - 1) / 2;
                      const x = activeRound ? (activeIndex - activeMid) * 10 : ((index % 3) - 1) * 2;
                      const y = activeRound ? Math.abs(activeIndex - activeMid) * 2 : (index % 2) * 2;
                      const rotation = activeRound
                        ? [-7, 5, -3, 7, -5][index % 5]
                        : [-2, 1, 2][index % 3];
                      return (
                        <div
                          key={`${play.at}-${play.playerId}-${index}`}
                          className={`center-pile-card mini-play-card ${play.kind} ${activeRound ? "active-round" : "settled"}`}
                          title={`${play.playerName} jugó ${play.label}`}
                          style={
                            {
                              "--pile-x": `${x}px`,
                              "--pile-y": `${y}px`,
                              "--pile-rotation": `${rotation}deg`,
                              "--pile-z": index + 1,
                            } as React.CSSProperties
                          }
                        >
                          {centerCardLabel(play.kind, play.label)}
                        </div>
                      );
                    })}
                  </div>
                )}
                {!room.pendingLive &&
                  !room.pendingVote &&
                  room.lastPlay &&
                  now - room.lastPlay.at < 4200 &&
                  !room.centerPile?.some(
                    (play) =>
                      play.playerId === room.lastPlay?.playerId &&
                      play.label === room.lastPlay?.label &&
                      Math.abs(play.at - room.lastPlay!.at) < 10000,
                  ) && (
                    <div className="last-play">
                      <small>{room.lastPlay.playerName} jugó</small>
                      <div className={`mini-play-card ${room.lastPlay.kind}`}>
                        {centerCardLabel(room.lastPlay.kind, room.lastPlay.label)}
                      </div>
                    </div>
                  )}
              </div>
            </>
          )}
        </section>
        {room.startCountdownEndsAt && (
          <div className="start-countdown" aria-live="polite">
            <small>PREPARA Y ORDENA TU MANO</small>
            <strong>{startCountdownRemaining}</strong>
            <span>La partida comenzará automáticamente</span>
          </div>
        )}
        {room.pausedAt && !room.startCountdownEndsAt && (
          <div className="pause-shade">
            {playerId === room.hostId ? (
              <section className="pause-panel">
                <small>RITMO DE JUEGO</small>
                <div className="pause-format" role="group" aria-label="Ritmo de juego">
                  <button
                    className={room.settings.mode === "classic" ? "active" : ""}
                    disabled={formatChangeBlocked || busy}
                    onClick={() => {
                      clearCardSelection();
                      void act("setMode", { mode: "classic" });
                    }}
                  >
                    Por turnos
                  </button>
                  <button
                    className={room.settings.mode === "simultaneous" ? "active" : ""}
                    disabled={formatChangeBlocked || busy}
                    onClick={() => {
                      clearCardSelection();
                      void act("setMode", { mode: "simultaneous" });
                    }}
                  >
                    Simultáneo
                  </button>
                </div>
                <small>FORMATO DE PARTIDA</small>
                <div className="pause-format" role="group" aria-label="Formato de partida">
                  <button
                    className={room.settings.playStyle === "online" ? "active" : ""}
                    disabled={formatChangeBlocked || busy}
                    onClick={() => {
                      clearCardSelection();
                      void act("setPlayStyle", { playStyle: "online" });
                    }}
                  >
                    En línea
                  </button>
                  <button
                    className={room.settings.playStyle === "live" ? "active" : ""}
                    disabled={formatChangeBlocked || busy}
                    onClick={() => {
                      clearCardSelection();
                      void act("setPlayStyle", { playStyle: "live" });
                    }}
                  >
                    En vivo
                  </button>
                </div>
                {formatChangeBlocked && (
                  <span>Resuelve la jugada pendiente antes de cambiar el formato.</span>
                )}
                <button className="pause-center" onClick={() => act("togglePause")}>Reanudar partida</button>
              </section>
            ) : (
              <div className="pause-waiting">
                <strong>Partida en pausa</strong>
                <span>
                  {room.settings.mode === "classic" ? "Por turnos" : "Simultáneo"}
                  {" · "}
                  {room.settings.playStyle === "online" ? "En línea" : "En vivo"}
                </span>
              </div>
            )}
          </div>
        )}
        {room.pendingVote && (
          <section className="vote-panel">
            <p>
              <b>{voteOwner?.name}</b> respondió
            </p>
            <h2>“{room.pendingVote.answer}”</h2>
            {room.pendingVote.playerId === playerId ? (
              <small>Los demás jugadores están votando…</small>
            ) : room.pendingVote.votes[playerId] === undefined ? (
              <div>
                <button
                  className="reject"
                  onClick={() => act("vote", { approve: false })}
                >
                  No válida
                </button>
                <button
                  className="approve"
                  onClick={() => act("vote", { approve: true })}
                >
                  Válida
                </button>
              </div>
            ) : (
              <small>Voto registrado. Esperando al grupo…</small>
            )}
          </section>
        )}
        {room.pendingLive && (
          <section className="live-challenge">
            <p>
              <b>
                {
                  room.players.find(
                    (item) => item.id === room.pendingLive?.playerId,
                  )?.name
                }
              </b>{" "}
              jugó la <strong>{room.lastPlay?.label}</strong>
            </p>
            <span>
              {Math.max(
                0,
                Math.ceil((room.pendingLive.expiresAt - now) / 1000),
              )}
            </span>
            {room.pendingLive.playerId !== playerId ? (
              room.pendingLive.passes?.includes(playerId) ? (
                <button disabled>Respuesta aceptada</button>
              ) : (
                <button onClick={() => act("challengeLive")}>
                  Impugnar respuesta
                </button>
              )
            ) : (
              <button disabled>Esperando impugnaciones…</button>
            )}
          </section>
        )}
        {!room.pendingVote &&
          !room.pendingPenalty &&
          room.settings.playStyle === "online" &&
          selected &&
          ["letter", "joker"].includes(
            hand.find((card) => card.id === selected)?.kind ?? "",
          ) && (
            <form
              className="answer-bar"
              onSubmit={(event) => {
                event.preventDefault();
                submitAnswer();
              }}
            >
              <span
                className={`answer-letter ${hand.find((card) => card.id === selected)?.kind ?? ""}`}
              >
                {hand.find((card) => card.id === selected)?.label}
              </span>
              <input
                aria-label="Respuesta"
                autoFocus
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder={
                  hand.find((card) => card.id === selected)?.kind === "joker"
                    ? "Escribe una palabra con cualquier letra…"
                    : "Escribe tu respuesta…"
                }
              />
              <button type="submit">Enviar</button>
            </form>
          )}
        <section className="hand-area">
          <div className={`hand-toolbar ${me ? "" : "table-view"}`}>
            <strong>{me ? `${hand.length} cartas` : "Pantalla de mesa"}</strong>
            {me && (
              <label>
                <span>Ordenar</span>
                <select
                  value={sortMode}
                  onChange={(event) => {
                    const value = event.target.value as
                        | "az"
                        | "za"
                        | "special-first"
                        | "special-last";
                    if (value === "az" || value === "za")
                      setLetterOrder(value);
                    setSortMode(value);
                  }}
                >
                  <option value="az">A → Z</option>
                  <option value="za">Z → A</option>
                  <option value="special-first">Especiales al inicio</option>
                  <option value="special-last">Especiales al final</option>
                </select>
              </label>
            )}
          </div>
          <div
            ref={handRef}
            className="card-fan"
            onWheel={(event) => {
              if (handRef.current) {
                event.preventDefault();
                handRef.current.scrollLeft += event.deltaY || event.deltaX;
              }
            }}
          >
            {sortedHand.map((card, index) => (
              <button
                key={card.id}
                className={`play-card ${card.kind === "letter" ? "letter" : "action"} ${card.kind} ${cardClass(card)} ${selected === card.id ? "selected" : ""}`}
                style={
                  {
                    "--tilt": `${Math.max(-5, Math.min(5, (index - (sortedHand.length - 1) / 2) * 0.8))}deg`,
                  } as React.CSSProperties
                }
                onPointerDown={(event) => pointerDown(event, card)}
                onPointerMove={pointerMove}
                onPointerUp={pointerUp}
                onPointerCancel={() => {
                  dragStart.current = null;
                  setDragging(null);
                }}
                onClick={(event) => selectCard(card, event)}
                aria-label={`Carta ${card.label}`}
              >
                <span className="card-corner">
                  {card.kind === "stop" ? (
                    <Icon name="block" size={15} />
                  ) : (
                    cardCorner(card)
                  )}
                </span>
                <strong>{cardFace(card)}</strong>
                {card.penalty && <em>+{card.penalty}</em>}
                {card.kind === "reverse" && (
                  <small>
                    CAMBIA EL
                    <br />
                    SENTIDO
                  </small>
                )}
                {card.kind === "swap" && (
                  <small>
                    1 CARTA
                    <br />O LA MANO
                  </small>
                )}
                {card.kind === "joker" && (
                  <small>
                    USA CUALQUIER
                    <br />
                    LETRA
                  </small>
                )}
                {card.kind === "category" && (
                  <small>
                    CAMBIA LA
                    <br />
                    CATEGORÍA
                  </small>
                )}
              </button>
            ))}
          </div>
        </section>
        {dragging && (
          <div
            className={`drag-ghost ${cardClass(dragging.card)}`}
            style={{ left: dragging.x, top: dragging.y }}
          >
            <strong>{cardFace(dragging.card)}</strong>
          </div>
        )}
        {flyingCard && (
          <div
            key={flyingCard.token}
            className={`card-flight ${flyingCard.card.kind} ${cardClass(flyingCard.card)}`}
            style={
              {
                "--flight-x": `${flyingCard.targetX}px`,
                "--flight-y": `${flyingCard.targetY}px`,
              } as React.CSSProperties
            }
          >
            <span>{cardCorner(flyingCard.card)}</span>
            <strong>{cardFace(flyingCard.card)}</strong>
          </div>
        )}
        {incomingCards > 0 && (
          <div
            className="incoming-cards"
            aria-label={`Recibes ${incomingCards} ${incomingCards === 1 ? "carta" : "cartas"}`}
          >
            {Array.from({ length: incomingCards }).map((_, index) => {
              const offset = (index - (incomingCards - 1) / 2) * 20;
              return (
                <div
                  key={`${myLatestDraw?.at}-${index}`}
                  className="incoming-card"
                  style={
                    {
                      "--draw-offset": `${offset}px`,
                      "--draw-tilt": `${offset / 4}deg`,
                      "--draw-delay": `${index * 90}ms`,
                    } as React.CSSProperties
                  }
                >
                  <span aria-hidden="true">?</span>
                </div>
              );
            })}
          </div>
        )}
        {room.pendingPenalty && (
          <section className="action-picker penalty-picker" aria-live="polite">
            <p>
              SANCIÓN +{room.pendingPenalty.total} · CARTA {room.pendingPenalty.cardLabel}
            </p>
            <h2>Reparte las cartas</h2>
            {room.pendingPenalty.playerId === playerId ? (
              <>
                <div className="penalty-remaining">
                  <strong>{penaltyRemaining}</strong>
                  <span>
                    {penaltyRemaining === 1
                      ? "carta por entregar"
                      : "cartas por entregar"}
                  </span>
                </div>
                <div className="penalty-targets">
                  {penaltyTargets.map((target, index) => {
                    const count = penaltyAllocations[target.id] ?? 0;
                    return (
                      <div
                        key={target.id}
                        className={`penalty-target ${count ? "selected" : ""}`}
                      >
                        <span className="penalty-order">{index + 1}</span>
                        <button
                          type="button"
                          className="penalty-player"
                          onClick={() => changePenaltyTarget(target.id, 1)}
                        >
                          <b>{target.name}</b>
                          <small>{target.cardCount} cartas</small>
                        </button>
                        <div className="penalty-stepper">
                          <button
                            type="button"
                            aria-label={`Quitar una carta a ${target.name}`}
                            disabled={!count}
                            onClick={() => changePenaltyTarget(target.id, -1)}
                          >
                            −
                          </button>
                          <strong>{count ? `+${count}` : "0"}</strong>
                          <button
                            type="button"
                            aria-label={`Entregar una carta a ${target.name}`}
                            disabled={!penaltyRemaining}
                            onClick={() => changePenaltyTarget(target.id, 1)}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button
                  className="primary full penalty-confirm"
                  disabled={penaltyRemaining !== 0 || busy}
                  onClick={() => void confirmPenalty()}
                >
                  Entregar {room.pendingPenalty.total === 1 ? "carta" : "cartas"}
                </button>
              </>
            ) : (
              <div className="penalty-waiting">
                <strong>
                  {
                    room.players.find(
                      (item) => item.id === room.pendingPenalty?.playerId,
                    )?.name
                  }
                </strong>
                <span>está eligiendo quién recibe la sanción…</span>
              </div>
            )}
          </section>
        )}
        {swapCard && (
          <section className="action-picker">
            <p>CARTA SWAP</p>
            <h2>¿Qué quieres intercambiar?</h2>
            <div className="swap-types">
              <button
                className={swapType === "one" ? "active" : ""}
                onClick={() => setSwapType("one")}
              >
                Una carta
              </button>
              <button
                className={swapType === "whole" ? "active" : ""}
                onClick={() => setSwapType("whole")}
              >
                Toda la mano
              </button>
            </div>
            <label>
              Elige un jugador
              <select
                value={swapTarget}
                onChange={(event) => setSwapTarget(event.target.value)}
              >
                {room.players
                  .filter((item) => item.id !== playerId)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.cardCount} cartas
                    </option>
                  ))}
              </select>
            </label>
            <div className="modal-actions">
              <button onClick={() => setSwapCard(null)}>Cancelar</button>
              <button
                className="confirm"
                disabled={!swapTarget}
                onClick={confirmSwap}
              >
                Intercambiar
              </button>
            </div>
          </section>
        )}
        {room.status === "finished" && (
          <div className="winner-overlay">
            <div>
              <span>★</span>
              <p>FIN DE LA PARTIDA</p>
              <h1>{winner?.name} gana</h1>
              <button className="primary" onClick={leave}>
                Volver al inicio
              </button>
            </div>
          </div>
        )}
        {exitDialog()}
        {toast && <div className="toast">{toast}</div>}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="brand-bar">
        <div className="brand-lockup">
          <button
            className="brand"
            onClick={() => setScreen(participantPortal ? "join" : "home")}
          >
            <span>STU</span>
            <b>NO</b>
          </button>
          <small
            className="version-label"
            title="V43 · Stuno y categorías persistentes"
          >
            V43
          </small>
        </div>
        <button
          className="rules-button"
          onClick={() =>
            show(
              "La meta es quedarte sin cartas. Cada respuesta debe comenzar por la letra jugada.",
            )
          }
        >
          <Icon name="help" size={18} />
          <span>Cómo jugar</span>
        </button>
      </header>
      {screen === "home" ? (
        <section className="home-grid">
          <div className="hero-copy">
            <p className="eyebrow">PALABRAS · CARTAS · INGENIO</p>
            <h1>
              Piensa rápido.
              <br />
              <em>Juega tu letra.</em>
            </h1>
            <p className="hero-text">
              Una carrera de palabras para jugar juntos, desde cualquier lugar o
              alrededor de la misma mesa.
            </p>
            <div className="primary-actions">
              <button className="primary" onClick={() => setScreen("create")}>
                Crear sala <Icon name="arrow_forward" size={18} />
              </button>
            </div>
            <button className="editor-link" onClick={() => setScreen("editor")}>
              <Icon name="category" size={17} /> Administrar categorías
            </button>
          </div>
          <div className="hero-cards" aria-hidden="true">
            <div className="float-card red">
              <small>CATEGORÍA</small>
              <strong>
                Cosas que encuentras
                <br />
                en un aeropuerto
              </strong>
              <span>MEDIA</span>
            </div>
            <div className="float-card blue">
              <small>LETRA</small>
              <strong>M</strong>
              <span>+1</span>
            </div>
            <div className="float-card gold">
              <small>COMODÍN</small>
              <strong>★</strong>
              <span>CUALQUIER LETRA</span>
            </div>
          </div>
          <div className="mode-strip">
            <div>
              <span>01</span>
              <p>
                <b>Clásico</b>Responde en tu turno
              </p>
            </div>
            <div>
              <span>02</span>
              <p>
                <b>Simultáneo</b>Todos contra el reloj
              </p>
            </div>
            <div>
              <span>03</span>
              <p>
                <b>En vivo</b>Tu móvil es tu mano
              </p>
            </div>
          </div>
        </section>
      ) : screen === "editor" ? (
        <section className="panel editor-panel">
          <div className="panel-heading">
            <button
              className="back"
              aria-label="Volver"
              title="Volver"
              onClick={() => setScreen("home")}
            >
              <Icon name="arrow_back" />
            </button>
            <div>
              <p className="eyebrow">CATÁLOGO GLOBAL DE STUNO</p>
              <h1>{categoryEditorUnlocked ? title : "Acceso administrativo"}</h1>
            </div>
            {categoryEditorUnlocked && (
              <div className="editor-actions">
                <button
                  className="secondary small"
                  onClick={() =>
                    setCategories([
                      ...categories,
                      ["Nueva categoría", "Nivel medio", "Nivel experto"],
                    ])
                  }
                >
                  <Icon name="add" size={20} /> Nueva tarjeta
                </button>
                <button
                  className="primary small"
                  disabled={categorySaving}
                  onClick={saveGlobalCategories}
                >
                  {categorySaving ? "Guardando…" : "Guardar cambios"}
                </button>
              </div>
            )}
          </div>
          {!categoryEditorUnlocked ? (
            <form
              className="admin-access"
              onSubmit={(event) => {
                event.preventDefault();
                void unlockCategoryEditor();
              }}
            >
              <p>
                Introduce la clave administrativa para añadir, modificar o
                eliminar categorías globales.
              </p>
              <label>
                Clave administrativa
                <input
                  type="password"
                  autoComplete="current-password"
                  value={categoryAdminKey}
                  onChange={(event) => setCategoryAdminKey(event.target.value)}
                />
              </label>
              <button
                className="primary"
                type="submit"
                disabled={!categoryAdminKey.trim() || categorySaving}
              >
                {categorySaving ? "Verificando…" : "Entrar al editor"}
              </button>
            </form>
          ) : (
            <>
              <p className="panel-intro">
                Cada tarjeta reúne una opción fácil, una media y una experta.
                Al guardar, los cambios estarán disponibles en todos los
                dispositivos.
              </p>
              <div className="category-list">
            {categories.map((category, index) => (
              <article className="category-row" key={index}>
                <span className="row-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {category.map((item, level) => (
                  <label key={level}>
                    <small>{["FÁCIL", "MEDIA", "EXPERTA"][level]}</small>
                    <input
                      value={item}
                      onChange={(event) =>
                        setCategories(
                          categories.map((row, rowIndex) =>
                            rowIndex === index
                              ? row.map((value, itemIndex) =>
                                  itemIndex === level
                                    ? event.target.value
                                    : value,
                                )
                              : row,
                          ),
                        )
                      }
                    />
                  </label>
                ))}
                <button
                  className="delete-button"
                  aria-label="Eliminar tarjeta"
                  title="Eliminar tarjeta"
                  onClick={() =>
                    setCategories(
                      categories.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                >
                  <Icon name="delete" size={21} />
                </button>
              </article>
            ))}
              </div>
            </>
          )}
        </section>
      ) : (
        <section className="panel setup-panel">
          <div className="panel-heading">
            {!participantPortal && (
              <button
                className="back"
                aria-label="Volver"
                title="Volver"
                onClick={() => setScreen("home")}
              >
                <Icon name="arrow_back" size={19} />
              </button>
            )}
            <div>
              <p className="eyebrow">
                {screen === "join" ? "ACCESO PARA JUGADORES" : "NUEVA PARTIDA"}
              </p>
              <h1>{title}</h1>
            </div>
          </div>
          {screen === "join" ? (
            <div className="join-layout">
              <div className="join-box">
                <label>
                  Tu nombre
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="¿Cómo te llamas?"
                  />
                </label>
                <label>
                  Código de la sala
                  <div className="code-field">
                    <input
                      ref={codeInputRef}
                      className="code-input"
                      value={roomCode}
                      onChange={(event) =>
                        setRoomCode(
                          event.target.value.toUpperCase().slice(0, 4),
                        )
                      }
                      placeholder="ABCD"
                    />
                    {roomCode && (
                      <button
                        type="button"
                        className="clear-code"
                        aria-label="Limpiar código"
                        title="Limpiar código"
                        onClick={clearRoomCode}
                      >
                        <Icon name="close" size={17} />
                      </button>
                    )}
                  </div>
                </label>
                <button
                  className="primary"
                  disabled={!name.trim() || roomCode.length < 4 || busy}
                  onClick={() => joinRoom(false)}
                >
                  Entrar a la partida <Icon name="arrow_forward" size={18} />
                </button>
                <button
                  className="table-link"
                  disabled={roomCode.length < 4 || busy}
                  onClick={() => joinRoom(true)}
                >
                  Usar como pantalla de mesa
                </button>
              </div>
              {roomList(true)}
            </div>
          ) : (
            <div className="setup-grid">
              <div className="setup-main">
                <label className="field-label">
                  Tu nombre
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Nombre del anfitrión"
                  />
                </label>
                <fieldset>
                  <legend>Ritmo de juego</legend>
                  <div className="choice-grid">
                    <button
                      className={
                        mode === "classic" ? "choice active" : "choice"
                      }
                      onClick={() => setMode("classic")}
                    >
                      <span>↻</span>
                      <b>Por turnos</b>
                      <small>Una letra, un turno</small>
                    </button>
                    <button
                      className={
                        mode === "simultaneous" ? "choice active" : "choice"
                      }
                      onClick={() => setMode("simultaneous")}
                    >
                      <span>⚡</span>
                      <b>Simultáneo</b>
                      <small>Todos contra el reloj</small>
                    </button>
                  </div>
                </fieldset>
                <fieldset>
                  <legend>¿Dónde juegan?</legend>
                  <div className="segmented">
                    <button
                      className={playStyle === "online" ? "active" : ""}
                      onClick={() => setPlayStyle("online")}
                    >
                      En línea
                    </button>
                    <button
                      className={playStyle === "live" ? "active" : ""}
                      onClick={() => setPlayStyle("live")}
                    >
                      En vivo
                    </button>
                  </div>
                  <p className="hint">
                    {playStyle === "online"
                      ? "Cada persona escribe desde su dispositivo."
                      : "Las respuestas se dicen en voz alta."}
                  </p>
                </fieldset>
              </div>
              <aside className="setup-aside">
                <div className="timing-settings">
                  <TimeWheel
                    label="Tiempo de respuesta"
                    value={seconds}
                    min={5}
                    max={120}
                    onChange={setSeconds}
                  />
                  <TimeWheel
                    label="Tiempo para ordenar la mano"
                    value={startDelay}
                    min={3}
                    max={10}
                    onChange={setStartDelay}
                  />
                </div>
                <div className="summary">
                  <p>
                    <span>Modo</span>
                    <b>{mode === "classic" ? "Por turnos" : "Simultáneo"}</b>
                  </p>
                  <p>
                    <span>Formato</span>
                    <b>{playStyle === "online" ? "En línea" : "En vivo"}</b>
                  </p>
                  <p>
                    <span>Categorías</span>
                    <b>{categories.length * 3} incluidas</b>
                  </p>
                  <p>
                    <span>Preparación</span>
                    <b>{startDelay} segundos</b>
                  </p>
                </div>
                <button
                  className="primary full"
                  disabled={!name.trim() || busy}
                  onClick={createRoom}
                >
                  {busy ? "Creando…" : "Crear sala"}
                  <Icon name="arrow_forward" size={18} />
                </button>
              </aside>
            </div>
          )}
        </section>
      )}
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
