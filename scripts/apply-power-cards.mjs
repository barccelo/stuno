import { readFile, writeFile } from "node:fs/promises";

async function patch(path, transform) {
  const before = await readFile(path, "utf8");
  const after = transform(before);
  if (after !== before) await writeFile(path, after, "utf8");
}

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`No se encontró el bloque esperado para: ${label}`);
  return source.replace(from, to);
}

function insertBeforeRequired(source, anchor, addition, marker, label) {
  if (source.includes(marker)) return source;
  if (!source.includes(anchor)) throw new Error(`No se encontró el punto esperado para: ${label}`);
  return source.replace(anchor, addition + anchor);
}

await patch("lib/game.ts", (source) => {
  source = replaceRequired(
    source,
    'export type CardKind =\n  "letter" | "joker" | "stop" | "reverse" | "swap" | "category";',
    'export type CardKind =\n  "letter" | "joker" | "stop" | "reverse" | "swap" | "category" | "combo" | "steal";',
    "tipos de cartas COMBO y ROBO",
  );

  if (!source.includes("comboLetterIds?: string[];")) {
    source = replaceRequired(
      source,
      '  matchMode?: "starts" | "contains";\n};',
      '  matchMode?: "starts" | "contains";\n  comboLetterIds?: string[];\n};',
      "datos de una jugada COMBO",
    );
  }

  if (!source.includes("export type PendingSteal =")) {
    const anchor = 'export type GameState = {';
    const addition = [
      'export type PendingSteal = {',
      '  actorId: string;',
      '  targetId: string;',
      '  cardId: string;',
      '  at: number;',
      '};',
      '',
    ].join("\n");
    source = insertBeforeRequired(source, anchor, addition, "export type PendingSteal =", "tipo PendingSteal");
  }

  if (!source.includes("pendingSteal?: PendingSteal | null;")) {
    source = replaceRequired(
      source,
      '  pendingPenalty?: PendingPenalty | null;\n',
      '  pendingPenalty?: PendingPenalty | null;\n  pendingSteal?: PendingSteal | null;\n',
      "estado de robo pendiente",
    );
  }

  if (!source.includes('"steal" | "combo" | "draw"')) {
    source = replaceRequired(
      source,
      '    kind: "block" | "penalty" | "reverse" | "category" | "swap" | "draw";',
      '    kind: "block" | "penalty" | "reverse" | "category" | "swap" | "steal" | "combo" | "draw";',
      "eventos de COMBO y ROBO",
    );
  }

  if (!source.includes('add("COMBO", "combo")')) {
    const anchor = '  for (let i = 0; i < 3; i++) add("SWAP", "swap");\n';
    const addition = [
      anchor.trimEnd(),
      '  for (let i = 0; i < 3; i++) add("COMBO", "combo");',
      '  for (let i = 0; i < 3; i++) add("ROBO", "steal");',
      '',
    ].join("\n");
    if (!source.includes(anchor)) throw new Error("No se encontró el punto del mazo para COMBO y ROBO.");
    source = source.replace(anchor, addition);
  }

  return source;
});

