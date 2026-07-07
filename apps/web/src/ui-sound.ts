// Sonido de interfaz sintetizado con WebAudio: un "toc" corto y cálido (madera/
// pergamino) al hacer click. Sin assets ni red; el AudioContext nace recién en el
// primer click (gesto del usuario, así el navegador no lo bloquea).
const STORAGE_KEY = "tiny-quest:ui-sound";

let ctx: AudioContext | null = null;

export function uiSoundEnabled(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== "off";
}

export function setUiSoundEnabled(on: boolean) {
  localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
}

export function playUiClick() {
  if (!uiSoundEnabled()) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    // Tono principal: golpecito grave que cae rápido (madera).
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.07);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
    // Chispa aguda muy corta encima: el "destello" del click.
    const spark = ctx.createOscillator();
    const sparkGain = ctx.createGain();
    spark.type = "sine";
    spark.frequency.setValueAtTime(1250, now);
    sparkGain.gain.setValueAtTime(0.035, now);
    sparkGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
    spark.connect(sparkGain).connect(ctx.destination);
    spark.start(now);
    spark.stop(now + 0.05);
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
