import { readFile, writeFile } from "node:fs/promises";

async function patchFile(path, transform) {
  const before = await readFile(path, "utf8");
  const after = transform(before);
  if (after !== before) await writeFile(path, after, "utf8");
}

function insertAfter(source, anchor, addition, label) {
  if (source.includes(addition.trim())) return source;
  if (!source.includes(anchor)) throw new Error(`No se encontró: ${label}`);
  return source.replace(anchor, anchor + addition);
}

await patchFile("lib/game.ts", (source) => {
  if (source.includes('turnNoticeMode?: "normal" | "random";')) return source;
  const categoryAnchor = "    categoryChangeCards?: number;\n";
  if (source.includes(categoryAnchor))
    return source.replace(
      categoryAnchor,
      categoryAnchor + '    turnNoticeMode?: "normal" | "random";\n',
    );
  return insertAfter(
    source,
    "    startDelaySeconds: number;\n",
    '    turnNoticeMode?: "normal" | "random";\n',
    "tipo de modalidad del aviso",
  );
});

await patchFile("app/api/rooms/route.ts", (source) => {
  if (source.includes('turnNoticeMode: body.turnNoticeMode === "random" ? "random" : "normal",'))
    return source;
  const difficulty = '          difficulty: "mixed",';
  if (!source.includes(difficulty))
    throw new Error("No se encontró settings.difficulty para guardar el aviso.");
  return source.replace(
    difficulty,
    '          turnNoticeMode: body.turnNoticeMode === "random" ? "random" : "normal",\n' + difficulty,
  );
});

await patchFile("app/page.tsx", (source) => {
  if (!source.includes('turnNoticeMode?: "normal" | "random";')) {
    const settingsStart = source.indexOf("  settings: {");
    const settingsEnd = settingsStart >= 0 ? source.indexOf("  };", settingsStart) : -1;
    if (settingsStart < 0 || settingsEnd < 0)
      throw new Error("No se encontró el tipo Room.settings.");
    const block = source.slice(settingsStart, settingsEnd);
    if (block.includes("    categoryChangeCards?: number;")) {
      source = source.replace(
        "    categoryChangeCards?: number;\n",
        '    categoryChangeCards?: number;\n    turnNoticeMode?: "normal" | "random";\n',
      );
    } else if (block.includes("    startDelaySeconds: number;")) {
      source = source.replace(
        "    startDelaySeconds: number;\n",
        '    startDelaySeconds: number;\n    turnNoticeMode?: "normal" | "random";\n',
      );
    } else {
      throw new Error("No se encontró el ancla para Room.settings.turnNoticeMode.");
    }
  }

  if (!source.includes("const [turnNoticeMode, setTurnNoticeMode]")) {
    const categoryState = "  const [categoryChangeCards, setCategoryChangeCards] = useState(10);\n";
    const delayState = "  const [startDelay, setStartDelay] = useState(5);\n";
    if (source.includes(categoryState)) {
      source = source.replace(
        categoryState,
        categoryState + '  const [turnNoticeMode, setTurnNoticeMode] = useState<"normal" | "random">("normal");\n',
      );
    } else if (source.includes(delayState)) {
      source = source.replace(
        delayState,
        delayState + '  const [turnNoticeMode, setTurnNoticeMode] = useState<"normal" | "random">("normal");\n',
      );
    } else {
      throw new Error("No se encontró el estado de preparación para añadir turnNoticeMode.");
    }
  }

  if (!source.includes("      turnNoticeMode,\n")) {
    const categoryPayload = "      categoryChangeCards,\n";
    const delayPayload = "      startDelaySeconds: startDelay,\n";
    if (source.includes(categoryPayload))
      source = source.replace(categoryPayload, categoryPayload + "      turnNoticeMode,\n");
    else if (source.includes(delayPayload))
      source = source.replace(delayPayload, delayPayload + "      turnNoticeMode,\n");
    else throw new Error("No se encontró el payload de creación para turnNoticeMode.");
  }

  if (!source.includes("data-turn-notice-mode=")) {
    const mainAnchor = '<main className="game-shell"';
    if (!source.includes(mainAnchor))
      throw new Error("No se encontró game-shell para exponer la modalidad.");
    source = source.replace(
      mainAnchor,
      '<main className="game-shell" data-turn-notice-mode={room.settings.turnNoticeMode ?? "normal"}',
    );
  }

  if (!source.includes('aria-label="Aviso de turno"')) {
    const asideAnchor = '              <aside className="setup-aside">';
    const asideIndex = source.lastIndexOf(asideAnchor);
    if (asideIndex < 0) throw new Error("No se encontró setup-aside para el selector de aviso.");
    const beforeAside = source.slice(0, asideIndex);
    const closeIndex = beforeAside.lastIndexOf("              </div>\n");
    if (closeIndex < 0) throw new Error("No se encontró el cierre de setup-main.");
    const selector = [
      "                <fieldset>",
      "                  <legend>Aviso de turno</legend>",
      '                  <div className="segmented" role="group" aria-label="Aviso de turno">',
      "                    <button",
      '                      type="button"',
      '                      className={turnNoticeMode === "normal" ? "active" : ""}',
      '                      onClick={() => setTurnNoticeMode("normal")}',
      "                    >",
      "                      ¡Te toca!",
      "                    </button>",
      "                    <button",
      '                      type="button"',
      '                      className={turnNoticeMode === "random" ? "active" : ""}',
      '                      onClick={() => setTurnNoticeMode("random")}',
      "                    >",
      "                      Mensajes random",
      "                    </button>",
      "                  </div>",
      '                  <p className="hint">',
      '                    {turnNoticeMode === "normal"',
      '                      ? "Siempre muestra «¡Te toca!»."',
      '                      : "Alterna aleatoriamente entre los mensajes especiales."}',
      "                  </p>",
      "                </fieldset>",
    ].join("\n") + "\n";
    source = source.slice(0, closeIndex) + selector + source.slice(closeIndex);
  }

  if (!source.includes("<span>Aviso de turno</span>")) {
    const categoriesSummary = "                  <p>\n                    <span>Categorías</span>";
    if (!source.includes(categoriesSummary))
      throw new Error("No se encontró el resumen de categorías para añadir el aviso.");
    const summary = [
      "                  <p>",
      "                    <span>Aviso de turno</span>",
      '                    <b>{turnNoticeMode === "normal" ? "¡Te toca!" : "Random"}</b>',
      "                  </p>",
      "",
    ].join("\n");
    source = source.replace(categoriesSummary, summary + categoriesSummary);
  }

  return source;
});

await patchFile("app/TurnNoticeWatcher.tsx", (source) => {
  if (source.includes("const noticeMode =")) return source;
  const randomLine = "      setNoticeText(turnMessages[Math.floor(Math.random() * turnMessages.length)]);";
  if (!source.includes(randomLine))
    throw new Error("No se encontró la selección random del aviso de turno.");
  return source.replace(
    randomLine,
    [
      "      const noticeMode =",
      '        document.querySelector<HTMLElement>(".game-shell")?.dataset.turnNoticeMode ??',
      '        "normal";',
      "      setNoticeText(",
      '        noticeMode === "random"',
      "          ? turnMessages[Math.floor(Math.random() * turnMessages.length)]",
      '          : "¡Te toca!",',
      "      );",
    ].join("\n"),
  );
});

console.log("Selectable turn notice mode applied.");
