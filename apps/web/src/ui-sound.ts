// Sonido de interfaz con DOS voces (assets en /media/audio, decodificados una vez
// con WebAudio y disparados como buffer — latencia mínima, clicks superpuestos):
// - "menu": botones del menú principal (header, ayuda, ajustes).
// - "soft": mundos, cards y todo botón fuera del menú — ui-click-soft.wav, que
//   Fiamy puede pisar con otro audio sin tocar código; mientras sea el mismo
//   archivo, se distingue con un tono apenas más grave (playbackRate).
const STORAGE_KEY = "tiny-quest:ui-sound";
type ClickKind = "menu" | "soft" | "action";
const SOURCES: Record<ClickKind, { src: string; gain: number; rate: number }> = {
  menu: { src: "/media/audio/ui-click.wav", gain: 0.5, rate: 1 },
  soft: { src: "/media/audio/ui-click-soft.wav", gain: 0.42, rate: 0.86 },
  // Acciones grandes: elegir mundo, crear/forjar héroe, forjar historia.
  action: { src: "/media/audio/ui-action.mp3", gain: 0.55, rate: 1 }
};

let ctx: AudioContext | null = null;
const buffers: Partial<Record<ClickKind, AudioBuffer>> = {};
const loading: Partial<Record<ClickKind, Promise<void>>> = {};

export function uiSoundEnabled(): boolean {
  // Silencio por defecto (pedido de Fiamy 2026-07-10): los clicks suenan solo
  // si el jugador los prende en Ajustes. La música de ambiente ya era opt-in.
  return localStorage.getItem(STORAGE_KEY) === "on";
}

export function setUiSoundEnabled(on: boolean) {
  localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
}

async function ensureBuffer(context: AudioContext, kind: ClickKind) {
  loading[kind] ??= fetch(SOURCES[kind].src)
    .then((res) => res.arrayBuffer())
    .then((data) => context.decodeAudioData(data))
    .then((buffer) => { buffers[kind] = buffer; })
    .catch(() => { loading[kind] = undefined; });
  await loading[kind];
}

function fire(context: AudioContext, kind: ClickKind) {
  const buffer = buffers[kind];
  if (!buffer) return;
  const source = context.createBufferSource();
  const gain = context.createGain();
  gain.gain.value = SOURCES[kind].gain;
  source.buffer = buffer;
  source.playbackRate.value = SOURCES[kind].rate;
  source.connect(gain).connect(context.destination);
  source.start();
}

export function playUiClick(kind: ClickKind = "soft") {
  if (!uiSoundEnabled()) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    if (!buffers[kind]) {
      // Primer click de esta voz: decodifica y suena apenas está listo.
      void ensureBuffer(ctx, kind).then(() => { if (ctx) fire(ctx, kind); });
      return;
    }
    fire(ctx, kind);
  } catch {
    // sin audio disponible: silencio, jamás romper la UI
  }
}

// ── Sonido de AMBIENTE del lobby: el track de siempre (song-of-the-north), en
// loop, con play/pausa desde los popups de ayuda y ajustes. Vive a nivel módulo
// para sobrevivir a que el popover se cierre; al entrar a la partida se corta
// (el juego tiene su propio reproductor por escena con este mismo track).
const AMBIENT_SRC = "/assets/audio/song-of-the-north.mp3";
let ambient: HTMLAudioElement | null = null;

export function ambientPlaying(): boolean {
  return ambient !== null && !ambient.paused;
}

export function toggleAmbient(): boolean {
  if (!ambient) {
    ambient = new Audio(AMBIENT_SRC);
    ambient.preload = "none";
    ambient.loop = true;
  }
  ambient.volume = Number(localStorage.getItem("tiny-quest-volume") ?? "0.35");
  if (ambient.paused) {
    void ambient.play().catch(() => undefined);
    return true;
  }
  ambient.pause();
  return false;
}

export function stopAmbient() {
  ambient?.pause();
}

/** Botones del menú principal: header (crear sala / unirse), ayuda y ajustes. */
const MENU_SCOPE = ".lobbyHeaderActions, .helpButton, .settingsButton, .settingsPop, .helpPanel";
/** Acciones grandes: elegir mundo, crear/editar/guardar héroe, forjar historia y empezar. */
const ACTION_SCOPE = ".worldCard, .forgeButton, .startCta, .heroSummaryActions, .heroDone, .reimagineButton";

/** Listener global delegado: SOLO suenan las interacciones importantes —acciones
 * grandes (elegir mundo, forjar, empezar) y el menú principal—. El resto de los
 * botones (chips de elenco, cerrar, flechas, tabs, opciones) quedan en silencio:
 * "no todo necesita ruido" (pedido de Fiamy 2026-07-11). */
export function installUiClickSound(): () => void {
  const onClick = (event: MouseEvent) => {
    const button = (event.target as HTMLElement | null)?.closest?.("button");
    if (!button || button.disabled) return;
    const kind: ClickKind | null = button.closest(ACTION_SCOPE) ? "action" : button.closest(MENU_SCOPE) ? "menu" : null;
    if (!kind) return; // botón secundario: sin sonido
    playUiClick(kind);
  };
  document.addEventListener("click", onClick, true);
  return () => document.removeEventListener("click", onClick, true);
}
