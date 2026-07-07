// Sonido de interfaz: el click elegido por Fiamy (asset en /media/audio), decodificado
// UNA vez con WebAudio y disparado como buffer — latencia mínima y clicks superpuestos
// sin cortes. El AudioContext nace recién en el primer click (gesto del usuario).
const STORAGE_KEY = "tiny-quest:ui-sound";
const CLICK_SRC = "/media/audio/ui-click.wav";

let ctx: AudioContext | null = null;
let clickBuffer: AudioBuffer | null = null;
let loading: Promise<void> | null = null;

export function uiSoundEnabled(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== "off";
}

export function setUiSoundEnabled(on: boolean) {
  localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
}

async function ensureBuffer(context: AudioContext) {
  loading ??= fetch(CLICK_SRC)
    .then((res) => res.arrayBuffer())
    .then((data) => context.decodeAudioData(data))
    .then((buffer) => { clickBuffer = buffer; })
    .catch(() => { loading = null; });
  await loading;
}

export function playUiClick() {
  if (!uiSoundEnabled()) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    if (!clickBuffer) {
      // Primer click: decodifica y suena apenas está listo (los demás, instantáneos).
      void ensureBuffer(ctx).then(() => {
        if (!clickBuffer || !ctx) return;
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        gain.gain.value = 0.5;
        source.buffer = clickBuffer;
        source.connect(gain).connect(ctx.destination);
        source.start();
      });
      return;
    }
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    source.buffer = clickBuffer;
    source.connect(gain).connect(ctx.destination);
    source.start();
  } catch {
    // sin audio disponible: silencio, jamás romper la UI
  }
}

/** Listener global delegado: cualquier click en un botón habilitado suena. */
export function installUiClickSound(): () => void {
  const onClick = (event: MouseEvent) => {
    const button = (event.target as HTMLElement | null)?.closest?.("button");
    if (button && !button.disabled) playUiClick();
  };
  document.addEventListener("click", onClick, true);
  return () => document.removeEventListener("click", onClick, true);
}
