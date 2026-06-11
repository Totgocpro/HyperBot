import { readFile } from "node:fs/promises";
import { createElement, type ReactNode } from "react";
import sharp from "sharp";
import satori, { type Font } from "satori";
import type { User } from "discord.js";

type LoveRendererLogger = {
  Warn(Message: string, Metadata?: unknown): void;
};

export type LoveImageOptions = {
  AccentColor: string;
  FirstUser: User;
  Percent: number;
  ProgressLabel: string;
  SecondUser: User;
  Title: string;
};

type LoveImageAssets = {
  FirstAvatarDataUri: string | null;
  SecondAvatarDataUri: string | null;
};

type RgbColor = {
  Blue: number;
  Green: number;
  Red: number;
};

const H = createElement;
const SatoriFontFamily = "DejaVu Sans";
const SatoriRegularFontPath = "/usr/share/fonts/TTF/DejaVuSans.ttf";
const SatoriBoldFontPath = "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf";

export class DiscordLoveRenderer {
  private SatoriFontsPromise: Promise<Font[]> | null = null;

  public constructor(private readonly Logger: LoveRendererLogger) {}

  public async BuildLoveImage(Options: LoveImageOptions): Promise<Buffer> {
    const Width = 1000;
    const Height = 420;
    const Accent = this.SanitizeColor(Options.AccentColor, "#ec4899");
    const Percent = this.ClampPercent(Options.Percent);
    const Assets = await this.BuildLoveAssets(Options);
    const Svg = await satori(this.BuildLoveElement(Options, Assets, Accent, Percent), {
      width: Width,
      height: Height,
      fonts: await this.GetSatoriFonts(),
      embedFont: true
    });

    return await sharp(Buffer.from(Svg)).png().toBuffer();
  }

  private async BuildLoveAssets(Options: LoveImageOptions): Promise<LoveImageAssets> {
    return {
      FirstAvatarDataUri: await this.FetchAvatarDataUri(Options.FirstUser),
      SecondAvatarDataUri: await this.FetchAvatarDataUri(Options.SecondUser)
    };
  }

  private BuildLoveElement(Options: LoveImageOptions, Assets: LoveImageAssets, Accent: string, Percent: number): ReactNode {
    const AccentRgb = this.HexToRgb(Accent);
    const AccentSoft = this.Rgba(AccentRgb, 0.16);
    const ProgressWidth = Math.max(34, Math.round(644 * (Percent / 100)));
    const CardStyle = {
      display: "flex",
      position: "absolute",
      left: 48,
      top: 42,
      width: 904,
      height: 336,
      borderRadius: 34,
      border: `2px solid ${this.Rgba(AccentRgb, 0.58)}`,
      backgroundColor: "rgba(15, 23, 42, 0.72)"
    };

    return H("div", {
      style: {
        width: 1000,
        height: 420,
        display: "flex",
        position: "relative",
        overflow: "hidden",
        color: "#f8fafc",
        fontFamily: SatoriFontFamily,
        backgroundColor: "#0f172a"
      },
      children: [
        H("img", {
          key: "background",
          src: this.BuildLoveBackgroundDataUri(Accent),
          style: { position: "absolute", left: 0, top: 0, width: 1000, height: 420 }
        }),
        H("div", {
          key: "soft-dot-left",
          style: { position: "absolute", left: 172, top: 92, width: 150, height: 150, borderRadius: 150, backgroundColor: AccentSoft }
        }),
        H("div", {
          key: "soft-dot-right",
          style: { position: "absolute", left: 682, top: 92, width: 150, height: 150, borderRadius: 150, backgroundColor: AccentSoft }
        }),
        H("div", { key: "card", style: CardStyle }),
        this.BuildAvatarNode("first-avatar", Assets.FirstAvatarDataUri, Accent, Options.FirstUser.username, 157, 77),
        this.BuildAvatarNode("second-avatar", Assets.SecondAvatarDataUri, Accent, Options.SecondUser.username, 667, 77),
        H("img", {
          key: "heart",
          src: this.BuildHeartDataUri(Accent),
          style: { position: "absolute", left: 442, top: 92, width: 116, height: 116 }
        }),
        H("div", {
          key: "title",
          style: {
            position: "absolute",
            left: 170,
            top: 62,
            width: 660,
            height: 48,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            fontSize: 34,
            fontWeight: 800,
            color: "#ffffff"
          },
          children: this.TruncatePlainText(Options.Title, 36)
        }),
        H("div", {
          key: "first-name",
          style: this.NameStyle(120, 276),
          children: this.TruncatePlainText(Options.FirstUser.username, 18)
        }),
        H("div", {
          key: "second-name",
          style: this.NameStyle(630, 276),
          children: this.TruncatePlainText(Options.SecondUser.username, 18)
        }),
        H("div", {
          key: "progress-track",
          style: {
            position: "absolute",
            left: 178,
            top: 330,
            width: 644,
            height: 34,
            borderRadius: 17,
            border: "2px solid rgba(255, 255, 255, 0.18)",
            backgroundColor: "rgba(15, 23, 42, 0.92)",
            overflow: "hidden",
            display: "flex"
          },
          children: H("div", {
            key: "progress-fill",
            style: {
              width: ProgressWidth,
              height: 34,
              borderRadius: 17,
              backgroundColor: Accent
            }
          })
        }),
        H("div", {
          key: "progress-label",
          style: {
            position: "absolute",
            left: 178,
            top: 330,
            width: 644,
            height: 34,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            fontWeight: 800,
            color: "#ffffff"
          },
          children: `${Options.ProgressLabel} ${Percent}%`
        })
      ]
    });
  }

