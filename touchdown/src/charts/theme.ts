/** Colours and small helpers shared by all charts. Same palette as style.css. */
export const COLORS = {
  ink: "#eef1f6",
  muted: "#8b93a6",
  faint: "#5d6477",
  line: "rgba(255,255,255,0.09)",
  lineStrong: "rgba(255,255,255,0.18)",
  panel: "#0b0f17",
  sun: "#ffba60",
  earth: "#9dbcff",
  both: "#7be0b5",
  bad: "#ff8f7a",
} as const;

export type Ramp = "sun" | "earth" | "both";

const RAMP_END: Record<Ramp, [number, number, number]> = {
  sun: [255, 186, 96],
  earth: [157, 188, 255],
  both: [123, 224, 181],
};
const RAMP_START: [number, number, number] = [22, 27, 40];

/** Colour for a value between 0 (dark slate) and 1 (full accent). */
export function ramp(kind: Ramp, t: number): string {
  const x = Math.min(1, Math.max(0, t));
  const e = Math.pow(x, 0.8);
  const [r, g, b] = RAMP_START.map((s, i) => Math.round(s + (RAMP_END[kind][i] - s) * e));
  return `rgb(${r},${g},${b})`;
}

/** Canvas sized for the device pixel ratio. Returns the 2D context scaled to CSS pixels. */
export function fitCanvas(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; width: number; height: number } {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, width, height };
}

export const FONT_SANS = '"Space Grotesk Variable", "Space Grotesk", system-ui, sans-serif';
export const FONT_MONO = '"JetBrains Mono Variable", "JetBrains Mono", ui-monospace, monospace';
