import { readFile, writeFile } from "node:fs/promises";

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`No se encontró el bloque esperado para: ${label}`);
  return source.replace(from, to);
}

let route = await readFile("app/api/rooms/route.ts", "utf8");
route = replaceRequired(
  route,
  "      state.tutorial.step = Math.max(0, Math.min(6, Number(body.step) || 0));",
  "      state.tutorial.step = Math.max(0, Math.min(9, Number(body.step) || 0));",
  "permitir diez pasos en el tutorial guiado",
);
await writeFile("app/api/rooms/route.ts", route, "utf8");

let page = await readFile("app/page.tsx", "utf8");
const start = page.indexOf("  function tutorialOverlay() {");
const end = page.indexOf("  function exitDialog() {", start);
if (start < 0 || end < 0) throw new Error("No se encontró tutorialOverlay para ampliar el tutorial.");

const tutorial = `  function tutorialOverlay() {
    if (!room) return null;
    const shared = Boolean(room.tutorial?.active);
    const local = !shared && localTutorialStep !== null;
    if (!shared && !local) return null;
    const stepIndex = Math.max(
      0,
      Math.min(9, shared ? (room.tutorial?.step ?? 0) : (localTutorialStep ?? 0)),
    );
    const steps = [
      {
        eyebrow: "1 · CATEGORÍA",
        title: "Primero, mira la categoría",
        text: "La categoría define qué tipo de palabra debes responder. Léela antes de elegir una carta.",
      },
      {
        eyebrow: "2 · TURNO Y ORDEN",
        title: "Ubícate en el orden de juego",
        text: "El turno actual se marca en amarillo y el jugador que viene después en azul. El reloj muestra cuánto tiempo queda para jugar.",
      },
      {
        eyebrow: "3 · CARTAS DE LETRAS",
        title: "Juega una letra y responde",
        text: "Las cartas de letras son azules. Algunas llevan +1, +2 o +3: si tu respuesta es aceptada, esas cartas se asignan a otro jugador. Con dos jugadores van automáticamente al rival; con más jugadores puedes repartirlas.",
      },
      {
        eyebrow: "4 · CARTAS ESPECIALES",
        title: "Cada especial cambia la jugada",
        text: "El comodín permite cualquier letra; Bloquear salta al siguiente jugador; Switch cambia el sentido; Nueva categoría obliga a elegir otra categoría; y SWAP permite intercambiar una carta o la mano completa con el rival que elijas.",
      },
      {
        eyebrow: "5 · COMBO",
        title: "Forma una palabra con varias cartas",
        text: "COMBO te permite jugar de 4 a 6 cartas de letras y construir una palabra válida para la categoría. Toca las letras en el orden de la palabra. Los +1, +2 y +3 cuentan solo como letras dentro del COMBO.",
      },
      {
        eyebrow: "6 · ROBO",
        title: "Fija un rival y elige qué robar",
        text: "Con ROBO primero eliges a un jugador. En cuanto lo fijas, ya no puedes cambiar de objetivo: ves su mano y escoges exactamente una carta para llevártela.",
      },
      {
        eyebrow: "7 · RESPUESTA Y CONTIENE",
        title: "También puedes usar «Contiene»",
        text: "Normalmente la palabra debe comenzar con tu letra. Con Ñ, Y, Q o Z puedes activar «Contiene» y usar una palabra que tenga esa letra en cualquier posición.",
      },
      {
        eyebrow: "8 · PASAR O DESCARTAR",
        title: "También puedes soltar una carta",
        text: "Puedes pasar y robar. Si seleccionas una carta y tocas la papelera, la descartas, robas 2 y termina tu turno.",
      },
      {
        eyebrow: "9 · VOTACIÓN",
        title: "El grupo decide las respuestas dudosas",
        text: "Cuando aparezca una votación, marca «Válida» o «No válida». Si una respuesta queda invalidada, su jugador todavía puede tener una última opción: VAR CHECK.",
      },
      {
        eyebrow: "10 · VAR CHECK",
        title: "Impugna una invalidación",
        text: "Cada jugador dispone de 2 VAR CHECK. Tras una invalidación tienes 5 segundos para impugnar. El anfitrión revisa la categoría, la respuesta y la carta, y decide si mantiene la invalidación o si la respuesta era válida. Si impugnas y la invalidación se mantiene, gastas 1 VAR.",
      },
    ] as const;
    const step = steps[stepIndex];
    const hostControls = shared && playerId === room.hostId;
    const previous = () => {
      const nextStep = Math.max(0, stepIndex - 1);
      if (shared) {
        if (hostControls) void act("tutorialStep", { step: nextStep });
      } else setLocalTutorialStep(nextStep);
    };
    const next = () => {
      if (stepIndex >= steps.length - 1) {
        if (shared) {
          if (hostControls) void act("tutorialEnd");
        } else setLocalTutorialStep(null);
        return;
      }
      const nextStep = stepIndex + 1;
      if (shared) {
        if (hostControls) void act("tutorialStep", { step: nextStep });
      } else setLocalTutorialStep(nextStep);
    };
    const close = () => {
      if (shared) {
        if (hostControls) void act("tutorialEnd");
      } else setLocalTutorialStep(null);
    };

    return (
      <section className={\`tutorial-overlay \${shared ? "shared" : "local"}\`} role="dialog" aria-modal="true" aria-label="Tutorial de STUNO">
        <div className="tutorial-card tutorial-card-v2 tutorial-card-v3">
          {(local || hostControls) && (
            <button className="tutorial-close" aria-label="Cerrar tutorial" onClick={close}>
              <Icon name="close" size={20} />
            </button>
          )}
          <div className={\`tutorial-demo tutorial-step-\${stepIndex}\`} aria-hidden="true">
            {stepIndex === 0 && (
              <div className="tutorial-category-demo">
                <small>CATEGORÍA</small>
                <strong>Algo que encuentras en una cocina</strong>
              </div>
            )}
            {stepIndex === 1 && (
              <div className="tutorial-turn-order-demo">
                <div className="tutorial-turn-person previous"><span>A</span><small>ANTES</small><b>Ana</b></div>
                <div className="tutorial-turn-person current"><span>D</span><small>AHORA</small><b>David</b></div>
                <div className="tutorial-turn-person next"><span>M</span><small>DESPUÉS</small><b>María</b></div>
                <div className="tutorial-turn-clock"><strong>20</strong><small>SEG</small></div>
              </div>
            )}
            {stepIndex === 2 && (
              <div className="tutorial-letter-cards-demo">
                <div className="tutorial-real-card letter"><small>A</small><strong>A</strong></div>
                <div className="tutorial-real-card letter"><small>V</small><em>+1</em><strong>V</strong></div>
                <div className="tutorial-real-card letter"><small>Q</small><em>+2</em><strong>Q</strong></div>
                <div className="tutorial-real-card letter"><small>Ñ</small><em>+3</em><strong>Ñ</strong></div>
              </div>
            )}
            {stepIndex === 3 && (
              <div className="tutorial-specials-demo">
                <div className="tutorial-special-grid">
                  <div className="tutorial-real-card joker"><small>COMODÍN</small><strong>★</strong></div>
                  <div className="tutorial-real-card stop"><small>BLOQUEAR</small><strong><Icon name="block" size={30} /></strong></div>
                  <div className="tutorial-real-card reverse"><small>SWITCH</small><strong>↔</strong></div>
                  <div className="tutorial-real-card swap"><small>SWAP</small><strong>⇄</strong></div>
                  <div className="tutorial-real-card category"><small>NUEVA</small><strong>C</strong></div>
                </div>
                <div className="tutorial-swap-note"><strong>SWAP</strong><span>Elige un rival → intercambia <b>1 carta</b> o <b>la mano completa</b>.</span></div>
              </div>
            )}
            {stepIndex === 4 && (
              <div className="tutorial-combo-demo">
                <div className="tutorial-power-card combo"><strong>COMBO</strong></div>
                <div className="tutorial-combo-build">
                  {["C", "A", "S", "A"].map((letter, index) => (
                    <span key={index}><i>{index + 1}</i>{letter}</span>
                  ))}
                </div>
                <b>CASA</b>
                <small>4 letras seleccionadas · máximo 6</small>
              </div>
            )}
            {stepIndex === 5 && (
              <div className="tutorial-steal-demo">
                <div className="tutorial-power-card steal"><small>ROBO</small><strong>☠</strong></div>
                <div className="tutorial-steal-flow">
                  <span><small>1</small><b>Fija a María</b></span>
                  <i>→</i>
                  <span><small>2</small><b>Ve su mano</b></span>
                  <i>→</i>
                  <span><small>3</small><b>Elige una carta</b></span>
                </div>
                <small className="locked-note">Objetivo bloqueado: no puedes cambiar de jugador.</small>
              </div>
            )}
            {stepIndex === 6 && (
              <div className="tutorial-contains-demo">
                <div className="tutorial-contains-category">CATEGORÍA · Deportes</div>
                <div className="tutorial-answer-demo contains-example"><span>Q</span><div>Equipo</div><button type="button" className="active">Contiene</button><b>Enviar</b></div>
                <small>La Q aparece dentro de «Equipo».</small>
              </div>
            )}
            {stepIndex === 7 && (
              <div className="tutorial-actions-demo">
                <span><Icon name="skip_next" size={22} /> Paso y robo</span>
                <span className="tutorial-trash"><Icon name="delete" size={24} /> <b>+2</b></span>
              </div>
            )}
            {stepIndex === 8 && (
              <div className="tutorial-vote-demo"><span>No válida</span><strong>VOTA</strong><span>Válida</span></div>
            )}
            {stepIndex === 9 && (
              <div className="tutorial-var-demo">
                <div className="tutorial-var-window-demo">
                  <div><small>RESPUESTA INVALIDADA</small><strong>VAR CHECK · 2 disponibles</strong></div>
                  <span>5</span>
                  <button type="button">Impugnar</button>
                </div>
                <div className="tutorial-var-review-demo">
                  <small>EL ANFITRIÓN REVISA</small>
                  <span>Mantener invalidación</span>
                  <b>Era válida</b>
                </div>
              </div>
            )}
          </div>
          <p className="tutorial-eyebrow">{step.eyebrow}</p>
          <h2>{step.title}</h2>
          <p className="tutorial-copy">{step.text}</p>
          <div className="tutorial-progress" aria-label={\`Paso \${stepIndex + 1} de \${steps.length}\`}>
            {steps.map((_, index) => <i key={index} className={index === stepIndex ? "active" : ""} />)}
          </div>
          {shared && !hostControls ? (
            <div className="tutorial-following"><Icon name="help" size={18} />El anfitrión está guiando el tutorial.</div>
          ) : (
            <div className="tutorial-controls">
              <button onClick={previous} disabled={stepIndex === 0 || busy}><Icon name="arrow_back" size={18} /> Anterior</button>
              <button className="primary" onClick={next} disabled={busy}>
                {stepIndex === steps.length - 1 ? "Finalizar" : "Siguiente"}
                {stepIndex < steps.length - 1 && <Icon name="arrow_forward" size={18} />}
              </button>
            </div>
          )}
        </div>
      </section>
    );
  }

`;
page = page.slice(0, start) + tutorial + page.slice(end);
await writeFile("app/page.tsx", page, "utf8");

