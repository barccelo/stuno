import { readFile, writeFile } from "node:fs/promises";

async function patchFile(path, transform) {
  const before = await readFile(path, "utf8");
  const after = transform(before);
  if (after !== before) await writeFile(path, after, "utf8");
}

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) {
    throw new Error(`No se encontró el bloque esperado para: ${label}`);
  }
  return source.replace(from, to);
}

await patchFile("app/api/rooms/route.ts", (source) =>
  replaceRequired(
    source,
    "      state.tutorial.step = Math.max(0, Math.min(5, Number(body.step) || 0));",
    "      state.tutorial.step = Math.max(0, Math.min(6, Number(body.step) || 0));",
    "permitir siete pasos en el tutorial guiado",
  ),
);

await patchFile("app/page.tsx", (source) => {
  const start = source.indexOf("  function tutorialOverlay() {");
  const end = source.indexOf("  function exitDialog() {", start);
  if (start < 0 || end < 0) {
    throw new Error("No se encontró el tutorial base para refinar su contenido.");
  }

  const refined = `  function tutorialOverlay() {
    if (!room) return null;
    const shared = Boolean(room.tutorial?.active);
    const local = !shared && localTutorialStep !== null;
    if (!shared && !local) return null;
    const stepIndex = Math.max(
      0,
      Math.min(6, shared ? (room.tutorial?.step ?? 0) : (localTutorialStep ?? 0)),
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
        eyebrow: "5 · RESPUESTA Y CONTIENE",
        title: "También puedes usar «Contiene»",
        text: "Normalmente la palabra debe comenzar con tu letra. Con Ñ, Y, Q o Z puedes activar «Contiene» y usar una palabra que tenga esa letra en cualquier posición.",
      },
      {
        eyebrow: "6 · PASAR O DESCARTAR",
        title: "También puedes soltar una carta",
        text: "Puedes pasar y robar. Si seleccionas una carta y tocas la papelera, la descartas, robas 2 y termina tu turno.",
      },
      {
        eyebrow: "7 · VOTACIÓN",
        title: "El grupo decide las respuestas dudosas",
        text: "Cuando aparezca una votación, marca «Válida» o «No válida». La partida continúa cuando la decisión queda resuelta.",
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
        <div className="tutorial-card tutorial-card-v2">
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
                <div className="tutorial-turn-person previous">
                  <span>A</span>
                  <small>ANTES</small>
                  <b>Ana</b>
                </div>
                <div className="tutorial-turn-person current">
                  <span>D</span>
                  <small>AHORA</small>
                  <b>David</b>
                </div>
                <div className="tutorial-turn-person next">
                  <span>M</span>
                  <small>DESPUÉS</small>
                  <b>María</b>
                </div>
                <div className="tutorial-turn-clock">
                  <strong>20</strong>
                  <small>SEG</small>
                </div>
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
                <div className="tutorial-swap-note">
                  <strong>SWAP</strong>
                  <span>Elige un rival → intercambia <b>1 carta</b> o <b>la mano completa</b>.</span>
                </div>
              </div>
            )}
            {stepIndex === 4 && (
              <div className="tutorial-contains-demo">
                <div className="tutorial-contains-category">CATEGORÍA · Deportes</div>
                <div className="tutorial-answer-demo contains-example">
                  <span>Q</span>
                  <div>Equipo</div>
                  <button type="button" className="active">Contiene</button>
                  <b>Enviar</b>
                </div>
                <small>La Q aparece dentro de «Equipo».</small>
              </div>
            )}
            {stepIndex === 5 && (
              <div className="tutorial-actions-demo">
                <span><Icon name="skip_next" size={22} /> Paso y robo</span>
                <span className="tutorial-trash"><Icon name="delete" size={24} /> <b>+2</b></span>
              </div>
            )}
            {stepIndex === 6 && (
              <div className="tutorial-vote-demo">
                <span>No válida</span>
                <strong>VOTA</strong>
                <span>Válida</span>
              </div>
            )}
          </div>
          <p className="tutorial-eyebrow">{step.eyebrow}</p>
          <h2>{step.title}</h2>
          <p className="tutorial-copy">{step.text}</p>
          <div className="tutorial-progress" aria-label={\`Paso \${stepIndex + 1} de \${steps.length}\`}>
            {steps.map((_, index) => (
              <i key={index} className={index === stepIndex ? "active" : ""} />
            ))}
          </div>
          {shared && !hostControls ? (
            <div className="tutorial-following">
              <Icon name="help" size={18} />
              El anfitrión está guiando el tutorial.
            </div>
          ) : (
            <div className="tutorial-controls">
              <button onClick={previous} disabled={stepIndex === 0 || busy}>
                <Icon name="arrow_back" size={18} /> Anterior
              </button>
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

  return source.slice(0, start) + refined + source.slice(end);
});

await patchFile("app/ui-fixes.css", (source) => {
  const marker = "/* Tutorial content refinement v2. */";
  if (source.includes(marker)) return source;

  return source + `

${marker}
.tutorial-card-v2 {
  width: min(680px, calc(100vw - 28px)) !important;
}
.tutorial-card-v2 .tutorial-demo {
  min-height: 190px;
}
.tutorial-turn-order-demo {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr)) 64px;
  gap: 8px;
  align-items: center;
  width: 100%;
}
.tutorial-turn-person {
  min-width: 0;
  padding: 10px 7px;
  border: 1px solid rgba(20,33,61,.12);
  border-radius: 12px;
  background: #fff;
  text-align: center;
}
.tutorial-turn-person > span {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  margin: 0 auto 6px;
  border-radius: 50%;
  background: #e8ecf3;
  font-weight: 900;
}
.tutorial-turn-person small {
  display: block;
  margin-bottom: 3px;
  font-size: 7px;
  font-weight: 950;
  letter-spacing: .12em;
  color: #7b8598;
}
.tutorial-turn-person b {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  white-space: nowrap;
}
.tutorial-turn-person.current {
  border: 2px solid var(--gold,#f4bd3b);
  background: #fff9e8;
  box-shadow: 0 0 0 3px rgba(244,189,59,.14);
}
.tutorial-turn-person.current > span {
  background: var(--gold,#f4bd3b);
  color: var(--ink,#14213d);
}
.tutorial-turn-person.next {
  border-color: var(--blue,#2455d6);
  background: #f3f6ff;
}
.tutorial-turn-person.next > span {
  background: var(--blue,#2455d6);
  color: #fff;
}
.tutorial-turn-clock {
  width: 58px;
  height: 58px;
  display: grid;
  place-content: center;
  justify-self: center;
  border-radius: 50%;
  background: radial-gradient(circle,#fff 59%,transparent 61%), conic-gradient(var(--gold,#f4bd3b) 78%,rgba(20,33,61,.1) 0);
  text-align: center;
}
.tutorial-turn-clock strong { font: 800 22px/1 Georgia,serif; }
.tutorial-turn-clock small { margin-top: 2px; font-size: 6px; font-weight: 950; letter-spacing: .12em; }
.tutorial-letter-cards-demo,
.tutorial-special-grid {
  display: flex;
  justify-content: center;
  gap: 10px;
  flex-wrap: wrap;
  width: 100%;
}
.tutorial-real-card {
  position: relative;
  width: 82px;
  height: 116px;
  display: flex;
  flex-direction: column;
  border: 3px solid rgba(255,255,255,.8);
  border-radius: 11px;
  padding: 8px;
  color: #fff;
  background: var(--blue,#2455d6);
  box-shadow: 0 9px 18px rgba(20,33,61,.18);
}
.tutorial-real-card > small {
  font-size: 7px;
  font-weight: 950;
  letter-spacing: .05em;
}
.tutorial-real-card > strong {
  display: grid;
  flex: 1;
  place-items: center;
  font: 700 44px/1 Georgia,serif;
}
.tutorial-real-card > em {
  position: absolute;
  right: 7px;
  top: 7px;
  width: 25px;
  height: 25px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--gold,#f4bd3b);
  color: var(--ink,#14213d);
  font-size: 10px;
  font-style: normal;
  font-weight: 950;
}
.tutorial-real-card.joker {
  background: var(--gold,#f4bd3b);
  color: var(--ink,#14213d);
}
.tutorial-real-card.joker > strong { font-size: 50px; }
.tutorial-real-card.stop { background: var(--red,#ef5a4c); }
.tutorial-real-card.stop > strong { font-family: Arial,sans-serif; }
.tutorial-real-card.reverse { background: var(--violet,#7556c9); }
.tutorial-real-card.reverse > strong { font-family: Arial,sans-serif; font-weight: 900; }
.tutorial-real-card.swap { background: #168f88; }
.tutorial-real-card.swap > strong { font-family: Arial,sans-serif; font-weight: 900; }
.tutorial-real-card.category { background: #e8862c; }
.tutorial-real-card.category > strong { font-family: Arial,sans-serif; font-weight: 950; }
.tutorial-specials-demo {
  display: grid;
  gap: 12px;
  justify-items: center;
  width: 100%;
}
.tutorial-special-grid .tutorial-real-card {
  width: 70px;
  height: 98px;
}
.tutorial-special-grid .tutorial-real-card > strong { font-size: 34px; }
.tutorial-swap-note {
  width: min(480px,100%);
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 9px 12px;
  border-radius: 10px;
  background: rgba(22,143,136,.1);
  color: #35516a;
  font-size: 10px;
  text-align: left;
}
.tutorial-swap-note > strong {
  color: #168f88;
  font-size: 12px;
}
.tutorial-contains-demo {
  display: grid;
  gap: 9px;
  width: min(520px,100%);
  justify-items: center;
}
.tutorial-contains-category {
  width: 100%;
  padding: 8px 12px;
  border-radius: 9px;
  background: var(--red,#ef5a4c);
  color: #fff;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: .08em;
  text-align: left;
}
.tutorial-answer-demo.contains-example {
  display: grid;
  grid-template-columns: 46px minmax(0,1fr) auto auto;
  gap: 6px;
  width: 100%;
  align-items: stretch;
}
.tutorial-answer-demo.contains-example > span {
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: var(--blue,#2455d6);
  color: #fff;
  font: 700 24px Georgia,serif;
}
.tutorial-answer-demo.contains-example > div {
  display: flex;
  align-items: center;
  min-width: 0;
  padding: 0 12px;
  border: 1px solid rgba(20,33,61,.14);
  border-radius: 8px;
  background: #fff;
  font-size: 13px;
  text-align: left;
}
.tutorial-answer-demo.contains-example > button {
  border: 1px solid var(--blue,#2455d6);
  border-radius: 8px;
  padding: 0 10px;
  background: #eef3ff;
  color: var(--blue,#2455d6);
  font-size: 9px;
  font-weight: 900;
}
.tutorial-answer-demo.contains-example > b {
  display: grid;
  place-items: center;
  border-radius: 8px;
  padding: 0 11px;
  background: var(--ink,#14213d);
  color: #fff;
  font-size: 9px;
}
.tutorial-contains-demo > small {
  font-size: 9px;
  color: #6f7b90;
}
@media (max-width: 560px) {
  .tutorial-card-v2 { padding: 20px 16px 16px !important; }
  .tutorial-card-v2 .tutorial-demo { min-height: 172px; }
  .tutorial-turn-order-demo { grid-template-columns: repeat(3,minmax(0,1fr)); }
  .tutorial-turn-clock { grid-column: 1 / -1; width: 48px; height: 48px; }
  .tutorial-turn-clock strong { font-size: 18px; }
  .tutorial-turn-person { padding: 8px 4px; }
  .tutorial-turn-person > span { width: 29px; height: 29px; }
  .tutorial-letter-cards-demo { gap: 6px; flex-wrap: nowrap; }
  .tutorial-real-card { width: 64px; height: 92px; padding: 6px; }
  .tutorial-real-card > strong { font-size: 33px; }
  .tutorial-real-card > em { right: 4px; top: 4px; width: 21px; height: 21px; font-size: 9px; }
  .tutorial-special-grid { gap: 5px; flex-wrap: nowrap; }
  .tutorial-special-grid .tutorial-real-card { width: 54px; height: 80px; padding: 5px; }
  .tutorial-special-grid .tutorial-real-card > small { font-size: 5px; }
  .tutorial-special-grid .tutorial-real-card > strong { font-size: 25px; }
  .tutorial-swap-note { font-size: 9px; }
  .tutorial-answer-demo.contains-example { grid-template-columns: 42px minmax(0,1fr) auto; }
  .tutorial-answer-demo.contains-example > b { grid-column: 2 / 4; min-height: 34px; }
  .tutorial-answer-demo.contains-example > button { padding: 0 7px; }
}
`;
});

console.log("Tutorial refined with real cards, turn colors and Contains example.");
