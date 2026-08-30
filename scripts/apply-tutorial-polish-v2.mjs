import { readFile, writeFile } from "node:fs/promises";

function replaceRequired(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`No se encontró el bloque esperado para: ${label}`);
  return source.replace(from, to);
}

let route = await readFile("app/api/rooms/route.ts", "utf8");
route = replaceRequired(
  route,
  "      state.tutorial.step = Math.max(0, Math.min(9, Number(body.step) || 0));",
  "      state.tutorial.step = Math.max(0, Math.min(13, Number(body.step) || 0));",
  "permitir catorce pasos en el tutorial guiado",
);
await writeFile("app/api/rooms/route.ts", route, "utf8");

let page = await readFile("app/page.tsx", "utf8");
const start = page.indexOf("  function tutorialOverlay() {");
const end = page.indexOf("  function exitDialog() {", start);
if (start < 0 || end < 0) throw new Error("No se encontró tutorialOverlay para refinar el tutorial.");

const tutorial = `  function tutorialOverlay() {
    if (!room) return null;
    const shared = Boolean(room.tutorial?.active);
    const local = !shared && localTutorialStep !== null;
    if (!shared && !local) return null;
    const stepIndex = Math.max(
      0,
      Math.min(13, shared ? (room.tutorial?.step ?? 0) : (localTutorialStep ?? 0)),
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
        text: "Las cartas de letras son azules. Algunas llevan +1, +2 o +3: si tu respuesta es aceptada, esas cartas se asignan a otros jugadores. Con dos jugadores van automáticamente al rival; con tres o más, puedes darlas todas a un mismo jugador o repartirlas entre distintos jugadores.",
      },
      {
        eyebrow: "4 · COMODÍN",
        title: "Elige cualquier letra",
        text: "El comodín puede representar cualquier letra. Al jugarlo eliges la letra con la que responderás y mantienes la categoría actual.",
      },
      {
        eyebrow: "5 · BLOQUEAR TURNO",
        title: "Salta al siguiente jugador",
        text: "Bloquear hace que el siguiente jugador pierda su turno. En una partida de dos jugadores, el turno vuelve directamente a ti.",
      },
      {
        eyebrow: "6 · SWITCH",
        title: "Cambia el sentido",
        text: "Switch invierte la dirección del orden de juego. Con dos jugadores, al invertir el sentido vuelves a jugar tú.",
      },
      {
        eyebrow: "7 · SWAP",
        title: "Intercambia cartas con un rival",
        text: "Con SWAP eliges un rival y decides si intercambias una carta o la mano completa. Es un intercambio: tú también entregas cartas.",
      },
      {
        eyebrow: "8 · NUEVA CATEGORÍA",
        title: "Cambia el tema de la ronda",
        text: "Nueva categoría cambia el tema que está en juego. Al usarla eliges otra categoría entre las opciones disponibles y la partida continúa con ese nuevo tema.",
      },
      {
        eyebrow: "9 · COMBO",
        title: "Forma una palabra con varias cartas",
        text: "COMBO te permite jugar de 4 a 6 cartas de letras y construir una palabra válida para la categoría. Toca las letras en el orden de la palabra. En COMBO, las cartas de +1, +2 y +3 no reparten ni acumulan su sanción, cuentan como letras normales.",
      },
      {
        eyebrow: "10 · ROBO",
        title: "Fija un rival y elige qué robar",
        text: "Con ROBO primero eliges a un jugador. En cuanto lo fijas, ya no puedes cambiar de objetivo: ves su mano y escoges exactamente una carta para llevártela.",
      },
      {
        eyebrow: "11 · RESPUESTA Y CONTIENE",
        title: "También puedes usar «Contiene»",
        text: "Normalmente la palabra debe comenzar con tu letra. Con Ñ, W, Y, Q o Z puedes activar «Contiene» y usar una palabra que tenga esa letra en cualquier posición.",
      },
      {
        eyebrow: "12 · PASAR O DESCARTAR",
        title: "También puedes soltar una carta",
        text: "Puedes pasar y robar. Si seleccionas una carta y tocas la papelera, la descartas, robas 2 y termina tu turno.",
      },
      {
        eyebrow: "13 · VOTACIÓN",
        title: "El grupo decide las respuestas dudosas",
        text: "Cuando aparezca una votación, marca «Válida» o «No válida». Si una respuesta queda invalidada, su jugador todavía puede tener una última opción: VAR CHECK.",
      },
      {
        eyebrow: "14 · VAR CHECK",
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
        <div className="tutorial-card tutorial-card-v2 tutorial-card-v3 tutorial-card-v4">
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
                <div className="tutorial-real-card letter"><strong>A</strong></div>
                <div className="tutorial-real-card letter"><em>+1</em><strong>V</strong></div>
                <div className="tutorial-real-card letter"><em>+2</em><strong>Q</strong></div>
                <div className="tutorial-real-card letter"><em>+3</em><strong>Ñ</strong></div>
              </div>
            )}
            {stepIndex === 3 && (
              <div className="tutorial-special-single">
                <div className="tutorial-real-card joker tutorial-single-card"><small>COMODÍN</small><strong>★</strong></div>
                <div className="tutorial-special-caption">Cualquier letra · misma categoría</div>
              </div>
            )}
            {stepIndex === 4 && (
              <div className="tutorial-special-single">
                <div className="tutorial-real-card stop tutorial-single-card"><small>BLOQUEAR</small><strong><Icon name="block" size={34} /></strong></div>
                <div className="tutorial-special-caption">El siguiente jugador pierde su turno</div>
              </div>
            )}
            {stepIndex === 5 && (
              <div className="tutorial-special-single">
                <div className="tutorial-real-card reverse tutorial-single-card"><small>SWITCH</small><strong>↔</strong></div>
                <div className="tutorial-special-caption">Se invierte la dirección del juego</div>
              </div>
            )}
            {stepIndex === 6 && (
              <div className="tutorial-special-single">
                <div className="tutorial-real-card swap tutorial-single-card"><small>SWAP</small><strong>⇄</strong></div>
                <div className="tutorial-special-caption">1 carta o la mano completa</div>
              </div>
            )}
            {stepIndex === 7 && (
              <div className="tutorial-special-single">
                <div className="tutorial-real-card category tutorial-single-card"><small>NUEVA</small><strong>C</strong></div>
                <div className="tutorial-special-caption">Elige una nueva categoría</div>
              </div>
            )}
            {stepIndex === 8 && (
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
            {stepIndex === 9 && (
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
            {stepIndex === 10 && (
              <div className="tutorial-contains-demo tutorial-contains-demo-v2">
                <div className="tutorial-contains-category">CATEGORÍA · Deportes</div>
                <div className="tutorial-answer-demo contains-example">
                  <span>Q</span>
                  <div>{highlightedAnswer("Equipo", "Q")}</div>
                  <button type="button" className="active">Contiene</button>
                  <b>Enviar</b>
                </div>
                <small>La Q aparece dentro de «Equipo».</small>
              </div>
            )}
            {stepIndex === 11 && (
              <div className="tutorial-actions-demo">
                <span><Icon name="skip_next" size={22} /> Paso y robo</span>
                <span className="tutorial-trash"><Icon name="delete" size={24} /> <b>+2</b></span>
              </div>
            )}
            {stepIndex === 12 && (
              <div className="tutorial-vote-demo"><span>No válida</span><strong>VOTA</strong><span>Válida</span></div>
            )}
            {stepIndex === 13 && (
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
if (!css.includes("/* Tutorial polish v4. */")) {
  css += `

