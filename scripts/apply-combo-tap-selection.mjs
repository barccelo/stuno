import { readFile, writeFile } from "node:fs/promises";

function replaceSection(source, startMarker, endMarker, replacement, label) {
  if (source.includes(replacement)) return source;
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0)
    throw new Error(`No se encontró la sección esperada para: ${label}`);
  return source.slice(0, start) + replacement + source.slice(end);
}

let page = await readFile("app/page.tsx", "utf8");

page = replaceSection(
  page,
  "  function comboSelectionForAnswer(value: string) {",
  "  function submitCombo() {",
  [
    '  function comboWordFromSelection(ids: string[]) {',
    '    return ids',
    '      .map((id) => hand.find((item) => item.id === id))',
    '      .filter((item): item is GameCard => Boolean(item))',
    '      .map((item) => comboWordLettersClient(item.label))',
    '      .join("")',
    '      .slice(0, 6);',
    '  }',
    '  function toggleComboLetter(cardId: string) {',
    '    const active = comboLetters.includes(cardId);',
    '    if (!active && comboLetters.length >= 6) return;',
    '    const next = active',
    '      ? comboLetters.filter((id) => id !== cardId)',
    '      : [...comboLetters, cardId];',
    '    setComboLetters(next);',
    '    setComboAnswer(comboWordFromSelection(next));',
    '  }',
    '  function clearComboSelection() {',
    '    setComboLetters([]);',
    '    setComboAnswer("");',
    '  }',
    '',
  ].join("\n"),
  "selección táctil ordenada de COMBO",
);

page = replaceSection(
  page,
  "  function submitCombo() {",
  "  function confirmStealTarget() {",
  [
    '  function submitCombo() {',
    '    if (!comboCard || comboLetters.length < 4 || comboLetters.length > 6) return;',
    '    const special = hand.find((item) => item.id === comboCard);',
    '    const letters = comboLetters',
    '      .map((id) => hand.find((item) => item.id === id))',
    '      .filter((item): item is GameCard => Boolean(item));',
    '    if (!special || letters.length !== comboLetters.length) return;',
    '    const submittedAnswer = comboWordFromSelection(comboLetters);',
    '    const exact =',
    '      comboWordLettersClient(submittedAnswer).length === letters.length &&',
    '      comboSignatureClient(submittedAnswer) ===',
    '        comboSignatureClient(letters.map((item) => item.label).join(""));',
    '    if (!exact)',
    '      return show("La palabra debe usar exactamente las cartas seleccionadas.");',
    '    animatePlay(special, () => {',
    '      void act("play", {',
    '        cardId: special.id,',
    '        answer: submittedAnswer,',
    '        comboLetterIds: comboLetters,',
    '      });',
    '      setComboCard(null);',
    '      setComboLetters([]);',
    '      setComboAnswer("");',
    '      setSelected(null);',
    '    });',
    '  }',
    '',
  ].join("\n"),
  "envío COMBO desde selección táctil",
);

page = replaceSection(
  page,
  '        {comboCard && (',
  '        {stealCard && !room.pendingSteal && (',
  [
    '        {comboCard && (',
    '          <section className="action-picker combo-picker combo-picker-tap">',
    '            <p>CARTA COMBO</p>',
    '            <h2>Forma una palabra de 4 a 6 letras</h2>',
    '            <div className="combo-letter-grid" aria-live="polite">',
    '              {hand.filter((card) => card.kind === "letter").map((card) => {',
    '                const order = comboLetters.indexOf(card.id);',
    '                const active = order >= 0;',
    '                const maxed = comboLetters.length >= 6;',
    '                return (',
    '                  <button',
    '                    type="button"',
    '                    key={card.id}',
    '                    className={`combo-letter-choice ${active ? "selected" : ""}`}',
    '                    disabled={!active && maxed}',
    '                    onClick={() => toggleComboLetter(card.id)}',
    '                    aria-pressed={active}',
    '                    aria-label={`${card.label}${card.penalty ? ` más ${card.penalty}` : ""}${active ? `, posición ${order + 1}` : ""}`}',
    '                  >',
    '                    <strong>{card.label}</strong>',
    '                    {card.penalty ? <em>+{card.penalty}</em> : null}',
    '                    {active && <span className="combo-order-badge">{order + 1}</span>}',
    '                  </button>',
    '                );',
    '              })}',
    '            </div>',
    '            <div className="combo-word-row">',
    '              <div className={`combo-formed-word ${comboLetters.length ? "has-word" : ""}`}>',
    '                {comboLetters.length ? comboWordFromSelection(comboLetters).toLocaleUpperCase("es") : "—"}',
    '              </div>',
    '              <button',
    '                type="button"',
    '                className="combo-clear-button"',
    '                onClick={clearComboSelection}',
    '                disabled={!comboLetters.length}',
    '                aria-label="Limpiar selección COMBO"',
    '                title="Limpiar selección"',
    '              >',
    '                <Icon name="delete" size={17} />',
    '              </button>',
    '            </div>',
    '            <div className={`combo-count ${comboLetters.length >= 4 ? "ready" : ""}`}>',
    '              {comboLetters.length}/6 · mínimo 4',
    '            </div>',
    '            <div className="modal-actions combo-actions">',
    '              <button onClick={() => { setComboCard(null); clearComboSelection(); setSelected(null); }}>Cancelar</button>',
    '              <button',
    '                className="confirm"',
    '                disabled={comboLetters.length < 4 || comboLetters.length > 6}',
    '                onClick={submitCombo}',
    '              >',
    '                Jugar COMBO',
    '              </button>',
    '            </div>',
    '          </section>',
    '        )}',
    '',
  ].join("\n"),
  "interfaz táctil compacta de COMBO",
);

