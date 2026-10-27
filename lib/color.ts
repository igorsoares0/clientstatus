// Brand colour handling (design "Brand rules"): cover text switches between
// white and dark for ≥ 4.5:1, and brand-coloured text on white is darkened
// until it passes AA. Semantic colours (warning, error) never use the brand.

export const DEFAULT_BRAND = "#23395B";
const INK = "#161A1C";

export function isHexColor(v: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());
}

export function normalizeHex(v: string): string {
  let h = v.trim().replace("#", "").toLowerCase();
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  return `#${h}`;
}

function rgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex).slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function toHex([r, g, b]: number[]) {
  return `#${[r, g, b]
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Text colour for content on a brand-coloured background. */
export function coverTextColor(brand: string): string {
  return contrast("#ffffff", brand) >= contrast(INK, brand) ? "#ffffff" : INK;
}

/** Brand colour darkened (if needed) so it reads as text on white at ≥ 4.5:1. */
export function brandTextOnWhite(brand: string): string {
  let c = rgb(brand);
  for (let i = 0; i < 40 && contrast(toHex(c), "#ffffff") < 4.5; i++) c = c.map((v) => v * 0.92) as typeof c;
  return toHex(c);
}

export function brandSummary(brand: string) {
  const text = coverTextColor(brand);
  return {
    cover: normalizeHex(brand),
    coverText: text,
    ratio: Math.round(contrast(text, brand) * 10) / 10,
    onWhite: brandTextOnWhite(brand),
  };
}
