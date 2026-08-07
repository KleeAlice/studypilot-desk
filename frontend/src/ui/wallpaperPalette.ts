export type WallpaperPalette = {
  accent: string;
  accentHover: string;
  accentSoft: string;
  focusRing: string;
  selectionSurface: string;
  onAccent: "#ffffff" | "#17202a";
  glassTint: string;
};

function channelToLinear(value: number) {
  const channel = value / 255;
  return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
}

export function relativeLuminance(red: number, green: number, blue: number) {
  return .2126 * channelToLinear(red) + .7152 * channelToLinear(green) + .0722 * channelToLinear(blue);
}

function toHex(value: number) {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
}

function completeWallpaperPalette(palette: WallpaperPalette): WallpaperPalette {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(palette.accent);
  if (!match) return {
    ...palette,
    accentHover: palette.accentHover || palette.accent,
    focusRing: palette.focusRing || palette.accent,
    selectionSurface: palette.selectionSurface || palette.accentSoft,
  };
  const red = Number.parseInt(match[1], 16);
  const green = Number.parseInt(match[2], 16);
  const blue = Number.parseInt(match[3], 16);
  const channels = `${red}, ${green}, ${blue}`;
  return {
    ...palette,
    accentHover: palette.accentHover || `#${toHex(red * .84)}${toHex(green * .84)}${toHex(blue * .84)}`,
    focusRing: palette.focusRing || `rgba(${channels}, .46)`,
    selectionSurface: palette.selectionSurface || `rgba(${channels}, .24)`,
  };
}

export function deriveWallpaperPalette(pixels: Uint8ClampedArray): WallpaperPalette {
  let red = 0;
  let green = 0;
  let blue = 0;
  let weightTotal = 0;

  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3] / 255;
    if (alpha < .2) continue;
    const sampleRed = pixels[index];
    const sampleGreen = pixels[index + 1];
    const sampleBlue = pixels[index + 2];
    const saturation = Math.max(sampleRed, sampleGreen, sampleBlue) - Math.min(sampleRed, sampleGreen, sampleBlue);
    const weight = alpha * (.35 + saturation / 255);
    red += sampleRed * weight;
    green += sampleGreen * weight;
    blue += sampleBlue * weight;
    weightTotal += weight;
  }

  if (!weightTotal) {
    return {
      accent: "#6677e8",
      accentHover: "#5365d4",
      accentSoft: "rgba(102, 119, 232, .18)",
      focusRing: "rgba(102, 119, 232, .46)",
      selectionSurface: "rgba(102, 119, 232, .24)",
      onAccent: "#ffffff",
      glassTint: "rgba(102, 119, 232, .12)",
    };
  }

  const average = [red, green, blue].map((value) => value / weightTotal);
  const max = Math.max(...average);
  const min = Math.min(...average);
  const saturation = max - min;
  const lift = saturation < 48 ? 1.18 : 1;
  const [accentRed, accentGreen, accentBlue] = average.map((value) => Math.min(230, Math.max(36, value * lift)));
  const accent = `#${toHex(accentRed)}${toHex(accentGreen)}${toHex(accentBlue)}`;
  const channels = `${Math.round(accentRed)}, ${Math.round(accentGreen)}, ${Math.round(accentBlue)}`;

  return {
    accent,
    accentHover: `#${toHex(accentRed * .84)}${toHex(accentGreen * .84)}${toHex(accentBlue * .84)}`,
    accentSoft: `rgba(${channels}, .18)`,
    focusRing: `rgba(${channels}, .46)`,
    selectionSurface: `rgba(${channels}, .24)`,
    onAccent: relativeLuminance(accentRed, accentGreen, accentBlue) > .48 ? "#17202a" : "#ffffff",
    glassTint: `rgba(${channels}, .12)`,
  };
}

export async function extractWallpaperPalette(file: File): Promise<WallpaperPalette> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("无法读取壁纸颜色"));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 48;
    canvas.height = 48;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("当前环境不支持壁纸取色");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return deriveWallpaperPalette(context.getImageData(0, 0, canvas.width, canvas.height).data);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function applyWallpaperPalette(palette: WallpaperPalette | null | undefined, enabled: boolean) {
  const root = document.documentElement;
  const properties = ["--blue", "--accent-hover", "--blue-soft", "--focus-ring", "--selection-surface", "--on-blue", "--wallpaper-glass-tint"];
  if (!enabled || !palette?.accent) {
    properties.forEach((property) => root.style.removeProperty(property));
    delete root.dataset.wallpaperAdaptive;
    return;
  }
  const resolved = completeWallpaperPalette(palette);
  root.style.setProperty("--blue", resolved.accent);
  root.style.setProperty("--accent-hover", resolved.accentHover);
  root.style.setProperty("--blue-soft", resolved.accentSoft);
  root.style.setProperty("--focus-ring", resolved.focusRing);
  root.style.setProperty("--selection-surface", resolved.selectionSurface);
  root.style.setProperty("--on-blue", resolved.onAccent);
  root.style.setProperty("--wallpaper-glass-tint", resolved.glassTint);
  root.dataset.wallpaperAdaptive = "true";
}
