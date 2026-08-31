import { readFile, writeFile } from "node:fs/promises";

const marker = "TUTORIAL turn-steal v1";

// The polished tutorial currently has 14 steps (0..13). Add Robar turno as
// step 11, between the ROBO power card and Respuesta/Contiene.
let route = await readFile("app/api/rooms/route.ts", "utf8");
if (!route.includes(`// ${marker}`)) {
  const pattern = /(state\.tutorial\.step\s*=\s*Math\.max\(0,\s*Math\.min\()13(,\s*Number\(body\.step\)\s*\|\|\s*0\)\);)/m;
  if (!pattern.test(route))
    throw new Error("No se encontró el límite de pasos del tutorial para añadir Robar turno.");
  route = route.replace(pattern, `$114$2\n      // ${marker}`);
  await writeFile("app/api/rooms/route.ts", route, "utf8");
}

let page = await readFile("app/page.tsx", "utf8");
const start = page.indexOf("  function tutorialOverlay() {");
const end = page.indexOf("  function exitDialog() {", start);
if (start < 0 || end < 0)
  throw new Error("No se encontró tutorialOverlay para añadir Robar turno.");

let tutorial = page.slice(start, end);
if (!tutorial.includes(marker)) {
  // Tutorial now has 15 steps (0..14).
  tutorial = tutorial.replace(
    /Math\.min\(13, shared \? \(room\.tutorial\?\.step \?\? 0\) : \(localTutorialStep \?\? 0\)\)/,
    "Math.min(14, shared ? (room.tutorial?.step ?? 0) : (localTutorialStep ?? 0))",
  );

  if (!tutorial.includes("Math.min(14, shared"))
    throw new Error("No se pudo ampliar tutorialOverlay a 15 pasos.");

  // Renumber the existing steps that follow ROBO. Work backwards to avoid
  // creating replacement collisions.
  const renames = [
    ['eyebrow: "14 · VAR CHECK"', 'eyebrow: "15 · VAR CHECK"'],
    ['eyebrow: "13 · VOTACIÓN"', 'eyebrow: "14 · VOTACIÓN"'],
    ['eyebrow: "12 · PASAR O DESCARTAR"', 'eyebrow: "13 · PASAR O DESCARTAR"'],
    ['eyebrow: "11 · RESPUESTA Y CONTIENE"', 'eyebrow: "12 · RESPUESTA Y CONTIENE"'],
  ];
  for (const [from, to] of renames) {
    if (!tutorial.includes(from))
      throw new Error(`No se encontró el paso del tutorial: ${from}`);
    tutorial = tutorial.replace(from, to);
  }

  const stepAnchor = `      {\n        eyebrow: "12 · RESPUESTA Y CONTIENE",`;
  if (!tutorial.includes(stepAnchor))
    throw new Error("No se encontró el punto para insertar Robar turno en la lista de pasos.");

  const turnStealStep = `      {\n        // ${marker}\n        eyebrow: "11 · ROBAR TURNO",\n        title: "Adelántate con una carta idéntica",\n        text: "Si no es tu turno y tienes una carta idéntica a la última carta jugada, puedes seleccionarla y preparar tu respuesta. El robo sólo se confirma cuando pulsas «Enviar», no al seleccionar la carta. También puede hacerse con una carta especial idéntica. La persona a la que le robaste el turno no vota esa respuesta.",\n      },\n`;
  tutorial = tutorial.replace(stepAnchor, turnStealStep + stepAnchor);

  // Shift all visual demos after ROBO one position forward.
  for (const index of [13, 12, 11, 10]) {
    const from = `{stepIndex === ${index} && (`;
    const to = `{stepIndex === ${index + 1} && (`;
    if (!tutorial.includes(from))
      throw new Error(`No se encontró la demo del paso ${index + 1} para desplazarla.`);
    tutorial = tutorial.replace(from, to);
  }

  const demoAnchor = `            {stepIndex === 11 && (\n              <div className="tutorial-contains-demo tutorial-contains-demo-v2">`;
  if (!tutorial.includes(demoAnchor))
    throw new Error("No se encontró la demo de Contiene para insertar Robar turno antes.");

  const turnStealDemo = `            {stepIndex === 10 && (\n              <div className="tutorial-turn-steal-demo">\n                <div className="tutorial-turn-steal-stage">\n                  <div className="tutorial-turn-steal-top">\n                    <small>ÚLTIMA CARTA JUGADA</small>\n                    <div className="tutorial-real-card letter tutorial-turn-steal-card"><strong>S</strong></div>\n                  </div>\n                  <div className="tutorial-turn-steal-arrow">→</div>\n                  <div className="tutorial-turn-steal-mine">\n                    <small>TIENES LA MISMA CARTA</small>\n                    <div className="tutorial-real-card letter tutorial-turn-steal-card"><strong>S</strong></div>\n                  </div>\n                </div>\n                <div className="tutorial-turn-steal-answer">\n                  <span>S</span>\n                  <div>Sirena</div>\n                  <b>Enviar</b>\n                </div>\n                <small className="tutorial-turn-steal-note">Seleccionar prepara la jugada · Enviar confirma el robo</small>\n              </div>\n            )}\n`;
  tutorial = tutorial.replace(demoAnchor, turnStealDemo + demoAnchor);

  page = page.slice(0, start) + tutorial + page.slice(end);
  await writeFile("app/page.tsx", page, "utf8");
}

