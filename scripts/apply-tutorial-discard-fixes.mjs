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

await patchFile("lib/game.ts", (source) => {
  if (source.includes("  tutorial?: { active: boolean; step: number; updatedAt: number } | null;"))
    return source;
  return replaceRequired(
    source,
    "  startCountdownEndsAt?: number | null;\n};",
    "  startCountdownEndsAt?: number | null;\n  tutorial?: { active: boolean; step: number; updatedAt: number } | null;\n};",
    "tipar tutorial sincronizado en el estado",
  );
});

await patchFile("app/api/rooms/route.ts", (source) => {
  const tutorialActions = [
    "    if (action === \"tutorialStart\") {",
    "      if (playerId !== state.hostId || state.status !== \"lobby\")",
    "        return Response.json(",
    "          { error: \"Solo el anfitrión puede iniciar el tutorial guiado\" },",
    "          { status: 403 },",
    "        );",
    "      state.tutorial = { active: true, step: 0, updatedAt: Date.now() };",
    "    } else if (action === \"tutorialStep\") {",
    "      if (playerId !== state.hostId || state.status !== \"lobby\")",
    "        return Response.json(",
    "          { error: \"Solo el anfitrión puede controlar el tutorial\" },",
    "          { status: 403 },",
    "        );",
    "      if (!state.tutorial?.active)",
    "        return Response.json(",
    "          { error: \"No hay un tutorial guiado activo\" },",
    "          { status: 409 },",
    "        );",
    "      state.tutorial.step = Math.max(0, Math.min(5, Number(body.step) || 0));",
    "      state.tutorial.updatedAt = Date.now();",
    "    } else if (action === \"tutorialEnd\") {",
    "      if (playerId !== state.hostId)",
    "        return Response.json(",
    "          { error: \"Solo el anfitrión puede finalizar el tutorial guiado\" },",
    "          { status: 403 },",
    "        );",
    "      state.tutorial = null;",
    "    } else if (action === \"leave\") {",
  ].join("\n");

  source = replaceRequired(
    source,
    "    if (action === \"leave\") {",
    tutorialActions,
    "acciones del tutorial guiado",
  );

  source = replaceRequired(
    source,
    "    } else if (action === \"start\") {\n      if (playerId !== state.hostId)",
    "    } else if (action === \"start\") {\n      state.tutorial = null;\n      if (playerId !== state.hostId)",
    "cerrar tutorial al iniciar partida",
  );

  return source;
});

