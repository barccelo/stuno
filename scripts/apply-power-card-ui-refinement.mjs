import { readFile, writeFile } from "node:fs/promises";

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from))
    throw new Error(`No se encontró el bloque esperado para: ${label}`);
  return source.replace(from, to);
}

function replaceSection(source, startMarker, endMarker, replacement, label) {
  if (source.includes(replacement)) return source;
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0)
    throw new Error(`No se encontró la sección esperada para: ${label}`);
  return source.slice(0, start) + replacement + source.slice(end);
}

let page = await readFile("app/page.tsx", "utf8");

page = replaceRequired(
  page,
  '          : card.kind === "combo"\n            ? "4–6"\n            : card.kind === "steal"',
  '          : card.kind === "combo"\n            ? "COMBO"\n            : card.kind === "steal"',
  "cara centrada de COMBO",
);

page = replaceRequired(
  page,
  '                        ) : room.lastEvent!.kind === "combo" ? (\n                          "4–6"\n                        ) : (',
  '                        ) : room.lastEvent!.kind === "combo" ? (\n                          "COMBO"\n                        ) : (',
  "símbolo de evento COMBO",
);

page = replaceSection(
  page,
  "  function toggleComboLetter(cardId: string) {",
  "  function submitCombo() {",
  [
    '  function comboSelectionForAnswer(value: string) {',
    '    const wanted = comboWordLettersClient(value).split("").slice(0, 6);',
    '    const available = hand',
    '      .filter((item) => item.kind === "letter")',
    '      .slice()',
    '      .sort((a, b) => (a.penalty ?? 0) - (b.penalty ?? 0));',
    '    const used = new Set<string>();',
    '    const selectedIds: string[] = [];',
    '    for (const letter of wanted) {',
    '      const match = available.find(',
    '        (item) =>',
    '          !used.has(item.id) &&',
    '          comboWordLettersClient(item.label) === letter,',
    '      );',
    '      if (!match) continue;',
    '      used.add(match.id);',
    '      selectedIds.push(match.id);',
    '    }',
    '    return selectedIds;',
    '  }',
    '  function syncComboAnswer(value: string) {',
    '    setComboAnswer(value);',
    '    setComboLetters(comboSelectionForAnswer(value));',
    '  }',
    '',
  ].join("\n"),
  "autoselección de letras COMBO",
);

page = replaceSection(
  page,
  "  function submitCombo() {",
  "  function confirmStealTarget() {",
  [
    '  function submitCombo() {',
    '    if (!comboCard || !comboAnswer.trim()) return;',
    '    const submittedLetters = comboSelectionForAnswer(comboAnswer);',
    '    const typedLength = comboWordLettersClient(comboAnswer).length;',
    '    if (',
    '      typedLength < 4 ||',
    '      typedLength > 6 ||',
    '      submittedLetters.length !== typedLength',
    '    )',
    '      return show("La palabra debe tener entre 4 y 6 letras disponibles en tu mano.");',
    '    const special = hand.find((item) => item.id === comboCard);',
    '    const letters = submittedLetters',
    '      .map((id) => hand.find((item) => item.id === id))',
    '      .filter((item): item is GameCard => Boolean(item));',
    '    if (!special || letters.length !== submittedLetters.length) return;',
    '    const exact =',
    '      comboWordLettersClient(comboAnswer).length === letters.length &&',
    '      comboSignatureClient(comboAnswer) ===',
    '        comboSignatureClient(letters.map((item) => item.label).join(""));',
    '    if (!exact)',
    '      return show("La palabra debe usar exactamente letras que tengas en tu mano.");',
    '    const submittedAnswer = comboAnswer.trim();',
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
    '',
  ].join("\n"),
  "envío COMBO sincronizado con lo escrito",
);

