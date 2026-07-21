import { createElement, type ReactNode } from "react";
import sharp from "sharp";
import satori, { type Font } from "satori";
import { LoadSatoriFonts } from "./SatoriFonts.js";

export type { Font };

export type RgbColor = {
  R: number;
  G: number;
  B: number;
};

export type ImageResizeOptions = {
  Width: number;
  Height: number;
};

export function HexToRgb(HexValue: string, Fallback = "#3b82f6"): RgbColor {
  const SafeHex = /^#[0-9a-f]{6}$/iu.test(HexValue) ? HexValue : Fallback;
  return {
    R: Number.parseInt(SafeHex.slice(1, 3), 16),
    G: Number.parseInt(SafeHex.slice(3, 5), 16),
    B: Number.parseInt(SafeHex.slice(5, 7), 16)
  };
}

export function RgbToHex(Color: RgbColor): string {
  return `#${[Color.R, Color.G, Color.B].map((Part) => Math.max(0, Math.min(255, Math.round(Part))).toString(16).padStart(2, "0")).join("")}`;
}

export function RgbToCss(Color: RgbColor): string {
  return `rgb(${Math.round(Color.R)}, ${Math.round(Color.G)}, ${Math.round(Color.B)})`;
}

export function Rgba(Color: RgbColor, Alpha: number): string {
  return `rgba(${Math.round(Color.R)}, ${Math.round(Color.G)}, ${Math.round(Color.B)}, ${Alpha})`;
}

export function MixRgb(FirstColor: RgbColor, SecondColor: RgbColor, SecondWeight: number): RgbColor {
  const FirstWeight = 1 - SecondWeight;
  return {
    R: FirstColor.R * FirstWeight + SecondColor.R * SecondWeight,
    G: FirstColor.G * FirstWeight + SecondColor.G * SecondWeight,
    B: FirstColor.B * FirstWeight + SecondColor.B * SecondWeight
  };
}

export function BoostColor(Color: RgbColor): RgbColor {
  const Average = (Color.R + Color.G + Color.B) / 3;
  return {
    R: Math.max(40, Math.min(238, Average + (Color.R - Average) * 1.35)),
    G: Math.max(40, Math.min(238, Average + (Color.G - Average) * 1.35)),
    B: Math.max(40, Math.min(238, Average + (Color.B - Average) * 1.35))
  };
}

export function SvgToDataUri(Svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(Svg).toString("base64")}`;
}

export function EscapeSvgText(Value: string): string {
  return Value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

export function PolarToCartesian(CenterX: number, CenterY: number, Radius: number, AngleInDegrees: number): { X: number; Y: number } {
  const AngleInRadians = (AngleInDegrees - 90) * Math.PI / 180;
  return {
    X: CenterX + Radius * Math.cos(AngleInRadians),
    Y: CenterY + Radius * Math.sin(AngleInRadians)
  };
}

export function DescribeArcPath(CenterX: number, CenterY: number, Radius: number, StartAngle: number, EndAngle: number): string {
  const Start = PolarToCartesian(CenterX, CenterY, Radius, EndAngle);
  const End = PolarToCartesian(CenterX, CenterY, Radius, StartAngle);
  const LargeArcFlag = EndAngle - StartAngle <= 180 ? "0" : "1";
  return `M ${Start.X.toFixed(2)} ${Start.Y.toFixed(2)} A ${Radius} ${Radius} 0 ${LargeArcFlag} 0 ${End.X.toFixed(2)} ${End.Y.toFixed(2)}`;
}

export type ServerActivityPoint = {
  Label: string;
  Messages?: number;
  VoiceMinutes?: number;
  Reactions?: number;
  Score: number;
};

export function BuildActivityChartDataUri(Points: ServerActivityPoint[], AccentColor: string): string {
  const Width = 653;
  const Height = 95;
  const ChartHeight = 62;
  const MaxScore = Math.max(10, ...Points.map((Point) => Point.Score));
  const Coordinates = Points.map((Point, Index) => ({
    X: 8 + ((Width - 16) / Math.max(1, Points.length - 1)) * Index,
    Y: 8 + ChartHeight - (Point.Score / MaxScore) * ChartHeight
  }));
  const LinePath = Coordinates.map((Coordinate, Index) => `${Index === 0 ? "M" : "L"} ${Coordinate.X.toFixed(1)} ${Coordinate.Y.toFixed(1)}`).join(" ");
  const AreaPath = `${LinePath} L ${Coordinates[Coordinates.length - 1]?.X.toFixed(1) ?? 0} 78 L ${Coordinates[0]?.X.toFixed(1) ?? 0} 78 Z`;
  const Labels = [0, Math.floor(Points.length / 2), Points.length - 1]
    .map((Index, LabelIndex) => {
      const Coordinate = Coordinates[Index];
      const Anchor = LabelIndex === 0 ? "start" : LabelIndex === 2 ? "end" : "middle";
      const X = LabelIndex === 0 ? 8 : LabelIndex === 2 ? Width - 8 : Coordinate?.X ?? 0;
      return Coordinate ? `<text x="${X.toFixed(1)}" y="91" fill="rgba(226,232,240,0.62)" font-size="13" font-weight="600" text-anchor="${Anchor}">${EscapeSvgText(Points[Index].Label)}</text>` : "";
    })
    .join("");
  const Svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Width}" height="${Height}" viewBox="0 0 ${Width} ${Height}">
    <defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${AccentColor}" stop-opacity="0.42"/><stop offset="1" stop-color="${AccentColor}" stop-opacity="0.02"/></linearGradient></defs>
    <path d="M 0 8 H ${Width}" stroke="rgba(148,163,184,0.15)" stroke-width="1"/>
    <path d="M 0 29 H ${Width}" stroke="rgba(148,163,184,0.15)" stroke-width="1"/>
    <path d="M 0 50 H ${Width}" stroke="rgba(148,163,184,0.15)" stroke-width="1"/>
    <path d="M 0 71 H ${Width}" stroke="rgba(148,163,184,0.15)" stroke-width="1"/>
    <path d="${AreaPath}" fill="url(#fill)"/>
    <path d="${LinePath}" fill="none" stroke="${AccentColor}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    ${Labels}
  </svg>`;
  return SvgToDataUri(Svg);
}

