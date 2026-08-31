import { readFile, writeFile } from "node:fs/promises";

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`No se encontró el bloque esperado para: ${label}`);
  return source.replace(from, to);
}

// Runs after apply-turn-steal-top-card-fix.mjs.
// Selecting an exact-match card only prepares it locally. The atomic turn claim
// is performed only when the player actually confirms/plays the card.
let page = await readFile("app/page.tsx", "utf8");

page = replaceRequired(
  page,
  `  async function attemptTurnSteal(card: GameCard) {
    const data = await turnStealRequest("stealTurn", card.id);
    if (!data?.stolen) return;
    setSelected(card.id);
    setAnswer("");
    setMatchMode("starts");
    setSwapCard(null);
    setComboCard(null);
    setComboLetters([]);
    setComboAnswer("");
    setStealCard(null);
    setStealTarget("");
  }`,
  `  async function attemptTurnSteal(card: GameCard) {
    // TURN STEAL submit-confirmation v3: selection is provisional only.
    setSelected(card.id);
    setAnswer("");
    setMatchMode("starts");
    setSwapCard(null);
    setComboCard(null);
    setComboLetters([]);
    setComboAnswer("");
    setStealCard(null);
    setStealTarget("");
  }`,
  "preparar robo sin cambiar el turno",
);

page = replaceRequired(
  page,
  `    const resolvesCard = action === "play" || action === "lockStealTarget";
    const resolvesTurn = action === "passAndDraw" || action === "discardCard" || action === "timeout";
    const claimCardId = enabled
      ? resolvesCard
        ? directCardId
        : resolvesTurn
          ? (directCardId || ownArmed?.cardId || "")
          : ""
      : "";
    if (claimCardId) {
      const claim = await turnStealRequest("commitTurnPlay", claimCardId);`,
  `    const resolvesCard = action === "play" || action === "lockStealTarget";
    const resolvesTurn = action === "passAndDraw" || action === "discardCard" || action === "timeout";
    const claimCardId = enabled
      ? resolvesCard
        ? directCardId
        : resolvesTurn
          ? (directCardId || ownArmed?.cardId || "")
          : ""
      : "";
    const directCard = directCardId ? hand.find((item) => item.id === directCardId) : undefined;
    const confirmingTurnSteal = Boolean(
      enabled &&
      resolvesCard &&
      directCard &&
      room.players[room.turnIndex]?.id !== playerId &&
      isTurnStealReady(directCard),
    );
    if (confirmingTurnSteal && directCard) {
      const stolen = await turnStealRequest("stealTurn", directCard.id);
      if (!stolen?.stolen) {
        show("Ese turno ya no se puede robar.");
        return null;
      }
    }
    if (claimCardId) {
      const claim = await turnStealRequest("commitTurnPlay", claimCardId);`,
  "hacer efectivo el robo al confirmar la carta",
);

page = replaceRequired(
  page,
  `    if (isTurnStealReady(card)) {
      void attemptTurnSteal(card);
      return;
    }
    if (!canPlay)`,
  `    const preparingTurnSteal = isTurnStealReady(card);
    if (preparingTurnSteal && selected !== card.id) {
      void attemptTurnSteal(card);
      event?.currentTarget.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
      return;
    }
    if (!canPlay && !preparingTurnSteal)`,
  "permitir preparar una carta fuera de turno sin robarlo",
);

page = replaceRequired(
  page,
  `  function playSelectedCard(card: GameCard) {
    if (!canPlay)
      return show(`,
  `  function playSelectedCard(card: GameCard) {
    const confirmingTurnSteal = selected === card.id && isTurnStealReady(card);
    if (!canPlay && !confirmingTurnSteal)
      return show(`,
  "permitir confirmar una carta preparada fuera de turno",
);

await writeFile("app/page.tsx", page, "utf8");

const check = await readFile("app/page.tsx", "utf8");
if (!check.includes("TURN STEAL submit-confirmation v3"))
  throw new Error("No se aplicó la selección provisional de Robar turno.");
if (!check.includes("const confirmingTurnSteal = Boolean("))
  throw new Error("No se aplicó la confirmación de Robar turno al enviar.");

console.log("Turn steal fixed: selection is provisional; turn changes only on confirmed play.");