let css = await readFile("app/ui-fixes.css", "utf8");
if (!css.includes("/* Tutorial power cards and VAR v1. */")) {
  css += `

/* Tutorial power cards and VAR v1. */
.tutorial-card-v3 .tutorial-progress { gap: 5px; }
.tutorial-card-v3 .tutorial-progress i { width: 7px; height: 7px; }
.tutorial-combo-demo,
.tutorial-steal-demo,
.tutorial-var-demo {
  width: 100%;
  display: grid;
  place-items: center;
  gap: 11px;
}
.tutorial-power-card {
  position: relative;
  width: 92px;
  height: 126px;
  display: grid;
  place-items: center;
  border: 3px solid rgba(255,255,255,.86);
  border-radius: 13px;
  color: #fff;
  box-shadow: 0 10px 24px rgba(20,33,61,.2);
  overflow: hidden;
}
.tutorial-power-card.combo { background: linear-gradient(145deg,#18bfd0,#078aa0); }
.tutorial-power-card.combo strong { font: 950 18px/1 Arial,sans-serif; letter-spacing: .03em; }
.tutorial-power-card.steal { background: linear-gradient(145deg,#111319,#020305); border-color: #f4bd3b; }
.tutorial-power-card.steal small { position: absolute; left: 9px; top: 8px; color: #f4bd3b; font-size: 8px; font-weight: 950; letter-spacing: .12em; }
.tutorial-power-card.steal strong { font: 800 50px/1 Arial,sans-serif; }
.tutorial-combo-demo { grid-template-columns: auto 1fr; grid-template-areas: "card build" "card word" "card note"; align-items: center; }
.tutorial-combo-demo > .tutorial-power-card { grid-area: card; }
.tutorial-combo-build { grid-area: build; display: flex; justify-content: center; gap: 7px; }
.tutorial-combo-build span {
  position: relative;
  width: 48px;
  height: 62px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  background: #2455d6;
  color: #fff;
  font: 700 26px/1 Georgia,serif;
  box-shadow: 0 5px 12px rgba(20,33,61,.15);
}
.tutorial-combo-build i {
  position: absolute;
  left: 4px;
  top: 4px;
  width: 17px;
  height: 17px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #fff;
  color: #078aa0;
  font: 900 8px/1 Arial,sans-serif;
}
.tutorial-combo-demo > b { grid-area: word; font: 900 23px/1 Arial,sans-serif; letter-spacing: .14em; color: #14213d; }
.tutorial-combo-demo > small { grid-area: note; color: #6d7789; font-size: 9px; font-weight: 800; }
.tutorial-steal-demo { grid-template-columns: 92px 1fr; }
.tutorial-steal-flow { display: flex; align-items: center; justify-content: center; gap: 5px; width: 100%; }
.tutorial-steal-flow span { min-width: 0; padding: 8px 7px; border-radius: 10px; background: #eef2f7; color: #14213d; text-align: center; }
.tutorial-steal-flow span small { display: grid; place-items: center; width: 18px; height: 18px; margin: 0 auto 4px; border-radius: 50%; background: #111319; color: #f4bd3b; font-weight: 950; }
.tutorial-steal-flow span b { display: block; font-size: 9px; line-height: 1.15; }
.tutorial-steal-flow > i { color: #8791a2; font-style: normal; font-weight: 950; }
.tutorial-steal-demo .locked-note { grid-column: 1 / -1; color: #6d7789; font-size: 9px; font-weight: 800; }
.tutorial-var-window-demo {
  width: min(100%, 480px);
  display: grid;
  grid-template-columns: 1fr 34px auto;
  align-items: center;
  gap: 9px;
  padding: 11px 12px;
  border: 1px solid rgba(20,33,61,.12);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 8px 20px rgba(20,33,61,.1);
}
.tutorial-var-window-demo div small { display: block; color: #718087; font-size: 7px; font-weight: 950; letter-spacing: .08em; }
.tutorial-var-window-demo div strong { display: block; margin-top: 2px; color: #173642; font-size: 11px; }
.tutorial-var-window-demo > span { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 50%; background: #eef6f8; color: #0b7387; font-weight: 950; }
.tutorial-var-window-demo button { min-height: 34px; padding: 0 11px; border: 0; border-radius: 9px; background: #0b94a8; color: #fff; font-size: 9px; font-weight: 950; }
.tutorial-var-review-demo { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; width: min(100%, 420px); }
.tutorial-var-review-demo > small { grid-column: 1 / -1; color: #078ba0; font-size: 8px; font-weight: 950; letter-spacing: .1em; text-align: center; }
.tutorial-var-review-demo span,
.tutorial-var-review-demo b { min-height: 34px; display: grid; place-items: center; padding: 5px; border-radius: 9px; font-size: 8px; text-align: center; }
.tutorial-var-review-demo span { background: #edf0f1; color: #5e2929; }
.tutorial-var-review-demo b { background: #168b61; color: #fff; }
@media (max-width: 560px) {
  .tutorial-card-v3 .tutorial-demo { min-height: 176px; }
  .tutorial-combo-demo { grid-template-columns: 74px 1fr; gap: 7px; }
  .tutorial-power-card { width: 72px; height: 100px; }
  .tutorial-power-card.combo strong { font-size: 14px; }
  .tutorial-power-card.steal strong { font-size: 38px; }
  .tutorial-combo-build { gap: 4px; }
  .tutorial-combo-build span { width: 38px; height: 50px; font-size: 22px; }
  .tutorial-steal-demo { grid-template-columns: 72px 1fr; gap: 7px; }
  .tutorial-steal-flow { gap: 3px; }
  .tutorial-steal-flow span { padding: 6px 4px; }
  .tutorial-steal-flow span b { font-size: 7px; }
  .tutorial-var-window-demo { grid-template-columns: 1fr 30px auto; gap: 6px; padding: 9px; }
  .tutorial-var-window-demo button { padding: 0 8px; }
}
`;
  await writeFile("app/ui-fixes.css", css, "utf8");
}

console.log("Tutorial ampliado con COMBO, ROBO y VAR CHECK.");