await patch("app/api/rooms/route.ts", (source) => {
  source = replaceRequired(
    source,
    '      hand: player.id === playerId ? player.hand : undefined,',
    '      hand:\n        player.id === playerId ||\n        (state.pendingSteal?.actorId === playerId && state.pendingSteal.targetId === player.id)\n          ? player.hand\n          : undefined,',
    "revelar únicamente la mano del objetivo de ROBO",
  );

  if (!source.includes("function comboWordLetters(")) {
    const anchor = 'function drawWithEvent(state: GameState, target: Player, count = 1) {';
    const helper = [
      'function comboWordLetters(value: string) {',
      '  return value',
      '    .trim()',
      '    .toLocaleLowerCase("es")',
      '    .replace(/ñ/g, "~")',
      '    .normalize("NFD")',
      '    .replace(/[\\u0300-\\u036f]/g, "")',
      '    .replace(/~/g, "ñ")',
      '    .replace(/[^a-zñ]/g, "");',
      '}',
      'function comboSignature(value: string) {',
      '  return comboWordLetters(value).split("").sort().join("");',
      '}',
      '',
    ].join("\n");
    source = insertBeforeRequired(source, anchor, helper, "function comboWordLetters(", "validación de letras COMBO");
  }

  if (!source.includes("// COMBO accepted: remove the special and exactly the chosen letters.")) {
    const anchor = '  owner.hand = owner.hand.filter((item) => item.id !== card.id);\n';
    const comboAccepted = [
      '  // COMBO accepted: remove the special and exactly the chosen letters.',
      '  if (card.kind === "combo") {',
      '    const ids = Array.from(new Set(submission.comboLetterIds ?? []));',
      '    const letters = ids',
      '      .map((cardId) => cardFrom(owner.hand, cardId))',
      '      .filter((item): item is GameCard => Boolean(item));',
      '    if (',
      '      ids.length < 4 ||',
      '      ids.length > 6 ||',
      '      letters.length !== ids.length ||',
      '      letters.some((item) => item.kind !== "letter") ||',
      '      comboWordLetters(submission.answer).length !== letters.length ||',
      '      comboSignature(submission.answer) !== comboSignature(letters.map((item) => item.label).join(""))',
      '    ) {',
      '      state.message = "El COMBO ya no coincide con las cartas seleccionadas.";',
      '      return false;',
      '    }',
      '    const removeIds = new Set([card.id, ...ids]);',
      '    owner.hand = owner.hand.filter((item) => !removeIds.has(item.id));',
      '    state.discard.push(card, ...letters);',
      '    recordCenterPlay(state, owner, card);',
      '    state.acceptedWords.push(normalized(submission.answer));',
      '    if (owner.hand.length === 0) drawWithEvent(state, owner, 1);',
      '    state.lastEvent = {',
      '      kind: "combo",',
      '      actorId: owner.id,',
      '      actorName: owner.name,',
      '      targets: [],',
      '      label: submission.answer,',
      '      global: true,',
      '      at: Date.now(),',
      '    };',
      '    state.message = owner.name + " completó un COMBO con “" + submission.answer + "”.";',
      '    return false;',
      '  }',
      '',
    ].join("\n");
    source = insertBeforeRequired(source, anchor, comboAccepted, "// COMBO accepted:", "resolución de COMBO aprobado");
  }

  if (!source.includes("// A rejected COMBO loses the COMBO card but keeps its letters.")) {
    const start = source.indexOf("function resolveVote(state: GameState, approved: boolean) {");
    const end = source.indexOf("function finalizeExpiredVote", start);
    if (start < 0 || end < 0) throw new Error("No se encontró resolveVote para el rechazo de COMBO.");
    let block = source.slice(start, end);
    const old = [
      '  else if (owner) {',
      '    drawWithEvent(state, owner, 1);',
      '    state.lastEvent = {',
      '      kind: "draw",',
      '      actorId: "system",',
      '      actorName: "Respuesta rechazada",',
      '      targets: [{ id: owner.id, name: owner.name, count: 1 }],',
      '      amount: 1,',
      '      reason: "rejected",',
      '      at: Date.now(),',
      '    };',
      '    state.message = `La respuesta de ${owner.name} no fue aceptada.`;',
      '  }',
    ].join("\n");
    const replacement = [
      '  else if (owner) {',
      '    // A rejected COMBO loses the COMBO card but keeps its letters.',
      '    const rejectedCard = cardFrom(owner.hand, pending.cardId);',
      '    if (rejectedCard?.kind === "combo") {',
      '      owner.hand = owner.hand.filter((item) => item.id !== rejectedCard.id);',
      '      state.deck = shuffle([...state.deck, rejectedCard]);',
      '      state.lastEvent = {',
      '        kind: "combo",',
      '        actorId: owner.id,',
      '        actorName: owner.name,',
      '        targets: [],',
      '        label: "rechazado",',
      '        global: true,',
      '        at: Date.now(),',
      '      };',
      '      state.message = "El COMBO de " + owner.name + " fue rechazado y volvió al mazo.";',
      '    } else {',
      '      drawWithEvent(state, owner, 1);',
      '      state.lastEvent = {',
      '        kind: "draw",',
      '        actorId: "system",',
      '        actorName: "Respuesta rechazada",',
      '        targets: [{ id: owner.id, name: owner.name, count: 1 }],',
      '        amount: 1,',
      '        reason: "rejected",',
      '        at: Date.now(),',
      '      };',
      '      state.message = "La respuesta de " + owner.name + " no fue aceptada.";',
      '    }',
      '  }',
    ].join("\n");
    if (!block.includes(old)) throw new Error("No se encontró el rechazo normal dentro de resolveVote.");
    block = block.replace(old, replacement);
    source = source.slice(0, start) + block + source.slice(end);
  }

  if (!source.includes("pendingSteal: null,")) {
    source = replaceRequired(
      source,
      '        pendingPenalty: null,\n',
      '        pendingPenalty: null,\n        pendingSteal: null,\n',
      "inicializar ROBO pendiente",
    );
  }

  if (!source.includes('state.pendingSteal = null;\n      state.status = "playing";')) {
    source = replaceRequired(
      source,
      '      state.status = "playing";\n',
      '      state.pendingSteal = null;\n      state.status = "playing";\n',
      "limpiar ROBO al iniciar",
    );
  }

  if (!source.includes("state.pendingSteal?.targetId === playerId)")) {
    const anchor = '      if (state.pendingPenalty?.playerId === playerId)\n        state.pendingPenalty = null;\n';
    const addition = [
      anchor.trimEnd(),
      '      if (state.pendingSteal?.actorId === playerId || state.pendingSteal?.targetId === playerId)',
      '        state.pendingSteal = null;',
      '',
    ].join("\n");
    if (!source.includes(anchor)) throw new Error("No se encontró la limpieza de pendientes al salir.");
    source = source.replace(anchor, addition);
  }

  if (!source.includes('action === "lockStealTarget"')) {
    const anchor = '    } else if (action === "play") {';
    const actions = [
      '    } else if (action === "lockStealTarget") {',
      '      if (state.status !== "playing" || state.pausedAt || !state.currentCategory)',
      '        return Response.json({ error: "No se puede jugar ROBO en este momento" }, { status: 409 });',
      '      if (state.pendingLive || state.pendingVote || state.pendingPenalty || state.pendingSteal)',
      '        return Response.json({ error: "Primero hay que resolver la jugada anterior" }, { status: 409 });',
      '      if (',
      '        state.settings.mode === "classic" &&',
      '        state.players[state.turnIndex]?.id !== playerId',
      '      )',
      '        return Response.json({ error: "No es tu turno" }, { status: 409 });',
      '      if (state.settings.mode === "simultaneous" && state.submissions[playerId])',
      '        return Response.json({ error: "Tu respuesta ya está lista" }, { status: 409 });',
      '      const stealCard = cardFrom(actor!.hand, String(body.cardId ?? ""));',
      '      if (!stealCard || stealCard.kind !== "steal")',
      '        return Response.json({ error: "Carta ROBO no disponible" }, { status: 409 });',
      '      const stealTarget = state.players.find(',
      '        (item) => item.id === String(body.targetId ?? "") && item.id !== playerId,',
      '      );',
      '      if (!stealTarget)',
      '        return Response.json({ error: "Elige un jugador válido" }, { status: 400 });',
      '      if (!stealTarget.hand.length)',
      '        return Response.json({ error: "Ese jugador no tiene cartas para robar" }, { status: 409 });',
      '      actor!.hand = actor!.hand.filter((item) => item.id !== stealCard.id);',
      '      state.discard.push(stealCard);',
      '      recordCenterPlay(state, actor!, stealCard);',
      '      if (actor!.hand.length === 0) drawWithEvent(state, actor!, 1);',
      '      state.lastPlay = {',
      '        playerId,',
      '        playerName: actor!.name,',
      '        label: stealCard.label,',
      '        kind: stealCard.kind,',
      '        at: Date.now(),',
      '      };',
      '      state.pendingSteal = {',
      '        actorId: playerId,',
      '        targetId: stealTarget.id,',
      '        cardId: stealCard.id,',
      '        at: Date.now(),',
      '      };',
      '      state.message = actor!.name + " fijó a " + stealTarget.name + " como objetivo de ROBO.";',
      '    } else if (action === "completeSteal") {',
      '      const pendingSteal = state.pendingSteal;',
      '      if (!pendingSteal)',
      '        return Response.json({ error: "No hay un ROBO pendiente" }, { status: 409 });',
      '      if (pendingSteal.actorId !== playerId)',
      '        return Response.json({ error: "Otro jugador está resolviendo el ROBO" }, { status: 403 });',
      '      const lockedTarget = player(state, pendingSteal.targetId);',
      '      if (!lockedTarget) {',
      '        state.pendingSteal = null;',
      '        return Response.json({ error: "El objetivo ya no está en la sala" }, { status: 409 });',
      '      }',
      '      const chosenCard = cardFrom(lockedTarget.hand, String(body.targetCardId ?? ""));',
      '      if (!chosenCard)',
      '        return Response.json({ error: "Esa carta ya no está disponible" }, { status: 409 });',
      '      lockedTarget.hand = lockedTarget.hand.filter((item) => item.id !== chosenCard.id);',
      '      actor!.hand.push(chosenCard);',
      '      state.pendingSteal = null;',
      '      state.lastEvent = {',
      '        kind: "steal",',
      '        actorId: actor!.id,',
      '        actorName: actor!.name,',
      '        targets: [{ id: lockedTarget.id, name: lockedTarget.name }],',
      '        at: Date.now(),',
      '      };',
      '      nextIndex(state);',
      '      state.message = actor!.name + " robó una carta elegida a " + lockedTarget.name + ".";',
      '    } else if (action === "play") {',
    ].join("\n");
    source = replaceRequired(source, anchor, actions, "acciones de la carta ROBO");
  }

  if (!source.includes("// COMBO requires four to six real letter cards.")) {
    const anchor = '      if (["letter", "joker"].includes(card.kind)) {';
    const comboPlay = [
      '      if (card.kind === "steal")',
      '        return Response.json({ error: "Primero fija el objetivo de la carta ROBO" }, { status: 400 });',
      '      // COMBO requires four to six real letter cards.',
      '      if (card.kind === "combo") {',
      '        const answer = String(body.answer ?? "").trim();',
      '        const rawIds = Array.isArray(body.comboLetterIds)',
      '          ? body.comboLetterIds.filter((value): value is string => typeof value === "string")',
      '          : [];',
      '        const comboLetterIds = Array.from(new Set(rawIds));',
      '        const comboLetters = comboLetterIds',
      '          .map((cardId) => cardFrom(actor!.hand, cardId))',
      '          .filter((item): item is GameCard => Boolean(item));',
      '        if (!answer)',
      '          return Response.json({ error: "Escribe la palabra del COMBO" }, { status: 400 });',
      '        if (comboLetterIds.length < 4 || comboLetterIds.length > 6)',
      '          return Response.json({ error: "El COMBO necesita entre 4 y 6 letras" }, { status: 400 });',
      '        if (comboLetters.length !== comboLetterIds.length || comboLetters.some((item) => item.kind !== "letter"))',
      '          return Response.json({ error: "El COMBO solo admite cartas de letras" }, { status: 409 });',
      '        if (',
      '          comboWordLetters(answer).length !== comboLetters.length ||',
      '          comboSignature(answer) !== comboSignature(comboLetters.map((item) => item.label).join(""))',
      '        )',
      '          return Response.json({ error: "La palabra debe usar exactamente las letras seleccionadas" }, { status: 409 });',
      '        if (state.acceptedWords.includes(normalized(answer)))',
      '          return Response.json({ error: "Esa palabra ya fue usada" }, { status: 409 });',
      '        const submission: Submission = {',
      '          playerId,',
      '          cardId,',
      '          answer,',
      '          cardLabel: "COMBO",',
      '          comboLetterIds,',
      '        };',
      '        if (state.settings.mode === "simultaneous") {',
      '          state.submissions[playerId] = submission;',
      '          if (Object.keys(state.submissions).length === state.players.length)',
      '            beginSimultaneousReview(state);',
      '          else',
      '            state.message = Object.keys(state.submissions).length + " de " + state.players.length + " respuestas listas.";',
      '        } else if (state.settings.playStyle === "live") {',
      '          state.pendingLive = {',
      '            ...submission,',
      '            expiresAt: Date.now() + 4500,',
      '            passes: [],',
      '          };',
      '          state.message = actor!.name + " jugó COMBO con “" + answer + "”. Se puede impugnar durante 4 segundos.";',
      '        } else {',
      '          state.pendingVote = makePendingVote(submission);',
      '          state.message = "COMBO de " + actor!.name + ": “" + answer + "”";',
      '        }',
      '      } else if (["letter", "joker"].includes(card.kind)) {',
    ].join("\n");
    source = replaceRequired(source, anchor, comboPlay, "jugada de carta COMBO");
  }

  source = source.replaceAll(
    'state.pendingLive || state.pendingVote || state.pendingPenalty)',
    'state.pendingLive || state.pendingVote || state.pendingPenalty || state.pendingSteal)',
  );
  source = source.replaceAll(
    'state.pendingLive ||\n          state.pendingVote ||\n          state.pendingPenalty ||',
    'state.pendingLive ||\n          state.pendingVote ||\n          state.pendingPenalty ||\n          state.pendingSteal ||',
  );
  source = source.replaceAll(
    'state.pendingLive ||\n        state.pendingVote ||\n        state.pendingPenalty ||',
    'state.pendingLive ||\n        state.pendingVote ||\n        state.pendingPenalty ||\n        state.pendingSteal ||',
  );
  source = source.replaceAll(
    'state.pendingLive ||\n        state.pendingPenalty ||',
    'state.pendingLive ||\n        state.pendingPenalty ||\n        state.pendingSteal ||',
  );

  return source;
});

