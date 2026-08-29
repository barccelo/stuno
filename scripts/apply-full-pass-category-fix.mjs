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
  if (source.includes("  consecutivePasses?: number;\n")) return source;
  return replaceRequired(
    source,
    "  turnsInRound?: number;\n",
    "  turnsInRound?: number;\n  consecutivePasses?: number;\n",
    "tipar contador de pases consecutivos",
  );
});

await patchFile("app/api/rooms/route.ts", (source) => {
  if (!source.includes("        consecutivePasses: 0,\n")) {
    source = replaceRequired(
      source,
      "        turnsInRound: 0,\n        pileSettledAt: null,\n",
      "        turnsInRound: 0,\n        consecutivePasses: 0,\n        pileSettledAt: null,\n",
      "inicializar contador de pases",
    );
  }

  if (!source.includes("      state.consecutivePasses = 0;\n      const startedAt = Date.now();")) {
    source = replaceRequired(
      source,
      "      state.status = \"playing\";\n      const startedAt = Date.now();\n",
      "      state.status = \"playing\";\n      state.consecutivePasses = 0;\n      const startedAt = Date.now();\n",
      "reiniciar pases al comenzar",
    );
  }

  if (!source.includes("      state.consecutivePasses = 0;\n      state.lastPlay = {")) {
    source = replaceRequired(
      source,
      "        return Response.json({ error: \"No es tu turno\" }, { status: 409 });\n      state.lastPlay = {\n",
      "        return Response.json({ error: \"No es tu turno\" }, { status: 409 });\n      state.consecutivePasses = 0;\n      state.lastPlay = {\n",
      "reiniciar pases al jugar",
    );
  }

  if (!source.includes("      state.consecutivePasses = 0;\n      drawWithEvent(state, actor!, 2);")) {
    source = replaceRequired(
      source,
      "      recordCenterPlay(state, actor!, card);\n      drawWithEvent(state, actor!, 2);\n",
      "      recordCenterPlay(state, actor!, card);\n      state.consecutivePasses = 0;\n      drawWithEvent(state, actor!, 2);\n",
      "reiniciar pases al desechar",
    );
  }

  if (!source.includes("      state.consecutivePasses = 0;\n      state.players.splice(leavingIndex, 1);")) {
    source = replaceRequired(
      source,
      "      state.players.splice(leavingIndex, 1);\n",
      "      state.consecutivePasses = 0;\n      state.players.splice(leavingIndex, 1);\n",
      "reiniciar pases si sale un jugador",
    );
  }

  if (!source.includes("state.consecutivePasses = (state.consecutivePasses ?? 0) + 1;")) {
    const oldPassTail = [
      "      nextIndex(state);",
      "      state.message = `${passingName} pasó y robó una carta. Turno de ${state.players[state.turnIndex]?.name}.`;",
    ].join("\n");
    const newPassTail = [
      "      state.consecutivePasses = (state.consecutivePasses ?? 0) + 1;",
      "      nextIndex(state);",
      "      if (state.consecutivePasses >= state.players.length) {",
      "        state.consecutivePasses = 0;",
      "        chooseCategory(state);",
      "        state.categoryChooserId = null;",
      "        const chooser = state.players[state.turnIndex];",
      "        state.message = `${passingName} pasó y robó una carta. Todos pasaron: ${chooser?.name ?? \"el siguiente jugador\"} elige una nueva categoría.`;",
      "      } else {",
      "        state.message = `${passingName} pasó y robó una carta. Turno de ${state.players[state.turnIndex]?.name}.`;",
      "      }",
    ].join("\n");
    const passStart = source.indexOf('    } else if (action === "passAndDraw") {');
    const timeoutStart = source.indexOf('    } else if (action === "timeout") {', passStart);
    if (passStart < 0 || timeoutStart < 0) {
      throw new Error("No se pudo localizar passAndDraw.");
    }
    const block = source.slice(passStart, timeoutStart);
    if (!block.includes(oldPassTail)) {
      throw new Error("No se encontró el cierre esperado de passAndDraw.");
    }
    source = source.slice(0, passStart) + block.replace(oldPassTail, newPassTail) + source.slice(timeoutStart);
  }

  if (!source.includes("        state.consecutivePasses = 0;\n        const current = state.players[state.turnIndex];")) {
    source = replaceRequired(
      source,
      "      if (state.settings.mode === \"classic\" && !state.pendingVote) {\n        const current = state.players[state.turnIndex];\n",
      "      if (state.settings.mode === \"classic\" && !state.pendingVote) {\n        state.consecutivePasses = 0;\n        const current = state.players[state.turnIndex];\n",
      "reiniciar pases al agotarse el tiempo",
    );
  }

  return source;
});

console.log("Full pass category change applied.");
