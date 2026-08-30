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
  await writeFile(path, css, "utf8");
}