/* Tutorial polish v4. */
.tutorial-card-v4 .tutorial-progress {
  gap: 4px !important;
  flex-wrap: nowrap !important;
}
.tutorial-card-v4 .tutorial-progress i {
  width: 6px !important;
  height: 6px !important;
  flex: 0 0 6px !important;
}
.tutorial-card-v4 .tutorial-letter-cards-demo .tutorial-real-card.letter > strong {
  margin: 0 !important;
}
.tutorial-special-single {
  width: 100%;
  display: grid;
  place-items: center;
  gap: 12px;
}
.tutorial-special-single .tutorial-single-card {
  width: 92px;
  height: 128px;
}
.tutorial-special-caption {
  max-width: 360px;
  padding: 8px 14px;
  border-radius: 999px;
  background: rgba(36,85,214,.08);
  color: #44516a;
  font-size: 10px;
  font-weight: 850;
  text-align: center;
}
.tutorial-card-v4 .tutorial-combo-build {
  padding-top: 17px;
  overflow: visible;
}
.tutorial-card-v4 .tutorial-combo-build span {
  overflow: visible;
}
.tutorial-card-v4 .tutorial-combo-build i {
  left: 50% !important;
  top: -10px !important;
  transform: translate(-50%, -50%) !important;
  width: 20px !important;
  height: 20px !important;
  font-size: 9px !important;
  box-shadow: 0 3px 9px rgba(20,33,61,.18);
}
.tutorial-card-v4 .tutorial-contains-demo-v2 {
  width: 100%;
  overflow: visible;
}
.tutorial-card-v4 .tutorial-contains-category {
  display: block !important;
  width: min(92%, 480px) !important;
  margin: 0 auto 12px !important;
  padding: 10px 14px !important;
  border-radius: 12px !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
  text-align: center !important;
  white-space: nowrap;
}
.tutorial-card-v4 .tutorial-answer-demo.contains-example {
  width: min(92%, 480px) !important;
  margin-left: auto !important;
  margin-right: auto !important;
}
.tutorial-card-v4 .tutorial-answer-demo.contains-example > div {
  overflow: hidden;
  text-overflow: ellipsis;
}
@media (max-width: 560px) {
  .tutorial-card-v4 .tutorial-progress { gap: 3px !important; }
  .tutorial-card-v4 .tutorial-progress i {
    width: 5px !important;
    height: 5px !important;
    flex-basis: 5px !important;
  }
  .tutorial-special-single .tutorial-single-card {
    width: 82px;
    height: 116px;
  }
  .tutorial-special-caption { font-size: 9px; }
  .tutorial-card-v4 .tutorial-combo-build { padding-top: 16px; }
  .tutorial-card-v4 .tutorial-contains-category,
  .tutorial-card-v4 .tutorial-answer-demo.contains-example {
    width: 94% !important;
  }
}
`;
  await writeFile("app/ui-fixes.css", css, "utf8");
}

console.log("Tutorial refinado: letras, especiales individuales, COMBO y Contiene.");