let css = await readFile("app/ui-fixes.css", "utf8");
const cssMarker = "/* Tutorial turn-steal v1. */";
if (!css.includes(cssMarker)) {
  css += `\n\n${cssMarker}\n.tutorial-turn-steal-demo {\n  width: 100%;\n  display: grid;\n  justify-items: center;\n  gap: 12px;\n}\n.tutorial-turn-steal-stage {\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);\n  align-items: center;\n  gap: 12px;\n  width: min(330px, 100%);\n}\n.tutorial-turn-steal-top,\n.tutorial-turn-steal-mine {\n  display: grid;\n  justify-items: center;\n  gap: 6px;\n  min-width: 0;\n}\n.tutorial-turn-steal-top > small,\n.tutorial-turn-steal-mine > small {\n  font-size: 8px;\n  line-height: 1.2;\n  font-weight: 900;\n  letter-spacing: .08em;\n  text-align: center;\n  color: #7d8799;\n}\n.tutorial-turn-steal-card {\n  position: relative !important;\n  inset: auto !important;\n  transform: none !important;\n  width: 58px !important;\n  height: 76px !important;\n  min-width: 58px !important;\n  padding: 7px !important;\n}\n.tutorial-turn-steal-card > strong {\n  display: grid !important;\n  place-items: center !important;\n  width: 100%;\n  height: 100%;\n  margin: 0 !important;\n  font-size: 34px !important;\n}\n.tutorial-turn-steal-arrow {\n  font-size: 24px;\n  font-weight: 900;\n  color: var(--gold, #f4bd3b);\n}\n.tutorial-turn-steal-answer {\n  width: min(330px, 100%);\n  display: grid;\n  grid-template-columns: 42px minmax(0, 1fr) auto;\n  align-items: center;\n  gap: 8px;\n  padding: 6px;\n  border-radius: 10px;\n  background: #fff;\n  color: var(--ink, #14213d);\n  box-shadow: 0 8px 18px rgba(20,33,61,.12);\n}\n.tutorial-turn-steal-answer > span {\n  height: 38px;\n  display: grid;\n  place-items: center;\n  border-radius: 7px;\n  background: var(--blue, #2455d6);\n  color: #fff;\n  font: 700 22px Georgia, serif;\n}\n.tutorial-turn-steal-answer > div {\n  min-width: 0;\n  font-size: 14px;\n  text-align: left;\n}\n.tutorial-turn-steal-answer > b {\n  padding: 10px 11px;\n  border-radius: 7px;\n  background: var(--ink, #14213d);\n  color: #fff;\n  font-size: 10px;\n}\n.tutorial-turn-steal-note {\n  font-size: 9px;\n  line-height: 1.3;\n  font-weight: 800;\n  text-align: center;\n  color: #6f7a8f;\n}\n@media (max-width: 520px) {\n  .tutorial-turn-steal-stage { gap: 8px; }\n  .tutorial-turn-steal-card {\n    width: 52px !important;\n    min-width: 52px !important;\n    height: 68px !important;\n  }\n  .tutorial-turn-steal-answer {\n    grid-template-columns: 38px minmax(0, 1fr) auto;\n  }\n}\n`;
  await writeFile("app/ui-fixes.css", css, "utf8");
}

const routeCheck = await readFile("app/api/rooms/route.ts", "utf8");
const pageCheck = await readFile("app/page.tsx", "utf8");
const required = [
  [routeCheck, "Math.min(14, Number(body.step) || 0)"],
  [pageCheck, 'eyebrow: "11 · ROBAR TURNO"'],
  [pageCheck, "El robo sólo se confirma cuando pulsas «Enviar»"],
  [pageCheck, "tutorial-turn-steal-demo"],
  [pageCheck, 'eyebrow: "15 · VAR CHECK"'],
];
const missing = required
  .filter(([source, token]) => !source.includes(token))
  .map(([, token]) => token);
if (missing.length)
  throw new Error(`Tutorial de Robar turno incompleto: ${missing.join(", ")}`);

console.log("Tutorial ampliado con Robar turno, confirmación al enviar y exclusión de voto.");
