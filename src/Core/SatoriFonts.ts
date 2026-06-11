import { readFile } from "node:fs/promises";
import type { Font } from "satori";

const RegularFontPaths = [
  "/usr/share/fonts/TTF/DejaVuSans.ttf",
  "/usr/share/fonts/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/liberation/LiberationSans-Regular.ttf",
  "/usr/share/fonts/liberation-sans/LiberationSans-Regular.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
  "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf"
];

const BoldFontPaths = [
  "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/liberation/LiberationSans-Bold.ttf",
  "/usr/share/fonts/liberation-sans/LiberationSans-Bold.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
  "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf"
];

export async function LoadSatoriFonts(FontFamily: string): Promise<Font[]> {
  const [RegularFont, BoldFont] = await Promise.all([
    ReadFirstAvailableFont(RegularFontPaths, "regular"),
    ReadFirstAvailableFont(BoldFontPaths, "bold")
  ]);

  return [
    { name: FontFamily, data: RegularFont, weight: 400, style: "normal" },
    { name: FontFamily, data: BoldFont, weight: 700, style: "normal" },
    { name: FontFamily, data: BoldFont, weight: 800, style: "normal" }
  ];
}

async function ReadFirstAvailableFont(Paths: string[], Label: string): Promise<Buffer> {
  for (const FontPath of Paths) {
    try {
      return await readFile(FontPath);
    } catch (ErrorValue) {
      const Code = (ErrorValue as { code?: unknown } | null)?.code;
      if (Code !== "ENOENT" && Code !== "ENOTDIR") {
        throw ErrorValue;
      }
    }
  }

  throw new Error(`Could not find a ${Label} font for Satori. Install ttf-dejavu or ttf-liberation in the Docker image.`);
}