  private BuildAvatarNode(Key: string, AvatarDataUri: string | null, Accent: string, Username: string, Left: number, Top: number): ReactNode {
    return H("div", {
      key: Key,
      style: {
        position: "absolute",
        left: Left,
        top: Top,
        width: 176,
        height: 176,
        borderRadius: 88,
        backgroundColor: "rgba(255, 255, 255, 0.08)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      },
      children: H("div", {
        style: {
          width: 164,
          height: 164,
          borderRadius: 82,
          backgroundColor: Accent,
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        },
        children: AvatarDataUri ? H("img", {
          src: AvatarDataUri,
          style: { width: 150, height: 150, borderRadius: 75 }
        }) : H("div", {
          style: {
            width: 150,
            height: 150,
            borderRadius: 75,
            backgroundColor: "#111827",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 44,
            fontWeight: 800,
            color: "#ffffff"
          },
          children: Username.slice(0, 2).toUpperCase()
        })
      })
    });
  }

  private NameStyle(Left: number, Top: number): Record<string, string | number> {
    return {
      position: "absolute",
      left: Left,
      top: Top,
      width: 250,
      height: 34,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
      fontSize: 28,
      fontWeight: 800,
      color: "#f8fafc"
    };
  }

  private async FetchAvatarDataUri(UserValue: User): Promise<string | null> {
    const AvatarUrl = UserValue.displayAvatarURL({ extension: "png", size: 256, forceStatic: true });

    return await fetch(AvatarUrl).then(async (Response) => {
      if (!Response.ok) {
        throw new Error(`HTTP ${Response.status}`);
      }

      const AvatarBuffer = Buffer.from(await Response.arrayBuffer());
      const CenteredAvatar = await sharp(AvatarBuffer)
        .resize(150, 150, { fit: "cover", position: "center" })
        .png()
        .toBuffer();

      return `data:image/png;base64,${CenteredAvatar.toString("base64")}`;
    }).catch((ErrorValue: unknown) => {
      this.Logger.Warn("Love image avatar could not be loaded.", {
        Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue),
        UserId: UserValue.id
      });
      return null;
    });
  }