page = replaceSection(
  page,
  '        {comboCard && (',
  '        {stealCard && !room.pendingSteal && (',
  [
    '        {comboCard && (',
    '          <section className="action-picker combo-picker">',
    '            <p>CARTA COMBO</p>',
    '            <h2>Forma una palabra de 4 a 6 letras</h2>',
    '            <small>Escribe la palabra. Las cartas que la forman se marcarán automáticamente; +1, +2 y +3 cuentan solo como letras.</small>',
    '            <div className="combo-letter-grid" aria-live="polite">',
    '              {hand.filter((card) => card.kind === "letter").map((card) => {',
    '                const active = comboLetters.includes(card.id);',
    '                return (',
    '                  <div',
    '                    key={card.id}',
    '                    className={`combo-letter-choice ${active ? "selected" : ""}`}',
    '                  >',
    '                    <strong>{card.label}</strong>',
    '                    {card.penalty ? <em>+{card.penalty}</em> : null}',
    '                    {active && <span className="combo-auto-check" aria-hidden="true">✓</span>}',
    '                  </div>',
    '                );',
    '              })}',
    '            </div>',
    '            <div',
    '              className={`combo-count ${',
    '                comboWordLettersClient(comboAnswer).length >= 4 &&',
    '                comboWordLettersClient(comboAnswer).length <= 6 &&',
    '                comboWordLettersClient(comboAnswer).length === comboLetters.length',
    '                  ? "ready"',
    '                  : ""',
    '              }`}',
    '            >',
    '              {comboLetters.length}/6 · mínimo 4',
    '            </div>',
    '            <label className="combo-word-field">',
    '              Palabra',
    '              <input',
    '                autoFocus',
    '                value={comboAnswer}',
    '                onChange={(event) => syncComboAnswer(event.target.value)}',
    '                placeholder="Escribe la palabra exacta…"',
    '                autoComplete="off"',
    '                spellCheck={false}',
    '              />',
    '            </label>',
    '            {comboAnswer.trim() &&',
    '              comboWordLettersClient(comboAnswer).length !== comboLetters.length && (',
    '                <small className="combo-match-warning">',
    '                  Esa palabra necesita una letra que no tienes disponible.',
    '                </small>',
    '              )}',
    '            {room.settings.playStyle === "live" && (',
    '              <small>En COMBO la palabra también se escribe para comprobar las letras, aunque estén jugando en vivo.</small>',
    '            )}',
    '            <div className="modal-actions">',
    '              <button onClick={() => { setComboCard(null); setComboLetters([]); setComboAnswer(""); setSelected(null); }}>Cancelar</button>',
    '              <button',
    '                className="confirm"',
    '                disabled={',
    '                  comboWordLettersClient(comboAnswer).length < 4 ||',
    '                  comboWordLettersClient(comboAnswer).length > 6 ||',
    '                  comboWordLettersClient(comboAnswer).length !== comboLetters.length',
    '                }',
    '                onClick={submitCombo}',
    '              >',
    '                Jugar COMBO',
    '              </button>',
    '            </div>',
    '          </section>',
    '        )}',
    '',
  ].join("\n"),
  "interfaz automática de COMBO",
);

const oldStealCards = [
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
].join("\n");
const newStealCards = [
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
  '                    <span className="steal-card-corner">',
  '                      {card.kind === "stop" ? <Icon name="block" size={12} /> : cardCorner(card)}',
  '                    </span>',
  '                    <strong>{cardFace(card)}</strong>',
  '                    {card.penalty ? <em>+{card.penalty}</em> : null}',
  '                    {card.kind === "reverse" && <small>CAMBIA EL<br />SENTIDO</small>}',
  '                    {card.kind === "swap" && <small>1 CARTA<br />O LA MANO</small>}',
  '                    {card.kind === "joker" && <small>USA CUALQUIER<br />LETRA</small>}',
  '                    {card.kind === "category" && <small>CAMBIA LA<br />CATEGORÍA</small>}',
  '                    {card.kind === "steal" && <small>ELIGE Y ROBA<br />UNA CARTA</small>}',
  '                  </button>',
  '                ))}',
  '              </div>',
].join("\n");
page = replaceRequired(page, oldStealCards, newStealCards, "cartas reales en selector ROBO");

