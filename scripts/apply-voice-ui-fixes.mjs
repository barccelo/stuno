import { readFile, writeFile } from "node:fs/promises";

async function patchFile(path, replacements) {
  let source = await readFile(path, "utf8");
  let changed = false;
  for (const { from, to, label } of replacements) {
    if (source.includes(to)) continue;
    if (!source.includes(from))
      throw new Error(`No se encontró el bloque esperado para: ${label}`);
    source = source.replace(from, to);
    changed = true;
  }
  if (changed) await writeFile(path, source, "utf8");
}

await patchFile("app/VoiceChat.tsx", [
  {
    label: "guardar referencia del control de voz",
    from: '  const joinedAt = useRef(0);\n  const activeRef = useRef(false);',
    to: '  const joinedAt = useRef(0);\n  const activeRef = useRef(false);\n  const rootRef = useRef<HTMLDivElement | null>(null);',
  },
  {
    label: "cerrar panel de voz al tocar fuera",
    from: '  useEffect(() => () => leaveVoice(false), []);\n\n  function toggleMute() {',
    to: '  useEffect(() => () => leaveVoice(false), []);\n\n  useEffect(() => {\n    if (!panelOpen) return;\n    const dismissOutside = (event: PointerEvent) => {\n      const target = event.target;\n      if (target instanceof Node && !rootRef.current?.contains(target)) {\n        setPanelOpen(false);\n      }\n    };\n    document.addEventListener("pointerdown", dismissOutside, true);\n    return () => document.removeEventListener("pointerdown", dismissOutside, true);\n  }, [panelOpen]);\n\n  function toggleMute() {',
  },
  {
    label: "conectar referencia raíz de voz",
    from: '    <div className={`voice-chat ${active ? "active" : ""}`}>',
    to: '    <div ref={rootRef} className={`voice-chat ${active ? "active" : ""}`}>',
  },
  {
    label: "dejar sólo icono antes de conectar",
    from: '          disabled={joining}\n          title="Entrar al chat de voz"\n        >\n          <span aria-hidden="true">🎙</span>\n          {joining ? "Conectando…" : "Voz"}\n        </button>',
    to: '          disabled={joining}\n          aria-label={joining ? "Conectando al chat de voz" : "Entrar al chat de voz"}\n          title={joining ? "Conectando…" : "Entrar al chat de voz"}\n        >\n          <span aria-hidden="true">🎙</span>\n        </button>',
  },
]);