await patch("app/page.tsx", (source) => {
  if (!source.includes("pendingSteal?: {")) {
    source = replaceRequired(
      source,
      '  pendingPenalty?: {\n    playerId: string;\n    total: number;\n    cardLabel: string;\n    continuation: "classic" | "simultaneous";\n    finishAfter: boolean;\n  } | null;\n',
      '  pendingPenalty?: {\n    playerId: string;\n    total: number;\n    cardLabel: string;\n    continuation: "classic" | "simultaneous";\n    finishAfter: boolean;\n  } | null;\n  pendingSteal?: {\n    actorId: string;\n    targetId: string;\n    cardId: string;\n    at: number;\n  } | null;\n',
      "tipo de ROBO pendiente en cliente",
    );
  }

  if (!source.includes('"steal" | "combo" | "draw"')) {
    source = replaceRequired(
      source,
      '    kind: "block" | "penalty" | "reverse" | "category" | "swap" | "draw";',
      '    kind: "block" | "penalty" | "reverse" | "category" | "swap" | "steal" | "combo" | "draw";',
      "eventos COMBO/ROBO en cliente",
    );
  }

  if (!source.includes("comboLetterIds?: string[];")) {
    source = replaceRequired(
      source,
      '    matchMode?: "starts" | "contains";\n  } | null;',
      '    matchMode?: "starts" | "contains";\n    comboLetterIds?: string[];\n  } | null;',
      "datos COMBO en votación cliente",
    );
  }

  if (!source.includes("const [comboCard, setComboCard]")) {
    const anchor = '  const [swapType, setSwapType] = useState<"whole" | "one">("whole");\n';
    const addition = [
      anchor.trimEnd(),
      '  const [comboCard, setComboCard] = useState<string | null>(null);',
      '  const [comboLetters, setComboLetters] = useState<string[]>([]);',
      '  const [comboAnswer, setComboAnswer] = useState("");',
      '  const [stealCard, setStealCard] = useState<string | null>(null);',
      '  const [stealTarget, setStealTarget] = useState("");',
      '',
    ].join("\n");
    if (!source.includes(anchor)) throw new Error("No se encontró el estado de SWAP para añadir COMBO/ROBO.");
    source = source.replace(anchor, addition);
  }

  if (!source.includes("!room.pendingSteal &&")) {
    source = replaceRequired(
      source,
      '    !room.pendingPenalty &&\n    (room.settings.mode === "simultaneous"',
      '    !room.pendingPenalty &&\n    !room.pendingSteal &&\n    (room.settings.mode === "simultaneous"',
      "bloquear jugadas durante ROBO pendiente",
    );
  }

  if (!source.includes("room?.pendingSteal,")) {
    const timeoutAnchor = '    room?.pendingPenalty,\n    room?.pausedAt,\n  ]);';
    if (source.includes(timeoutAnchor)) {
      source = source.replace(
        timeoutAnchor,
        '    room?.pendingPenalty,\n    room?.pendingSteal,\n    room?.pausedAt,\n  ]);',
      );
    }
  }
  source = source.replace(
    '      room.pendingPenalty\n    )',
    '      room.pendingPenalty ||\n      room.pendingSteal\n    )',
  );

  if (!source.includes("setComboCard(null);")) {
    source = replaceRequired(
      source,
      '    setSwapCard(null);\n    if (document.activeElement instanceof HTMLElement)',
      '    setSwapCard(null);\n    setComboCard(null);\n    setComboLetters([]);\n    setComboAnswer("");\n    setStealCard(null);\n    setStealTarget("");\n    if (document.activeElement instanceof HTMLElement)',
      "limpiar selectores COMBO/ROBO",
    );
  }

  if (!source.includes(".combo-picker,.steal-picker")) {
    source = replaceRequired(
      source,
      '        ".play-card,.answer-bar,.action-picker,.vote-panel,.live-challenge,.pass-draw,.icon-button,.hand-toolbar,.hand-tool-button",',
      '        ".play-card,.answer-bar,.action-picker,.combo-picker,.steal-picker,.vote-panel,.live-challenge,.pass-draw,.icon-button,.hand-toolbar,.hand-tool-button",',
      "no cerrar selectores al interactuar dentro",
    );
  }

  if (!source.includes('if (card.kind === "combo") {')) {
    const anchor = '    if (card.kind === "swap") {';
    const addition = [
      '    if (card.kind === "combo") {',
      '      setComboCard(card.id);',
      '      setComboLetters([]);',
      '      setComboAnswer("");',
      '      setSelected(card.id);',
      '      return;',
      '    }',
      '    if (card.kind === "steal") {',
      '      setStealCard(card.id);',
      '      setStealTarget(room?.players.find((item) => item.id !== playerId)?.id ?? "");',
      '      setSelected(card.id);',
      '      return;',
      '    }',
    ].join("\n") + "\n";
    source = insertBeforeRequired(source, anchor, addition, 'if (card.kind === "combo") {', "apertura de COMBO/ROBO");
  }

  if (!source.includes("function comboWordLettersClient(")) {
    const anchor = '  function cardClass(card: GameCard) {';
    const helpers = [
      '  function comboWordLettersClient(value: string) {',
      '    return value',
      '      .trim()',
      '      .toLocaleLowerCase("es")',
      '      .replace(/ñ/g, "~")',
      '      .normalize("NFD")',
      '      .replace(/[\\u0300-\\u036f]/g, "")',
      '      .replace(/~/g, "ñ")',
      '      .replace(/[^a-zñ]/g, "");',
      '  }',
      '  function comboSignatureClient(value: string) {',
      '    return comboWordLettersClient(value).split("").sort().join("");',
      '  }',
      '  function toggleComboLetter(cardId: string) {',
      '    setComboLetters((current) =>',
      '      current.includes(cardId)',
      '        ? current.filter((id) => id !== cardId)',
      '        : current.length < 6',
      '          ? [...current, cardId]',
      '          : current,',
      '    );',
      '  }',
      '  function submitCombo() {',
      '    if (!comboCard || comboLetters.length < 4 || comboLetters.length > 6 || !comboAnswer.trim()) return;',
      '    const special = hand.find((item) => item.id === comboCard);',
      '    const letters = comboLetters',
      '      .map((id) => hand.find((item) => item.id === id))',
      '      .filter((item): item is GameCard => Boolean(item));',
      '    if (!special || letters.length !== comboLetters.length) return;',
      '    const exact =',
      '      comboWordLettersClient(comboAnswer).length === letters.length &&',
      '      comboSignatureClient(comboAnswer) === comboSignatureClient(letters.map((item) => item.label).join(""));',
      '    if (!exact) return show("La palabra debe usar exactamente las letras seleccionadas.");',
      '    const submittedAnswer = comboAnswer.trim();',
      '    const submittedLetters = [...comboLetters];',
      '    animatePlay(special, () => {',
      '      void act("play", {',
      '        cardId: special.id,',
      '        answer: submittedAnswer,',
      '        comboLetterIds: submittedLetters,',
      '      });',
      '      setComboCard(null);',
      '      setComboLetters([]);',
      '      setComboAnswer("");',
      '      setSelected(null);',
      '    });',
      '  }',
      '  function confirmStealTarget() {',
      '    if (!stealCard || !stealTarget) return;',
      '    const special = hand.find((item) => item.id === stealCard);',
      '    if (!special) return;',
      '    const lockedTarget = stealTarget;',
      '    animatePlay(special, () => {',
      '      void act("lockStealTarget", { cardId: special.id, targetId: lockedTarget });',
      '      setStealCard(null);',
      '      setStealTarget("");',
      '      setSelected(null);',
      '    });',
      '  }',
      '  function completeSteal(targetCardId: string) {',
      '    if (!room?.pendingSteal || room.pendingSteal.actorId !== playerId) return;',
      '    void act("completeSteal", { targetCardId });',
      '  }',
      '',
    ].join("\n");
    source = insertBeforeRequired(source, anchor, helpers, "function comboWordLettersClient(", "helpers de COMBO y ROBO");
  }

  source = replaceRequired(
    source,
    '        : card.kind === "joker"\n          ? "gold"\n          : card.kind === "category"\n            ? "orange"\n            : "";',
    '        : card.kind === "joker"\n          ? "gold"\n          : card.kind === "combo"\n            ? "cyan"\n            : card.kind === "steal"\n              ? "black"\n              : card.kind === "category"\n                ? "orange"\n                : "";',
    "colores de COMBO y ROBO",
  );

  source = replaceRequired(
    source,
    '      : card.kind === "category"\n        ? "NUEVA CATEGORÍA"\n        : card.kind === "stop"',
    '      : card.kind === "category"\n        ? "NUEVA CATEGORÍA"\n        : card.kind === "combo"\n          ? "COMBO"\n          : card.kind === "steal"\n            ? "ROBO"\n            : card.kind === "stop"',
    "esquinas COMBO/ROBO",
  );

  source = replaceRequired(
    source,
    '      : card.kind === "category"\n        ? ""\n        : card.kind === "stop"',
    '      : card.kind === "category"\n        ? ""\n        : card.kind === "combo"\n          ? "4–6"\n          : card.kind === "steal"\n            ? "☠"\n            : card.kind === "stop"',
    "caras COMBO/ROBO",
  );

  source = replaceRequired(
    source,
    '      : kind === "joker"\n          ? "★"\n          : label;',
    '      : kind === "joker"\n          ? "★"\n          : kind === "combo"\n            ? "COMBO"\n            : kind === "steal"\n              ? "☠"\n              : label;',
    "cartas centrales COMBO/ROBO",
  );

  if (!source.includes('if (event.kind === "steal")')) {
    const anchor = '    if (event.kind === "reverse")\n';
    const addition = [
      '    if (event.kind === "steal")',
      '      return { title: "Carta robada", detail: event.actorName + " eligió una carta de " + targetNames + "." };',
      '    if (event.kind === "combo")',
      '      return {',
      '        title: event.label === "rechazado" ? "COMBO rechazado" : "COMBO completado",',
      '        detail: event.label === "rechazado"',
      '          ? event.actorName + " perdió la carta COMBO y volvió al mazo."',
      '          : event.actorName + " jugó “" + (event.label ?? "") + "”.",',
      '      };',
    ].join("\n") + "\n";
    source = insertBeforeRequired(source, anchor, addition, 'if (event.kind === "steal")', "mensajes de eventos COMBO/ROBO");
  }

  if (!source.includes('room.lastEvent!.kind === "steal"')) {
    source = replaceRequired(
      source,
      '                        ) : room.lastEvent!.kind === "swap" ? (\n                          "⇄"\n                        ) : (\n                          "C"\n                        )}',
      '                        ) : room.lastEvent!.kind === "swap" ? (\n                          "⇄"\n                        ) : room.lastEvent!.kind === "steal" ? (\n                          "☠"\n                        ) : room.lastEvent!.kind === "combo" ? (\n                          "4–6"\n                        ) : (\n                          "C"\n                        )}',
      "símbolos de eventos COMBO/ROBO",
    );
  }

  if (!source.includes('card.kind === "combo" && (')) {
    const anchor = '                {card.kind === "category" && (\n                  <small>\n                    CAMBIA LA\n                    <br />\n                    CATEGORÍA\n                  </small>\n                )}\n';
    const addition = [
      anchor.trimEnd(),
      '                {card.kind === "combo" && (',
      '                  <small>',
      '                    FORMA UNA PALABRA',
      '                    <br />',
      '                    CON 4–6 LETRAS',
      '                  </small>',
      '                )}',
      '                {card.kind === "steal" && (',
      '                  <small>',
      '                    ELIGE Y ROBA',
      '                    <br />',
      '                    UNA CARTA',
      '                  </small>',
      '                )}',
      '',
    ].join("\n");
    if (!source.includes(anchor)) throw new Error("No se encontró el texto de Nueva categoría en las cartas.");
    source = source.replace(anchor, addition);
  }

  if (!source.includes('className="action-picker combo-picker"')) {
    const anchor = '        {swapCard && (\n';
    const pickers = [
      '        {comboCard && (',
      '          <section className="action-picker combo-picker">',
      '            <p>CARTA COMBO</p>',
      '            <h2>Forma una palabra de 4 a 6 letras</h2>',
      '            <small>Selecciona cartas de letras. Las +1, +2 y +3 cuentan solo como letras dentro del COMBO.</small>',
      '            <div className="combo-letter-grid">',
      '              {hand.filter((card) => card.kind === "letter").map((card) => {',
      '                const active = comboLetters.includes(card.id);',
      '                return (',
      '                  <button',
      '                    type="button"',
      '                    key={card.id}',
      '                    className={`combo-letter-choice ${active ? "selected" : ""}`}',
      '                    onClick={() => toggleComboLetter(card.id)}',
      '                  >',
      '                    <strong>{card.label}</strong>',
      '                    {card.penalty ? <em>+{card.penalty}</em> : null}',
      '                  </button>',
      '                );',
      '              })}',
      '            </div>',
      '            <div className="combo-count">{comboLetters.length}/6 · mínimo 4</div>',
      '            <label className="combo-word-field">',
      '              Palabra',
      '              <input',
      '                autoFocus',
      '                value={comboAnswer}',
      '                onChange={(event) => setComboAnswer(event.target.value)}',
      '                placeholder="Escribe la palabra exacta…"',
      '              />',
      '            </label>',
      '            {room.settings.playStyle === "live" && (',
      '              <small>En COMBO la palabra también se escribe para comprobar las letras, aunque estén jugando en vivo.</small>',
      '            )}',
      '            <div className="modal-actions">',
      '              <button onClick={() => { setComboCard(null); setComboLetters([]); setComboAnswer(""); setSelected(null); }}>Cancelar</button>',
      '              <button',
      '                className="confirm"',
      '                disabled={',
      '                  comboLetters.length < 4 ||',
      '                  comboLetters.length > 6 ||',
      '                  !comboAnswer.trim() ||',
      '                  comboWordLettersClient(comboAnswer).length !== comboLetters.length ||',
      '                  comboSignatureClient(comboAnswer) !==',
      '                    comboSignatureClient(',
      '                      comboLetters',
      '                        .map((id) => hand.find((card) => card.id === id)?.label ?? "")',
      '                        .join(""),',
      '                    )',
      '                }',
      '                onClick={submitCombo}',
      '              >',
      '                Jugar COMBO',
      '              </button>',
      '            </div>',
      '          </section>',
      '        )}',
      '        {stealCard && !room.pendingSteal && (',
      '          <section className="action-picker steal-picker">',
      '            <p>CARTA ROBO</p>',
      '            <div className="steal-mark" aria-hidden="true">☠</div>',
      '            <h2>Elige a quién vas a robar</h2>',
      '            <small>Después de fijar el objetivo podrás ver su mano. No podrás cambiar de jugador.</small>',
      '            <label>',
      '              Objetivo',
      '              <select value={stealTarget} onChange={(event) => setStealTarget(event.target.value)}>',
      '                {room.players.filter((item) => item.id !== playerId && item.cardCount > 0).map((item) => (',
      '                  <option key={item.id} value={item.id}>{item.name} · {item.cardCount} cartas</option>',
      '                ))}',
      '              </select>',
      '            </label>',
      '            <div className="modal-actions">',
      '              <button onClick={() => { setStealCard(null); setStealTarget(""); setSelected(null); }}>Cancelar</button>',
      '              <button className="confirm" disabled={!stealTarget || busy} onClick={confirmStealTarget}>Fijar objetivo</button>',
      '            </div>',
      '          </section>',
      '        )}',
      '        {room.pendingSteal && (() => {',
      '          const stealActor = room.players.find((item) => item.id === room.pendingSteal?.actorId);',
      '          const lockedTarget = room.players.find((item) => item.id === room.pendingSteal?.targetId);',
      '          if (room.pendingSteal.actorId !== playerId)',
      '            return (',
      '              <section className="action-picker steal-picker steal-waiting">',
      '                <p>ROBO EN CURSO</p>',
      '                <div className="steal-mark" aria-hidden="true">☠</div>',
      '                <h2>{stealActor?.name ?? "Un jugador"} está eligiendo</h2>',
      '                <small>Objetivo fijado: {lockedTarget?.name ?? "jugador"}.</small>',
      '              </section>',
      '            );',
      '          const visibleCards = lockedTarget?.hand ?? [];',
      '          return (',
      '            <section className="action-picker steal-picker locked">',
      '              <p>OBJETIVO FIJADO · {lockedTarget?.name}</p>',
      '              <div className="steal-mark" aria-hidden="true">☠</div>',
      '              <h2>Escoge exactamente una carta</h2>',
      '              <small>No puedes cambiar de jugador. La carta que elijas pasará a tu mano.</small>',
      '              <div className="steal-hand-grid">',
      '                {visibleCards.map((card) => (',
      '                  <button',
      '                    type="button"',
      '                    key={card.id}',
      '                    className={`steal-hand-card ${card.kind} ${cardClass(card)}`}',
      '                    disabled={busy}',
      '                    onClick={() => completeSteal(card.id)}',
      '                    aria-label={`Robar ${card.label}`}',
      '                  >',
      '                    <span>{cardCorner(card)}</span>',
      '                    <strong>{cardFace(card)}</strong>',
      '                    {card.penalty ? <em>+{card.penalty}</em> : null}',
      '                  </button>',
      '                ))}',
      '              </div>',
      '            </section>',
      '          );',
      '        })()}',
      '',
    ].join("\n");
    source = insertBeforeRequired(source, anchor, pickers, 'className="action-picker combo-picker"', "selectores visuales COMBO/ROBO");
  }

  return source;
});