  private BuildLoveBackgroundDataUri(Accent: string): string {
    const AccentRgb = this.HexToRgb(Accent);
    const AccentDark = this.RgbToHex(this.MixRgb(AccentRgb, { Red: 17, Green: 24, Blue: 39 }, 0.64));
    const AccentWarm = this.RgbToHex(this.MixRgb(AccentRgb, { Red: 244, Green: 63, Blue: 94 }, 0.42));
    const Svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="420" viewBox="0 0 1000 420">
      <defs>
        <linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#111827"/>
          <stop offset="0.48" stop-color="${AccentDark}"/>
          <stop offset="1" stop-color="#0f172a"/>
        </linearGradient>
        <radialGradient id="leftGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(235 155) scale(260)">
          <stop offset="0" stop-color="${Accent}" stop-opacity="0.34"/>
          <stop offset="1" stop-color="${Accent}" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="rightGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(765 155) scale(260)">
          <stop offset="0" stop-color="${Accent}" stop-opacity="0.34"/>
          <stop offset="1" stop-color="${Accent}" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="centerGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(500 145) scale(220)">
          <stop offset="0" stop-color="${AccentWarm}" stop-opacity="0.24"/>
          <stop offset="1" stop-color="${AccentWarm}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="1000" height="420" fill="url(#base)"/>
      <rect width="1000" height="420" fill="url(#leftGlow)"/>
      <rect width="1000" height="420" fill="url(#rightGlow)"/>
      <rect width="1000" height="420" fill="url(#centerGlow)"/>
      <path d="M-80 360 C190 250 360 312 525 226 C710 130 835 152 1080 70 L1080 420 L-80 420 Z" fill="${Accent}" opacity="0.11"/>
      <path d="M-20 62 C130 20 258 66 378 36 C548 -8 735 38 1020 -34" fill="none" stroke="#ffffff" stroke-opacity="0.06" stroke-width="72"/>
      <rect width="1000" height="420" fill="rgba(2,6,23,0.2)"/>
    </svg>`;
    return this.SvgToDataUri(Svg);
  }

  private BuildHeartDataUri(Accent: string): string {
    const Svg = `<svg xmlns="http://www.w3.org/2000/svg" width="116" height="116" viewBox="0 0 116 116">
      <defs><filter id="glow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="9" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      <path d="M58 90 C-6 36 20 -20 58 22 C96 -20 122 36 58 90 Z" fill="${Accent}" filter="url(#glow)"/>
    </svg>`;
    return this.SvgToDataUri(Svg);
  }

  private async GetSatoriFonts(): Promise<Font[]> {
    if (!this.SatoriFontsPromise) {
      this.SatoriFontsPromise = Promise.all([
        readFile(SatoriRegularFontPath),
        readFile(SatoriBoldFontPath)
      ]).then(([RegularFont, BoldFont]) => [
        { name: SatoriFontFamily, data: RegularFont, weight: 400, style: "normal" },
        { name: SatoriFontFamily, data: BoldFont, weight: 700, style: "normal" },
        { name: SatoriFontFamily, data: BoldFont, weight: 800, style: "normal" }
      ]);
    }

    return await this.SatoriFontsPromise;
  }

  private TruncatePlainText(Value: string, MaxLength: number): string {
    if (Value.length <= MaxLength) {
      return Value;
    }

    return `${Value.slice(0, Math.max(1, MaxLength - 3)).trimEnd()}...`;
  }

  private SvgToDataUri(Svg: string): string {
    return `data:image/svg+xml;base64,${Buffer.from(Svg).toString("base64")}`;
  }

  private ClampPercent(Value: number): number {
    return Math.min(100, Math.max(0, Math.round(Number.isFinite(Value) ? Value : 0)));
  }

  private HexToRgb(ColorValue: string): RgbColor {
    const SafeColor = this.SanitizeColor(ColorValue, "#ec4899").replace("#", "");
    return {
      Red: Number.parseInt(SafeColor.slice(0, 2), 16),
      Green: Number.parseInt(SafeColor.slice(2, 4), 16),
      Blue: Number.parseInt(SafeColor.slice(4, 6), 16)
    };
  }

  private RgbToHex(Color: RgbColor): string {
    return `#${[Color.Red, Color.Green, Color.Blue].map((Part) => Math.max(0, Math.min(255, Math.round(Part))).toString(16).padStart(2, "0")).join("")}`;
  }

  private Rgba(Color: RgbColor, Alpha: number): string {
    return `rgba(${Math.round(Color.Red)}, ${Math.round(Color.Green)}, ${Math.round(Color.Blue)}, ${Alpha})`;
  }

  private MixRgb(FirstColor: RgbColor, SecondColor: RgbColor, SecondWeight: number): RgbColor {
    const FirstWeight = 1 - SecondWeight;
    return {
      Red: FirstColor.Red * FirstWeight + SecondColor.Red * SecondWeight,
      Green: FirstColor.Green * FirstWeight + SecondColor.Green * SecondWeight,
      Blue: FirstColor.Blue * FirstWeight + SecondColor.Blue * SecondWeight
    };
  }

  private SanitizeColor(ColorValue: string, Fallback: string): string {
    return /^#[0-9a-f]{6}$/iu.test(ColorValue) ? ColorValue : Fallback;
  }
}