await patchFile("app/page.tsx", (source) => {
  if (!source.includes("  tutorial?: { active: boolean; step: number; updatedAt: number } | null;")) {
    source = replaceRequired(
      source,
      "  startCountdownEndsAt?: number | null;\n  settings:",
      "  startCountdownEndsAt?: number | null;\n  tutorial?: { active: boolean; step: number; updatedAt: number } | null;\n  settings:",
      "tipar tutorial en cliente",
    );
  }

  if (!source.includes("const [localTutorialStep, setLocalTutorialStep]")) {
    source = replaceRequired(
      source,
      "  const [exitModal, setExitModal] = useState(false);",
      "  const [exitModal, setExitModal] = useState(false);\n  const [localTutorialStep, setLocalTutorialStep] = useState<number | null>(null);",
      "estado del tutorial individual",
    );
  }

  if (!source.includes("// A host-guided tutorial always overrides a local one.")) {
    source = replaceRequired(
      source,
      "  useEffect(() => {\n    let active = true;",
      [
        "  // A host-guided tutorial always overrides a local one.",
        "  useEffect(() => {",
        "    if (room?.tutorial?.active) setLocalTutorialStep(null);",
        "  }, [room?.tutorial?.active]);",
        "  useEffect(() => {",
        "    let active = true;",
      ].join("\n"),
      "sobrescribir tutorial individual con el del anfitrión",
    );
  }

  if (!source.includes("function tutorialOverlay()")) {
    const tutorialFunction = `  function tutorialOverlay() {
    if (!room) return null;
    const shared = Boolean(room.tutorial?.active);
    const local = !shared && localTutorialStep !== null;
    if (!shared && !local) return null;
    const stepIndex = Math.max(
      0,
      Math.min(5, shared ? (room.tutorial?.step ?? 0) : (localTutorialStep ?? 0)),
    );
    const steps = [
      {
        eyebrow: "1 · CATEGORÍA",
        title: "Primero, mira la categoría",
        text: "La categoría define qué tipo de palabra debes responder. Léela antes de elegir una carta.",
      },
      {
        eyebrow: "2 · TURNO",
        title: "Mira quién juega y cuánto queda",
        text: "El jugador activo queda resaltado. Cuando sea tu turno, el reloj comienza después del aviso de inicio.",
      },
      {
        eyebrow: "3 · CARTAS",
        title: "Elige una carta de tu mano",
        text: "Las letras se responden con palabras. Las cartas especiales bloquean, invierten, intercambian o cambian la categoría.",
      },
      {
        eyebrow: "4 · RESPUESTA",
        title: "Responde y envía",
        text: "Escribe una palabra válida para la categoría y la letra. Con Ñ, Y, Q o Z también puedes usar «Contiene».",
      },
      {
        eyebrow: "5 · PASAR O DESCARTAR",
        title: "También puedes soltar una carta",
        text: "Puedes pasar y robar. Si seleccionas una carta y tocas la papelera, la descartas, robas 2 y termina tu turno.",
      },
      {
        eyebrow: "6 · VOTACIÓN",
        title: "El grupo decide las respuestas dudosas",
        text: "Cuando aparezca una votación, marca «Válida» o «No válida». La partida continúa cuando la decisión queda resuelta.",
      },
    ] as const;
    const step = steps[stepIndex];
    const hostControls = shared && playerId === room.hostId;
    const previous = () => {
      const next = Math.max(0, stepIndex - 1);
      if (shared) {
        if (hostControls) void act("tutorialStep", { step: next });
      } else setLocalTutorialStep(next);
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
        <div className="tutorial-card">
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
              <div className="tutorial-turn-demo">
                <span className="tutorial-avatar">D</span>
                <b>Tu turno</b>
                <span className="tutorial-mini-timer">20</span>
              </div>
            )}
            {stepIndex === 2 && (
              <div className="tutorial-cards-demo">
                <span>A</span><span>★</span><span>+2</span>
              </div>
            )}
            {stepIndex === 3 && (
              <div className="tutorial-answer-demo">
                <span>M</span>
                <div>Manzana</div>
                <b>Enviar</b>
              </div>
            )}
            {stepIndex === 4 && (
              <div className="tutorial-actions-demo">
                <span><Icon name="skip_next" size={22} /> Paso y robo</span>
                <span className="tutorial-trash"><Icon name="delete" size={24} /> <b>+2</b></span>
              </div>
            )}
            {stepIndex === 5 && (
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
    source = replaceRequired(
      source,
      "  function exitDialog() {",
      tutorialFunction + "  function exitDialog() {",
      "componente del mini tutorial",
    );
  }

  if (!source.includes("className=\"tutorial-launch\"")) {
    source = replaceRequired(
      source,
      "            <div className=\"big-code\">{room.code}</div>\n            {categoryBrowser()}",
      [
        "            <div className=\"big-code\">{room.code}</div>",
        "            <button",
        "              className=\"tutorial-launch\"",
        "              onClick={() => {",
        "                if (playerId === room.hostId) void act(\"tutorialStart\");",
        "                else setLocalTutorialStep(0);",
        "              }}",
        "              disabled={busy || Boolean(room.tutorial?.active)}",
        "            >",
        "              <Icon name=\"help\" size={18} />",
        "              Tutorial",
        "              {playerId === room.hostId && <small>GUIADO PARA TODOS</small>}",
        "            </button>",
        "            {categoryBrowser()}",
      ].join("\n"),
      "botón de tutorial en sala de espera",
    );
  }

  if (!source.includes("          {tutorialOverlay()}\n          {exitDialog()}")) {
    source = replaceRequired(
      source,
      "          </section>\n          {exitDialog()}\n          {toast && <div className=\"toast\">{toast}</div>}",
      "          </section>\n          {tutorialOverlay()}\n          {exitDialog()}\n          {toast && <div className=\"toast\">{toast}</div>}",
      "mostrar tutorial sobre la sala de espera",
    );
  }

  source = replaceRequired(
    source,
    "                disabled={room.players.length < 2 || busy}",
    "                disabled={room.players.length < 2 || busy || Boolean(room.tutorial?.active)}",
    "bloquear inicio durante tutorial guiado",
  );
  source = replaceRequired(
    source,
    "                {room.players.length < 2\n                  ? \"Falta un jugador\"\n                  : \"Comenzar partida\"}",
    "                {room.tutorial?.active\n                  ? \"Finaliza el tutorial\"\n                  : room.players.length < 2\n                    ? \"Falta un jugador\"\n                    : \"Comenzar partida\"}",
    "texto del botón de inicio durante tutorial",
  );

  source = replaceRequired(
    source,
    "      if (room.status === \"lobby\") return 3000;",
    "      if (room.status === \"lobby\") return room.tutorial?.active ? 600 : 3000;",
    "sincronización rápida sólo durante tutorial guiado",
  );
  source = replaceRequired(
    source,
    "    room?.status,\n    room?.pausedAt,",
    "    room?.status,\n    Boolean(room?.tutorial?.active),\n    room?.pausedAt,",
    "actualizar polling al iniciar o finalizar tutorial",
  );

  source = source.replaceAll("Desechar cualquier carta seleccionada, recibir dos y perder el turno", "Descartar cualquier carta seleccionada, recibir dos y perder el turno");
  source = source.replaceAll("Desechar la carta seleccionada, recibir dos y perder el turno", "Descartar la carta seleccionada, recibir dos y perder el turno");
  source = replaceRequired(
    source,
    "              >\n                Desechar +2\n              </button>",
    [
      "              >",
      "                <Icon name=\"delete\" size={17} />",
      "                <span className=\"discard-label\">Descartar</span>",
      "                <strong className=\"discard-penalty\">+2</strong>",
      "              </button>",
    ].join("\n"),
    "papelera visual para descartar cartas",
  );

  return source;
});

await patchFile("app/ui-fixes.css", (source) => {
  const marker = "/* Guided tutorial and discard affordance. */";
  if (source.includes(marker)) return source;
  return source + `

${marker}
.tutorial-launch {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 38px;
  margin: 2px auto 14px;
  padding: 8px 13px;
  border: 1px solid rgba(36,85,214,.22);
  border-radius: 999px;
  background: rgba(36,85,214,.06);
  color: var(--blue,#2455d6);
  font-weight: 850;
}
.tutorial-launch small {
  margin-left: 2px;
  font-size: 8px;
  letter-spacing: .08em;
  opacity: .72;
}
.tutorial-overlay {
  position: fixed;
  inset: 0;
  z-index: 2700;
  display: grid;
  place-items: center;
  box-sizing: border-box;
  padding: max(18px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(18px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  background: rgba(7,15,32,.76);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.tutorial-card {
  position: relative;
  width: min(520px, 100%);
  max-height: min(720px, calc(100dvh - 36px));
  overflow: auto;
  box-sizing: border-box;
  padding: 22px;
  border-radius: 24px;
  background: #fff;
  color: var(--ink,#14213d);
  box-shadow: 0 28px 80px rgba(0,0,0,.34);
  text-align: center;
}
.tutorial-close {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgba(20,33,61,.07);
  color: inherit;
}
.tutorial-demo {
  display: grid;
  place-items: center;
  min-height: 178px;
  margin: 16px 0 20px;
  border-radius: 20px;
  background: linear-gradient(145deg,#f5f7fb,#eef2fb);
  overflow: hidden;
}
.tutorial-category-demo {
  width: min(310px,82%);
  padding: 20px;
  border: 2px solid rgba(36,85,214,.14);
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 12px 34px rgba(20,33,61,.09);
}
.tutorial-category-demo small,
.tutorial-category-demo strong { display:block; }
.tutorial-category-demo small { margin-bottom:8px; font-size:9px; font-weight:900; letter-spacing:.12em; color:#68738a; }
.tutorial-category-demo strong { font: 800 22px/1.05 Georgia,serif; }
.tutorial-turn-demo {
  display:flex;
  align-items:center;
  gap:12px;
  padding:14px 16px;
  border:2px solid #ffd45e;
  border-radius:16px;
  background:#fff;
  box-shadow:0 0 0 3px rgba(255,212,94,.32),0 10px 30px rgba(20,33,61,.1);
}
.tutorial-avatar { display:grid; place-items:center; width:38px; height:38px; border-radius:50%; background:#2455d6; color:#fff; font-weight:900; }
.tutorial-turn-demo b { font-size:18px; }
.tutorial-mini-timer { display:grid; place-items:center; width:48px; height:48px; margin-left:8px; border:4px solid #2455d6; border-radius:50%; font:900 18px/1 Arial,sans-serif; }
.tutorial-cards-demo { display:flex; align-items:center; justify-content:center; gap:10px; }
.tutorial-cards-demo span { display:grid; place-items:center; width:78px; height:108px; border:3px solid rgba(255,255,255,.9); border-radius:14px; background:#2455d6; color:#fff; box-shadow:0 12px 26px rgba(20,33,61,.18); font:900 28px/1 Arial,sans-serif; }
.tutorial-cards-demo span:nth-child(2) { transform:translateY(-8px); background:#7246d8; }
.tutorial-cards-demo span:nth-child(3) { background:#e36d54; }
.tutorial-answer-demo { display:grid; grid-template-columns:52px minmax(0,1fr) auto; align-items:center; gap:8px; width:min(360px,88%); padding:9px; border-radius:16px; background:#fff; box-shadow:0 10px 28px rgba(20,33,61,.1); }
.tutorial-answer-demo > span { display:grid; place-items:center; height:48px; border-radius:12px; background:#2455d6; color:#fff; font-weight:950; font-size:22px; }
.tutorial-answer-demo > div { min-width:0; padding:11px 12px; border:1px solid rgba(20,33,61,.12); border-radius:10px; text-align:left; color:#536078; }
.tutorial-answer-demo > b { padding:12px 14px; border-radius:10px; background:#2455d6; color:#fff; font-size:12px; }
.tutorial-actions-demo { display:flex; align-items:center; justify-content:center; gap:12px; flex-wrap:wrap; }
.tutorial-actions-demo > span { display:flex; align-items:center; gap:7px; min-height:50px; padding:0 15px; border-radius:14px; background:#fff; box-shadow:0 8px 24px rgba(20,33,61,.1); font-weight:850; }
.tutorial-actions-demo .tutorial-trash { background:#e96655; color:#fff; }
.tutorial-vote-demo { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:10px; width:min(360px,88%); }
.tutorial-vote-demo span { padding:13px 10px; border-radius:12px; background:#fff; box-shadow:0 8px 24px rgba(20,33,61,.1); font-weight:850; }
.tutorial-vote-demo span:last-child { background:#2455d6; color:#fff; }
.tutorial-vote-demo strong { font-size:14px; letter-spacing:.12em; }
.tutorial-eyebrow { margin:0 0 7px; color:#2455d6; font-size:10px; font-weight:950; letter-spacing:.13em; }
.tutorial-card h2 { margin:0; font:800 clamp(24px,5vw,34px)/1.04 Georgia,serif; letter-spacing:-.035em; }
.tutorial-copy { max-width:430px; margin:12px auto 0; color:#58657d; font-size:14px; line-height:1.5; }
.tutorial-progress { display:flex; justify-content:center; gap:6px; margin:18px 0; }
.tutorial-progress i { width:7px; height:7px; border-radius:999px; background:rgba(20,33,61,.15); transition:width .16s ease,background .16s ease; }
.tutorial-progress i.active { width:24px; background:#2455d6; }
.tutorial-controls { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.tutorial-controls button { display:flex; align-items:center; justify-content:center; gap:6px; min-height:46px; border-radius:13px; }
.tutorial-following { display:flex; align-items:center; justify-content:center; gap:8px; min-height:46px; padding:0 12px; border-radius:13px; background:rgba(36,85,214,.07); color:#2455d6; font-size:13px; font-weight:850; }

.hand-tool-button.discard-tool {
  gap:4px;
  min-width:auto;
  padding-inline:9px;
}
.hand-tool-button.discard-tool:not(:disabled) {
  border-color:#e96655 !important;
  background:#e96655 !important;
  color:#fff !important;
  box-shadow:0 7px 18px rgba(233,102,85,.3);
}
.hand-tool-button.discard-tool:not(:disabled) .material-icon { fill:currentColor; }
.discard-penalty { font-size:10px; font-weight:950; }
.discard-label { font-size:10px; font-weight:850; }
@media (prefers-reduced-motion: no-preference) {
  .hand-tool-button.discard-tool:not(:disabled) { animation: discardReady 1.1s ease-in-out infinite; }
}
@keyframes discardReady {
  0%,100% { transform:translateY(0); box-shadow:0 7px 18px rgba(233,102,85,.24); }
  50% { transform:translateY(-1px); box-shadow:0 9px 24px rgba(233,102,85,.4); }
}
@media (max-width: 560px) {
  .tutorial-card { padding:18px 16px; border-radius:20px; }
  .tutorial-demo { min-height:154px; margin-top:20px; }
  .tutorial-cards-demo span { width:62px; height:88px; font-size:23px; }
  .tutorial-answer-demo { grid-template-columns:44px minmax(0,1fr); }
  .tutorial-answer-demo > b { grid-column:1 / -1; }
  .tutorial-vote-demo { grid-template-columns:1fr 1fr; }
  .tutorial-vote-demo strong { grid-column:1 / -1; grid-row:1; }
  .discard-label { display:none; }
  .hand-tool-button.discard-tool { min-width:46px; padding-inline:7px; }
}
`;
});

console.log("Guided/local tutorial and clearer discard control applied.");
