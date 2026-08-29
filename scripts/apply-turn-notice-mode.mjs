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

await patchFile("lib/game.ts", (source) =>
  replaceRequired(
    source,
    "    startDelaySeconds: number;\n    difficulty:",
    "    startDelaySeconds: number;\n    turnNoticeMode?: \"normal\" | \"random\";\n    difficulty:",
    "tipar modalidad del aviso de turno",
  ),
);

await patchFile("app/api/rooms/route.ts", (source) =>
  replaceRequired(
    source,
    "          startDelaySeconds: Math.max(\n            3,\n            Math.min(10, Number(body.startDelaySeconds) || 5),\n          ),\n          difficulty: \"mixed\",",
    "          startDelaySeconds: Math.max(\n            3,\n            Math.min(10, Number(body.startDelaySeconds) || 5),\n          ),\n          turnNoticeMode: body.turnNoticeMode === \"random\" ? \"random\" : \"normal\",\n          difficulty: \"mixed\",",
    "guardar modalidad del aviso al crear sala",
  ),
);

await patchFile("app/page.tsx", (source) => {
  source = replaceRequired(
    source,
    "    turnSeconds: number;\n    startDelaySeconds: number;\n  };",
    "    turnSeconds: number;\n    startDelaySeconds: number;\n    turnNoticeMode?: \"normal\" | \"random\";\n  };",
    "tipar modalidad del aviso en cliente",
  );

  source = replaceRequired(
    source,
    "  const [startDelay, setStartDelay] = useState(5);\n  const [name, setName] = useState(\"\");",
    "  const [startDelay, setStartDelay] = useState(5);\n  const [turnNoticeMode, setTurnNoticeMode] = useState<\"normal\" | \"random\">(\"normal\");\n  const [name, setName] = useState(\"\");",
    "estado local de modalidad del aviso",
  );

  source = replaceRequired(
    source,
    "      turnSeconds: seconds,\n      startDelaySeconds: startDelay,\n      categories: custom,",
    "      turnSeconds: seconds,\n      startDelaySeconds: startDelay,\n      turnNoticeMode,\n      categories: custom,",
    "enviar modalidad al crear sala",
  );

  source = replaceRequired(
    source,
    "      <main className=\"game-shell\" onPointerDown={dismissSelectionFromBackground}>",
    "      <main\n        className=\"game-shell\"\n        data-turn-notice-mode={room.settings.turnNoticeMode ?? \"normal\"}\n        onPointerDown={dismissSelectionFromBackground}\n      >",
    "exponer modalidad al aviso visual",
  );

  source = replaceRequired(
    source,
    "                </fieldset>\n              </div>\n              <aside className=\"setup-aside\">",
    [
      "                </fieldset>",
      "                <fieldset>",
      "                  <legend>Aviso de turno</legend>",
      "                  <div className=\"segmented\" role=\"group\" aria-label=\"Aviso de turno\">",
      "                    <button",
      "                      type=\"button\"",
      "                      className={turnNoticeMode === \"normal\" ? \"active\" : \"\"}",
      "                      onClick={() => setTurnNoticeMode(\"normal\")}",
      "                    >",
      "                      ¡Te toca!",
      "                    </button>",
      "                    <button",
      "                      type=\"button\"",
      "                      className={turnNoticeMode === \"random\" ? \"active\" : \"\"}",
      "                      onClick={() => setTurnNoticeMode(\"random\")}",
      "                    >",
      "                      Mensajes random",
      "                    </button>",
      "                  </div>",
      "                  <p className=\"hint\">",
      "                    {turnNoticeMode === \"normal\"",
      "                      ? \"Siempre muestra «¡Te toca!».\"",
      "                      : \"Alterna aleatoriamente entre los mensajes especiales.\"}",
      "                  </p>",
      "                </fieldset>",
      "              </div>",
      "              <aside className=\"setup-aside\">",
    ].join("\n"),
    "selector de modalidad antes de crear la partida",
  );

  source = replaceRequired(
    source,
    "                  <p>\n                    <span>Formato</span>\n                    <b>{playStyle === \"online\" ? \"En línea\" : \"En vivo\"}</b>\n                  </p>\n                  <p>\n                    <span>Categorías</span>",
    "                  <p>\n                    <span>Formato</span>\n                    <b>{playStyle === \"online\" ? \"En línea\" : \"En vivo\"}</b>\n                  </p>\n                  <p>\n                    <span>Aviso de turno</span>\n                    <b>{turnNoticeMode === \"normal\" ? \"¡Te toca!\" : \"Random\"}</b>\n                  </p>\n                  <p>\n                    <span>Categorías</span>",
    "resumen de modalidad del aviso",
  );

  return source;
});

await patchFile("app/TurnNoticeWatcher.tsx", (source) =>
  replaceRequired(
    source,
    "      setNoticeText(turnMessages[Math.floor(Math.random() * turnMessages.length)]);",
    [
      "      const noticeMode =",
      "        document.querySelector<HTMLElement>(\".game-shell\")?.dataset.turnNoticeMode ??",
      "        \"normal\";",
      "      setNoticeText(",
      "        noticeMode === \"random\"",
      "          ? turnMessages[Math.floor(Math.random() * turnMessages.length)]",
      "          : \"¡Te toca!\",",
      "      );",
    ].join("\n"),
    "usar modalidad normal o aleatoria en el aviso",
  ),
);

console.log("Selectable turn notice mode applied.");