await patch("app/ui-fixes.css", (source) => {
  if (source.includes("/* Power cards: COMBO and ROBO. */")) return source;
  const css = `

/* Power cards: COMBO and ROBO. */
.play-card.cyan,
.card-flight.cyan,
.drag-ghost.cyan,
.mini-play-card.combo {
  background: linear-gradient(145deg,#18bfd0,#078aa0) !important;
  color: #fff !important;
}
.play-card.black,
.card-flight.black,
.drag-ghost.black,
.mini-play-card.steal {
  background: linear-gradient(145deg,#111319,#020305) !important;
  color: #fff !important;
  border-color: rgba(244,189,59,.88) !important;
}
.play-card.action.combo strong { font-size: 42px !important; letter-spacing: -.06em; }
.play-card.action.steal strong { font-size: 64px !important; line-height: .9; margin-top: 36px !important; }
.play-card.action.steal .card-corner { color: #f4bd3b; letter-spacing: .12em; }
.play-card.action.combo .card-corner { letter-spacing: .12em; }
.center-pile-card.combo,
.center-pile-card.steal { white-space: pre-line; }

.combo-picker,
.steal-picker {
  position: fixed !important;
  left: 50% !important;
  top: 50% !important;
  transform: translate(-50%,-50%) !important;
  z-index: 2460 !important;
  width: min(660px, 94vw) !important;
  max-height: min(82dvh, 760px) !important;
  overflow: auto !important;
  border-radius: 22px !important;
  background: #fff !important;
  color: #14213d !important;
  padding: 24px !important;
  box-shadow: 0 28px 90px rgba(0,0,0,.56) !important;
}
.combo-picker > p,
.steal-picker > p {
  margin: 0 0 6px !important;
  font-size: 10px !important;
  font-weight: 950 !important;
  letter-spacing: .16em !important;
}
.combo-picker > p { color: #078aa0 !important; }
.steal-picker > p { color: #111319 !important; }
.combo-picker > h2,
.steal-picker > h2 { margin: 4px 0 8px !important; }
.combo-picker > small,
.steal-picker > small { display: block; color: #68738a; line-height: 1.45; margin-bottom: 16px; }
.combo-letter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill,minmax(58px,1fr));
  gap: 8px;
  margin: 16px 0 10px;
}
.combo-letter-choice {
  position: relative;
  min-height: 68px;
  border: 2px solid rgba(20,33,61,.12);
  border-radius: 12px;
  background: #2455d6;
  color: #fff;
  cursor: pointer;
}
.combo-letter-choice strong { font: 700 31px/1 Georgia,serif; }
.combo-letter-choice em {
  position: absolute;
  right: 5px;
  top: 5px;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #f4bd3b;
  color: #14213d;
  font-size: 10px;
  font-style: normal;
  font-weight: 950;
}
.combo-letter-choice.selected {
  border-color: #18bfd0;
  box-shadow: 0 0 0 3px rgba(24,191,208,.2);
  transform: translateY(-2px);
}
.combo-count {
  text-align: right;
  font-size: 11px;
  font-weight: 850;
  color: #607089;
}
.combo-word-field,
.steal-picker > label {
  display: grid;
  gap: 7px;
  margin-top: 14px;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: .06em;
}
.combo-word-field input,
.steal-picker select {
  width: 100%;
  min-height: 46px;
  border: 1px solid rgba(20,33,61,.18);
  border-radius: 10px;
  background: #fff;
  color: #14213d;
  padding: 0 12px;
  font-size: 16px;
  letter-spacing: 0;
  outline: none;
}
.steal-mark {
  width: 76px;
  height: 76px;
  display: grid;
  place-items: center;
  margin: 8px auto 10px;
  border-radius: 50%;
  background: #080a0e;
  color: #f4bd3b;
  border: 2px solid #f4bd3b;
  font-size: 44px;
  box-shadow: 0 12px 30px rgba(0,0,0,.2);
}
.steal-picker.locked { width: min(760px,94vw) !important; }
.steal-picker.locked > p { text-align: center; }
.steal-picker.locked > h2,
.steal-picker.locked > small,
.steal-waiting { text-align: center; }
.steal-hand-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill,minmax(92px,1fr));
  gap: 10px;
  margin-top: 18px;
}
.steal-hand-card {
  position: relative;
  min-height: 132px;
  border: 3px solid rgba(255,255,255,.78);
  border-radius: 13px;
  background: #2455d6;
  color: #fff;
  padding: 10px 7px;
  cursor: pointer;
  box-shadow: 0 8px 20px rgba(0,0,0,.22);
  transition: transform .16s ease, box-shadow .16s ease;
}
.steal-hand-card:hover { transform: translateY(-5px); box-shadow: 0 14px 28px rgba(0,0,0,.28); }
.steal-hand-card > span { display: block; min-height: 22px; font-size: 8px; font-weight: 950; }
.steal-hand-card > strong { display: grid; place-items: center; min-height: 64px; white-space: pre-line; font: 800 35px/1 Arial,sans-serif; }
.steal-hand-card.letter > strong { font: 600 50px/1 Georgia,serif; }
.steal-hand-card > em {
  position: absolute;
  right: 6px;
  top: 6px;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #f4bd3b;
  color: #14213d;
  font-size: 10px;
  font-style: normal;
  font-weight: 950;
}
.vote-letter.combo { font-size: 9px !important; letter-spacing: .05em; }

@media (max-width: 560px) {
  .combo-picker,
  .steal-picker { padding: 19px 16px !important; max-height: 86dvh !important; }
  .combo-letter-grid { grid-template-columns: repeat(5,1fr); gap: 6px; }
  .combo-letter-choice { min-height: 58px; }
  .combo-letter-choice strong { font-size: 27px; }
  .steal-hand-grid { grid-template-columns: repeat(3,1fr); gap: 7px; }
  .steal-hand-card { min-height: 112px; }
  .steal-hand-card > strong { min-height: 54px; font-size: 30px; }
  .steal-hand-card.letter > strong { font-size: 43px; }
}
`;
  return source + css;
});

console.log("COMBO and ROBO power cards applied.");