await writeFile("app/page.tsx", page, "utf8");

let css = await readFile("app/ui-fixes.css", "utf8");
if (!css.includes("/* Power-card UI refinement v1. */")) {
  css += `

/* Power-card UI refinement v1. */
.play-card.action.combo {
  overflow: hidden !important;
}
.play-card.action.combo .card-corner,
.play-card.action.combo > small {
  display: none !important;
}
.play-card.action.combo > strong {
  position: absolute !important;
  inset: 0 !important;
  display: grid !important;
  place-items: center !important;
  margin: 0 !important;
  padding: 12px !important;
  font: 950 clamp(20px, 5vw, 34px)/1 Arial, sans-serif !important;
  letter-spacing: .02em !important;
  text-align: center !important;
  white-space: nowrap !important;
  overflow: hidden !important;
}
.center-pile-card.combo,
.mini-play-card.combo {
  display: grid !important;
  place-items: center !important;
  overflow: hidden !important;
  padding: 5px !important;
  font: 950 clamp(9px, 2.2vw, 14px)/1 Arial, sans-serif !important;
  letter-spacing: .02em !important;
  text-align: center !important;
  white-space: nowrap !important;
}
.card-flight.combo > strong,
.drag-ghost.cyan > strong {
  max-width: 100% !important;
  margin: 0 !important;
  font: 950 clamp(15px, 4vw, 26px)/1 Arial, sans-serif !important;
  letter-spacing: .01em !important;
  white-space: nowrap !important;
}
.play-card.action.steal {
  overflow: hidden !important;
}
.play-card.action.steal > strong {
  position: absolute !important;
  left: 50% !important;
  top: 48% !important;
  transform: translate(-50%, -50%) !important;
  margin: 0 !important;
  font-size: clamp(46px, 9vw, 62px) !important;
  line-height: 1 !important;
}
.play-card.action.steal > small {
  position: absolute !important;
  left: 10px !important;
  right: 10px !important;
  bottom: 14px !important;
  margin: 0 !important;
  text-align: center !important;
  line-height: 1.2 !important;
}

.combo-letter-choice {
  display: grid !important;
  place-items: center !important;
  min-width: 0 !important;
  cursor: default !important;
  padding: 8px !important;
  overflow: hidden !important;
}
.combo-letter-choice strong {
  margin: 0 !important;
  padding: 0 !important;
  font: 700 31px/1 Georgia, serif !important;
}
.combo-letter-choice em {
  top: 5px !important;
  right: 5px !important;
  z-index: 2 !important;
}
.combo-auto-check {
  position: absolute;
  left: 5px;
  top: 5px;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #fff;
  color: #078aa0;
  font-size: 13px;
  font-weight: 950;
  box-shadow: 0 2px 7px rgba(0,0,0,.16);
}
.combo-letter-choice.selected {
  border-color: #078aa0 !important;
  box-shadow: 0 0 0 3px rgba(24,191,208,.24) !important;
  transform: translateY(-2px);
}
.combo-count.ready { color: #078aa0 !important; }
.combo-match-warning {
  display: block;
  margin: 8px 0 0 !important;
  color: #b54646 !important;
  font-size: 11px !important;
  font-weight: 800 !important;
}

.steal-hand-grid {
  grid-template-columns: repeat(auto-fill, minmax(92px, 112px)) !important;
  justify-content: center !important;
  align-items: start !important;
  gap: 10px !important;
}
.steal-hand-card {
  position: relative !important;
  width: 100% !important;
  min-width: 0 !important;
  min-height: 0 !important;
  aspect-ratio: 124 / 172 !important;
  display: block !important;
  overflow: hidden !important;
  padding: 9px !important;
  border: 3px solid rgba(255,255,255,.78) !important;
  border-radius: 13px !important;
  background: #2455d6 !important;
  color: #fff !important;
  text-align: left !important;
}
.steal-hand-card.coral { background: var(--red, #ef5a4c) !important; }
.steal-hand-card.violet { background: var(--violet, #7556c9) !important; }
.steal-hand-card.teal { background: #14969a !important; }
.steal-hand-card.orange { background: #e57d25 !important; }
.steal-hand-card.gold {
  background: var(--gold, #f4bd3b) !important;
  color: var(--ink, #14213d) !important;
}
.steal-hand-card.cyan {
  background: linear-gradient(145deg,#18bfd0,#078aa0) !important;
  color: #fff !important;
}
.steal-hand-card.black {
  background: linear-gradient(145deg,#111319,#020305) !important;
  color: #fff !important;
  border-color: rgba(244,189,59,.9) !important;
}
.steal-card-corner {
  position: absolute !important;
  left: 9px !important;
  top: 8px !important;
  right: 34px !important;
  min-height: 18px !important;
  display: flex !important;
  align-items: center !important;
  overflow: hidden !important;
  font-size: 8px !important;
  font-weight: 950 !important;
  line-height: 1 !important;
  letter-spacing: .04em !important;
  white-space: nowrap !important;
  text-overflow: ellipsis !important;
}
.steal-hand-card > strong {
  position: absolute !important;
  left: 8px !important;
  right: 8px !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
  min-height: 0 !important;
  display: grid !important;
  place-items: center !important;
  margin: 0 !important;
  padding: 0 !important;
  font: 850 27px/1 Arial, sans-serif !important;
  text-align: center !important;
  white-space: pre-line !important;
}
.steal-hand-card.letter > strong {
  font: 600 clamp(40px, 10vw, 54px)/1 Georgia, serif !important;
}
.steal-hand-card.combo > strong {
  font: 950 clamp(15px, 4vw, 22px)/1 Arial, sans-serif !important;
  letter-spacing: .01em !important;
}
.steal-hand-card.steal > strong {
  top: 47% !important;
  font-size: clamp(34px, 8vw, 46px) !important;
}
.steal-hand-card > small {
  position: absolute !important;
  left: 6px !important;
  right: 6px !important;
  bottom: 9px !important;
  display: block !important;
  margin: 0 !important;
  color: inherit !important;
  font-size: 7px !important;
  font-weight: 950 !important;
  line-height: 1.18 !important;
  letter-spacing: .05em !important;
  text-align: center !important;
}
.steal-hand-card.category > strong { display: none !important; }
.steal-hand-card.category > small {
  top: 50% !important;
  bottom: auto !important;
  transform: translateY(-50%) !important;
  font-size: 9px !important;
}
.steal-hand-card.stop > strong {
  font-size: 14px !important;
  line-height: 1.05 !important;
}
.steal-hand-card > em {
  position: absolute !important;
  right: 6px !important;
  top: 6px !important;
  z-index: 3 !important;
  width: 24px !important;
  height: 24px !important;
  display: grid !important;
  place-items: center !important;
  margin: 0 !important;
  border-radius: 50% !important;
  background: var(--gold, #f4bd3b) !important;
  color: var(--ink, #14213d) !important;
  font-size: 10px !important;
  font-style: normal !important;
  font-weight: 950 !important;
}

@media (max-width: 560px) {
  .combo-letter-grid { grid-template-columns: repeat(5, minmax(0, 1fr)) !important; }
  .combo-letter-choice { min-height: 62px !important; }
  .combo-letter-choice strong { font-size: 28px !important; }
  .steal-hand-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    gap: 8px !important;
  }
  .steal-hand-card { width: 100% !important; }
  .steal-hand-card.letter > strong { font-size: clamp(38px, 12vw, 50px) !important; }
}
`;
}

await writeFile("app/ui-fixes.css", css, "utf8");
console.log("Power-card UI refinement applied: COMBO auto-select and consistent ROBO cards.");
