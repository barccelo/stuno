import { DEFAULT_CATEGORY_CARDS } from "./categories";

export type CardKind =
  "letter" | "joker" | "stop" | "reverse" | "swap" | "category";
export type GameCard = {
  id: string;
  label: string;
  kind: CardKind;
  penalty?: number;
};
export type CategoryCard = { title?: string; easy: string; medium: string; expert: string };
export type Player = {
  id: string;
  name: string;
  hand: GameCard[];
  wins: number;
};
export type Submission = {
  playerId: string;
  cardId: string;
  answer: string;
  cardLabel?: string;
  matchMode?: "starts" | "contains";
};
export type PendingVote = Submission & { votes: Record<string, boolean> };
export type PendingLive = Submission & { expiresAt: number; passes?: string[] };
export type LastPlay = {
  playerId: string;
  playerName: string;
  label: string;
  kind: CardKind;
  at: number;
};
export type CenterPlay = LastPlay & { round: number };
export type LastDraw = { playerId: string; count: number; at: number };
export type PendingPenalty = {
  playerId: string;
  total: number;
  cardLabel: string;
  continuation: "classic" | "simultaneous";
  finishAfter: boolean;
};
export type GameState = {
  code: string;
  hostId: string;
  hostLastSeenAt?: number;
  status: "lobby" | "playing" | "finished" | "closed";
  settings: {
    mode: "classic" | "simultaneous";
    playStyle: "online" | "live";
    turnSeconds: number;
    startDelaySeconds: number;
    difficulty: "easy" | "medium" | "expert" | "mixed";
  };
  players: Player[];
  departedPlayers?: {
    player: Player;
    index: number;
    leftAt: number;
  }[];
  spectators: { id: string; name: string }[];
  deck: GameCard[];
  discard: GameCard[];
  categories: CategoryCard[];
  categoryIndex: number;
  categoryOptions: CategoryCard | null;
  currentCategory: { level: "easy" | "medium" | "expert"; text: string } | null;
  categoryChooserId?: string | null;
  categoryOwnerId?: string | null;
  selectedCategory?: {
    level: "easy" | "medium" | "expert";
    text: string;
  } | null;
  turnIndex: number;
  direction: 1 | -1;
  turnStartedAt: number;
  pendingVote: PendingVote | null;
  pendingLive: PendingLive | null;
  pendingPenalty?: PendingPenalty | null;
  lastPlay: LastPlay | null;
  centerPile?: CenterPlay[];
  roundNumber?: number;
  turnsInRound?: number;
  pileSettledAt?: number | null;
  lastDraw?: LastDraw | null;
  drawEvents?: LastDraw[];
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
  submissions: Record<string, Submission>;
  reviewQueue: Submission[];
  simultaneousRoundAccepted?: boolean;
  acceptedWords: string[];
  message: string;
  winnerId: string | null;
  pausedAt: number | null;
  pausedForMissingPlayers?: boolean;
  startCountdownEndsAt?: number | null;
};

export function categories(custom?: CategoryCard[]) {
  return custom && custom.length ? custom : DEFAULT_CATEGORY_CARDS;
}

export function makeDeck(idPrefix = ""): GameCard[] {
  const cards: GameCard[] = [];
  let n = 0;
  const prefix = idPrefix ? `${idPrefix}-` : "";
  const add = (label: string, kind: CardKind = "letter", penalty?: number) =>
    cards.push({ id: `${prefix}c${n++}`, label, kind, penalty });
  "A A A A E E E E I I I O O O U U U B B C C C D D L L L M M M N N N P P P R R R R S S S S T"
    .split(" ")
    .forEach((letter) => add(letter));
  ["F", "F", "G", "H", "V", "V"].forEach((letter) => add(letter, "letter", 1));
  ["J", "Q", "Y", "Z"].forEach((letter) => add(letter, "letter", 2));
  ["K", "Ñ", "W", "X"].forEach((letter) => add(letter, "letter", 3));
  for (let i = 0; i < 8; i++) add("★", "joker");
  for (let i = 0; i < 4; i++) add("BLOQUEAR TURNO", "stop");
  for (let i = 0; i < 4; i++) add("INVERSA", "reverse");
  for (let i = 0; i < 3; i++) add("SWAP", "swap");
  // Keep the original two cards and add eighteen more: twenty total.
  for (let i = 0; i < 20; i++) add("NUEVA CATEGORÍA", "category");
  return shuffle(cards);
}

export function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
export function draw(state: GameState, player: Player, count = 1) {
  let drawn = 0;
  for (let i = 0; i < count; i++) {
    if (!state.deck.length && state.discard.length) {
      state.deck = shuffle(state.discard.splice(0));
    }
    if (!state.deck.length) {
      const refillId = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      state.deck = makeDeck(refillId);
    }
    const card = state.deck.pop();
    if (card) {
      player.hand.push(card);
      drawn++;
    }
  }
  return drawn;
}
export function nextIndex(state: GameState, extra = 1) {
  const length = state.players.length;
  state.turnIndex =
    (state.turnIndex + state.direction * extra + length * 4) % length;
  state.turnStartedAt = Date.now();
  state.turnsInRound = (state.turnsInRound ?? 0) + extra;
  if (length && state.turnsInRound >= length) {
    state.turnsInRound %= length;
    state.roundNumber = (state.roundNumber ?? 0) + 1;
    state.pileSettledAt = Date.now();
  }
}
export function chooseCategory(state: GameState) {
  const current = normalized(state.currentCategory?.text ?? "");
  const levels = ["easy", "medium", "expert"] as const;
  let nextOptions: CategoryCard | null = null;

  for (let attempt = 0; attempt < state.categories.length; attempt++) {
    const source = state.categories[state.categoryIndex % state.categories.length];
    state.categoryIndex++;
    const candidate: CategoryCard = {
      ...source,
      easy: current && normalized(source.easy) === current ? "" : source.easy,
      medium: current && normalized(source.medium) === current ? "" : source.medium,
      expert: current && normalized(source.expert) === current ? "" : source.expert,
    };
    if (levels.some((level) => candidate[level]?.trim())) {
      nextOptions = candidate;
      break;
    }
  }

  if (!nextOptions) {
    nextOptions = state.categories[state.categoryIndex % state.categories.length] ?? null;
    if (nextOptions) state.categoryIndex++;
  }

  state.categoryOptions = nextOptions;
  state.currentCategory = null;
  state.turnStartedAt = 0;
}
export function normalized(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}