export function BuildScoreGaugeDataUri(Score: number, AccentColor: string): string {
  const SafeScore = Math.max(0, Math.min(100, Score));
  const TrackPath = DescribeArcPath(73, 62, 46, 220, 500);
  const ProgressPath = DescribeArcPath(73, 62, 46, 220, 220 + 280 * (SafeScore / 100));
  const Svg = `<svg xmlns="http://www.w3.org/2000/svg" width="146" height="108" viewBox="0 0 146 108">
    <path d="${TrackPath}" fill="none" stroke="rgba(148,163,184,0.18)" stroke-width="18" stroke-linecap="round"/>
    <path d="${ProgressPath}" fill="none" stroke="${AccentColor}" stroke-opacity="0.95" stroke-width="18" stroke-linecap="round"/>
  </svg>`;
  return SvgToDataUri(Svg);
}

export function BuildBackgroundDataUri(Width: number, Height: number, AccentColor: string): string {
  const Accent = HexToRgb(AccentColor);
  const AccentDark = RgbToHex(MixRgb(Accent, { R: 8, G: 14, B: 28 }, 0.72));
  const AccentSoft = RgbToHex(MixRgb(Accent, { R: 59, G: 130, B: 246 }, 0.36));
  const AccentWarm = RgbToHex(MixRgb(Accent, { R: 244, G: 114, B: 182 }, 0.48));
  const WidthPx = Width;
  const HeightPx = Height;
  const Svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WidthPx}" height="${HeightPx}" viewBox="0 0 ${WidthPx} ${HeightPx}">
    <defs>
      <linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${AccentDark}"/>
        <stop offset="0.42" stop-color="#101827"/>
        <stop offset="1" stop-color="#050816"/>
      </linearGradient>
      <radialGradient id="leftGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(${WidthPx * 0.158} ${HeightPx * 0.2}) rotate(35) scale(${WidthPx * 0.325} ${HeightPx * 0.43})">
        <stop offset="0" stop-color="${AccentColor}" stop-opacity="0.42"/>
        <stop offset="0.5" stop-color="${AccentSoft}" stop-opacity="0.18"/>
        <stop offset="1" stop-color="${AccentColor}" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="rightGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(${WidthPx * 0.85} ${HeightPx * 0.148}) rotate(20) scale(${WidthPx * 0.25} ${HeightPx * 0.34})">
        <stop offset="0" stop-color="${AccentWarm}" stop-opacity="0.24"/>
        <stop offset="1" stop-color="${AccentWarm}" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
        <stop offset="0.45" stop-color="#ffffff" stop-opacity="0.07"/>
        <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
      </linearGradient>
      <pattern id="grid" width="44" height="44" patternUnits="userSpaceOnUse">
        <path d="M 44 0 L 0 0 0 44" fill="none" stroke="#e2e8f0" stroke-opacity="0.035" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="${WidthPx}" height="${HeightPx}" fill="url(#base)"/>
    <rect width="${WidthPx}" height="${HeightPx}" fill="url(#grid)"/>
    <rect width="${WidthPx}" height="${HeightPx}" fill="url(#leftGlow)"/>
    <rect width="${WidthPx}" height="${HeightPx}" fill="url(#rightGlow)"/>
    <path d="M-80 ${HeightPx * 0.77} C${WidthPx * 0.183} ${HeightPx * 0.578} ${WidthPx * 0.3} ${HeightPx * 0.696} ${WidthPx * 0.508} ${HeightPx * 0.513} C${WidthPx * 0.696} ${HeightPx * 0.348} ${WidthPx * 0.842} ${HeightPx * 0.367} ${WidthPx * 1.067} ${HeightPx * 0.222} L${WidthPx * 1.067} ${HeightPx} L-80 ${HeightPx} Z" fill="${AccentColor}" opacity="0.09"/>
    <path d="M-60 ${HeightPx * 0.133} C${WidthPx * 0.15} ${HeightPx * 0.03} ${WidthPx * 0.282} ${HeightPx * 0.119} ${WidthPx * 0.429} ${HeightPx * 0.05} C${WidthPx * 0.613} -${HeightPx * 0.033} ${WidthPx * 0.775} ${HeightPx * 0.05} ${WidthPx * 1.05} -${HeightPx * 0.074}" fill="none" stroke="url(#sheen)" stroke-width="${HeightPx * 0.133}" opacity="0.65"/>
    <rect width="${WidthPx}" height="${HeightPx}" fill="rgba(2,6,23,0.38)"/>
  </svg>`;
  return SvgToDataUri(Svg);
}

export async function FetchImageBuffer(UrlValue: string | null): Promise<{ Buffer: Buffer; ContentType: string } | null> {
  if (!UrlValue) {
    return null;
  }
  return await fetch(UrlValue).then(async (Response) => {
    if (!Response.ok) {
      throw new Error(`HTTP ${Response.status}`);
    }
    const ContentType = Response.headers.get("content-type")?.split(";")[0] ?? "image/png";
    return {
      Buffer: Buffer.from(await Response.arrayBuffer()),
      ContentType
    };
  }).catch(() => null);
}

export async function FetchImageAsDataUri(UrlValue: string, ResizeOptions?: ImageResizeOptions): Promise<string | null> {
  const ImageBuffer = await FetchImageBuffer(UrlValue);
  if (!ImageBuffer) {
    return null;
  }
  if (!ResizeOptions) {
    return `data:${ImageBuffer.ContentType};base64,${ImageBuffer.Buffer.toString("base64")}`;
  }
  const ResizedBuffer = await sharp(ImageBuffer.Buffer)
    .resize(ResizeOptions.Width, ResizeOptions.Height, { fit: "cover", position: "center" })
    .png()
    .toBuffer();
  return `data:image/png;base64,${ResizedBuffer.toString("base64")}`;
}

export async function GetDominantColor(ImageBuffer: Buffer, Fallback = "#3b82f6"): Promise<RgbColor> {
  const Pixels = await sharp(ImageBuffer)
    .resize(32, 32, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer();
  let R = 0, G = 0, B = 0, Weight = 0;
  for (let Index = 0; Index < Pixels.length; Index += 3) {
    const PixelR = Pixels[Index];
    const PixelG = Pixels[Index + 1];
    const PixelB = Pixels[Index + 2];
    const Luma = 0.2126 * PixelR + 0.7152 * PixelG + 0.0722 * PixelB;
    const SaturationWeight = (Math.max(PixelR, PixelG, PixelB) - Math.min(PixelR, PixelG, PixelB)) / 255;
    const PixelWeight = Math.max(0.25, SaturationWeight) * (Luma > 28 && Luma < 238 ? 1 : 0.35);
    R += PixelR * PixelWeight;
    G += PixelG * PixelWeight;
    B += PixelB * PixelWeight;
    Weight += PixelWeight;
  }
  if (Weight <= 0) {
    return HexToRgb(Fallback);
  }
  return BoostColor({ R: Math.round(R / Weight), G: Math.round(G / Weight), B: Math.round(B / Weight) });
}

const SatoriFontFamily = "DejaVu Sans";
let SatoriFontsPromise: Promise<Font[]> | null = null;

async function GetSatoriFonts(): Promise<Font[]> {
  if (!SatoriFontsPromise) {
    SatoriFontsPromise = LoadSatoriFonts(SatoriFontFamily);
  }
  return await SatoriFontsPromise;
}

export async function RenderSatoriToPng(Element: ReactNode, Width: number, Height: number): Promise<Buffer> {
  const Svg = await satori(Element, {
    width: Width,
    height: Height,
    fonts: await GetSatoriFonts(),
    embedFont: true
  });
  return await sharp(Buffer.from(Svg)).png().toBuffer();
}
