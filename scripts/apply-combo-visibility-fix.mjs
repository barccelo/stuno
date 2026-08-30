import { readFile, writeFile } from "node:fs/promises";

const path = "app/ui-fixes.css";
let css = await readFile(path, "utf8");

if (!css.includes("/* COMBO visibility and spacing v3. */")) {
  css += `

/* COMBO visibility and spacing v3. */
.combo-picker-tap .combo-letter-choice strong {
  position: relative !important;
  z-index: 3 !important;
  display: block !important;
  margin: 0 !important;
  padding: 0 !important;
  color: #17324a !important;
  opacity: 1 !important;
  visibility: visible !important;
  font: 700 31px/1 Georgia, serif !important;
  text-align: center !important;
  text-transform: uppercase !important;
  -webkit-text-fill-color: #17324a !important;
}
.combo-picker-tap .combo-letter-choice {
  isolation: isolate !important;
}
.combo-word-row {
  margin-top: 6px !important;
  margin-bottom: 2px !important;
}
.combo-picker-tap .combo-count {
  margin: 6px 0 10px !important;
  min-height: 15px !important;
  text-align: center !important;
  font-size: 12px !important;
  line-height: 1.25 !important;
}
.combo-actions {
  margin-top: 0 !important;
}
@media (max-height: 720px) {
  .combo-picker-tap .combo-letter-choice strong {
    font-size: 27px !important;
  }
  .combo-word-row {
    margin-top: 4px !important;
  }
  .combo-picker-tap .combo-count {
    margin: 5px 0 7px !important;
  }
}
`;
}

if (!css.includes("/* COMBO visual restoration v4. */")) {
  css += `

/* COMBO visual restoration v4. */
.combo-picker-tap .combo-letter-choice {
  position: relative !important;
  min-height: 68px !important;
  padding: 8px 26px 8px 8px !important;
  overflow: hidden !important;
  border: 0 !important;
  border-radius: 12px !important;
  background: #2f5bd5 !important;
  box-shadow: inset 0 -2px 0 rgba(0, 0, 0, .10) !important;
  color: #fff !important;
}
.combo-picker-tap .combo-letter-choice strong {
  position: relative !important;
  z-index: 2 !important;
  color: #fff !important;
  -webkit-text-fill-color: #fff !important;
  font: 700 31px/1 Georgia, serif !important;
  text-shadow: 0 1px 0 rgba(0,0,0,.08) !important;
}
.combo-picker-tap .combo-letter-choice em {
  position: absolute !important;
  z-index: 4 !important;
  top: 6px !important;
  right: 6px !important;
  left: auto !important;
  bottom: auto !important;
  width: 28px !important;
  height: 28px !important;
  display: grid !important;
  place-items: center !important;
  margin: 0 !important;
  padding: 0 !important;
  border-radius: 999px !important;
  background: #f6bb2f !important;
  color: #18324b !important;
  -webkit-text-fill-color: #18324b !important;
  font: 900 12px/1 Arial, sans-serif !important;
  font-style: normal !important;
  box-shadow: 0 1px 2px rgba(0,0,0,.14) !important;
  pointer-events: none !important;
}
.combo-picker-tap .combo-letter-choice.selected {
  border: 0 !important;
  background: #244bb9 !important;
  box-shadow: 0 0 0 3px #19b7ca, inset 0 -2px 0 rgba(0, 0, 0, .12) !important;
  transform: translateY(-1px) !important;
}
.combo-picker-tap .combo-letter-choice:disabled {
  opacity: .42 !important;
}
.combo-picker-tap .combo-order-badge {
  z-index: 5 !important;
  left: 5px !important;
  top: 5px !important;
  background: #fff !important;
  color: #078aa0 !important;
}
@media (max-height: 720px) {
  .combo-picker-tap .combo-letter-choice {
    min-height: 58px !important;
    padding-right: 24px !important;
  }
  .combo-picker-tap .combo-letter-choice strong {
    font-size: 27px !important;
  }
  .combo-picker-tap .combo-letter-choice em {
    width: 25px !important;
    height: 25px !important;
    top: 5px !important;
    right: 5px !important;
    font-size: 11px !important;
  }
}
`;
}

if (!css.includes("/* COMBO badge placement v5. */")) {
  css += `

/* COMBO badge placement v5. */
.combo-picker-tap .combo-letter-choice {
  padding: 0 !important;
  overflow: hidden !important;
}
.combo-picker-tap .combo-letter-choice strong {
  position: absolute !important;
  inset: 0 !important;
  z-index: 2 !important;
  display: grid !important;
  place-items: center !important;
  width: 100% !important;
  height: 100% !important;
  margin: 0 !important;
  padding: 0 !important;
  text-align: center !important;
  line-height: 1 !important;
  pointer-events: none !important;
}
.combo-picker-tap .combo-letter-choice em {
  position: absolute !important;
  top: 5px !important;
  right: 5px !important;
  left: auto !important;
  bottom: auto !important;
  z-index: 6 !important;
  width: 24px !important;
  height: 24px !important;
  display: grid !important;
  place-items: center !important;
  margin: 0 !important;
  padding: 0 !important;
  border-radius: 999px !important;
  font: 900 11px/1 Arial, sans-serif !important;
  transform: none !important;
  pointer-events: none !important;
}
.combo-picker-tap .combo-order-badge {
  top: 5px !important;
  left: 5px !important;
  right: auto !important;
  z-index: 7 !important;
}
@media (max-height: 720px) {
  .combo-picker-tap .combo-letter-choice strong {
    font-size: 27px !important;
  }
  .combo-picker-tap .combo-letter-choice em {
    top: 4px !important;
    right: 4px !important;
    width: 22px !important;
    height: 22px !important;
    font-size: 10px !important;
  }
}
`;
}

await writeFile(path, css, "utf8");