await writeFile("app/page.tsx", page, "utf8");

let css = await readFile("app/ui-fixes.css", "utf8");
if (!css.includes("/* COMBO tap-selection UI v2. */")) {
  css += `

/* COMBO tap-selection UI v2. */
.combo-picker-tap {
  gap: 8px !important;
  padding-top: 14px !important;
  padding-bottom: 12px !important;
}
.combo-picker-tap > p {
  margin-bottom: 0 !important;
}
.combo-picker-tap > h2 {
  margin: 0 0 2px !important;
  font-size: clamp(18px, 5vw, 24px) !important;
  line-height: 1.08 !important;
}
.combo-picker-tap .combo-letter-grid {
  gap: 7px !important;
  margin: 4px 0 2px !important;
}
.combo-picker-tap .combo-letter-choice {
  position: relative !important;
  min-height: 62px !important;
  border: 2px solid rgba(8, 83, 104, .14) !important;
  border-radius: 12px !important;
  background: #fff !important;
  cursor: pointer !important;
  transition: transform .12s ease, border-color .12s ease, box-shadow .12s ease, opacity .12s ease !important;
}
.combo-picker-tap .combo-letter-choice:disabled {
  opacity: .42 !important;
  cursor: default !important;
}
.combo-picker-tap .combo-letter-choice.selected {
  border-color: #078aa0 !important;
  box-shadow: 0 0 0 3px rgba(24,191,208,.20) !important;
  transform: translateY(-1px) !important;
}
.combo-order-badge {
  position: absolute !important;
  left: 5px !important;
  top: 5px !important;
  width: 22px !important;
  height: 22px !important;
  display: grid !important;
  place-items: center !important;
  border-radius: 999px !important;
  background: #078aa0 !important;
  color: #fff !important;
  font: 900 12px/1 Arial, sans-serif !important;
  box-shadow: 0 2px 7px rgba(0,0,0,.14) !important;
}
.combo-word-row {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) 36px !important;
  align-items: center !important;
  gap: 8px !important;
  margin-top: 2px !important;
}
.combo-formed-word {
  min-width: 0 !important;
  min-height: 38px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 5px 10px !important;
  border-radius: 10px !important;
  background: rgba(7,138,160,.07) !important;
  color: rgba(14, 52, 62, .42) !important;
  font: 900 clamp(20px, 6vw, 28px)/1 Arial, sans-serif !important;
  letter-spacing: .08em !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}
.combo-formed-word.has-word {
  color: #103b46 !important;
}
.combo-clear-button {
  width: 36px !important;
  height: 36px !important;
  display: grid !important;
  place-items: center !important;
  padding: 0 !important;
  border-radius: 10px !important;
}
.combo-clear-button:disabled {
  opacity: .35 !important;
}
.combo-picker-tap .combo-count {
  margin: -1px 0 1px !important;
  text-align: center !important;
  font-size: 11px !important;
  line-height: 1.1 !important;
}
.combo-actions {
  margin-top: 2px !important;
}
@media (max-height: 720px) {
  .combo-picker-tap {
    gap: 6px !important;
    padding-top: 10px !important;
    padding-bottom: 9px !important;
  }
  .combo-picker-tap .combo-letter-grid {
    gap: 5px !important;
    margin: 2px 0 !important;
  }
  .combo-picker-tap .combo-letter-choice {
    min-height: 54px !important;
  }
  .combo-picker-tap .combo-letter-choice strong {
    font-size: 27px !important;
  }
  .combo-formed-word {
    min-height: 34px !important;
    font-size: 20px !important;
  }
}
`;
}
await writeFile("app/ui-fixes.css", css, "utf8");
