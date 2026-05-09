import { createCanvas, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
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

type RgbColor = {
  Blue: number;
  Green: number;
  Red: number;
};

export class DiscordLoveRenderer {
  public constructor(private readonly Logger: LoveRendererLogger) {}

  public async BuildLoveImage(Options: LoveImageOptions): Promise<Buffer> {
    const Width = 1000;
    const Height = 420;
    const Canvas = createCanvas(Width, Height);
    const Context = Canvas.getContext("2d");
    const Accent = this.SanitizeColor(Options.AccentColor, "#ec4899");
    const AccentRgb = this.HexToRgb(Accent);
    const FirstAvatar = await this.LoadAvatar(Options.FirstUser);
    const SecondAvatar = await this.LoadAvatar(Options.SecondUser);
    const Percent = this.ClampPercent(Options.Percent);

    const Background = Context.createLinearGradient(0, 0, Width, Height);
    Background.addColorStop(0, "#111827");
    Background.addColorStop(0.52, "#3f1234");
    Background.addColorStop(1, "#0f172a");
    Context.fillStyle = Background;
    Context.fillRect(0, 0, Width, Height);

    this.DrawGlow(Context, 235, 155, AccentRgb, 0.22);
    this.DrawGlow(Context, 765, 155, AccentRgb, 0.22);
    this.DrawRoundedRect(Context, 48, 42, 904, 336, 34, "rgba(15, 23, 42, 0.72)");
    Context.lineWidth = 2;
    Context.strokeStyle = `rgba(${AccentRgb.Red}, ${AccentRgb.Green}, ${AccentRgb.Blue}, 0.58)`;
    this.StrokeRoundedRect(Context, 48, 42, 904, 336, 34);

    this.DrawAvatar(Context, 245, 165, 88, FirstAvatar, Accent);
    this.DrawAvatar(Context, 755, 165, 88, SecondAvatar, Accent);
    this.DrawHeart(Context, 500, 152, 56, Accent);

    this.DrawCenteredText(Context, this.TruncateText(Context, Options.FirstUser.username, 250, 28, 800), 245, 290, 28, 800, "#f8fafc");
    this.DrawCenteredText(Context, this.TruncateText(Context, Options.SecondUser.username, 250, 28, 800), 755, 290, 28, 800, "#f8fafc");
    this.DrawCenteredText(Context, this.TruncateText(Context, Options.Title, 660, 34, 900), 500, 82, 34, 900, "#ffffff");

    const BarX = 178;
    const BarY = 330;
    const BarWidth = 644;
    const BarHeight = 34;
    this.DrawRoundedRect(Context, BarX, BarY, BarWidth, BarHeight, 17, "rgba(15, 23, 42, 0.92)");
    this.DrawRoundedRect(Context, BarX, BarY, Math.max(BarHeight, BarWidth * (Percent / 100)), BarHeight, 17, Accent);
    Context.lineWidth = 2;
    Context.strokeStyle = "rgba(255, 255, 255, 0.18)";
    this.StrokeRoundedRect(Context, BarX, BarY, BarWidth, BarHeight, 17);

    this.DrawCenteredText(Context, `${Options.ProgressLabel} ${Percent}%`, 500, 354, 18, 800, "#ffffff");

    return Canvas.encodeSync("png");
  }

  private async LoadAvatar(UserValue: User): Promise<Image | null> {
    const AvatarUrl = UserValue.displayAvatarURL({ extension: "png", size: 256, forceStatic: true });

    return await loadImage(AvatarUrl).catch((ErrorValue: unknown) => {
      this.Logger.Warn("Love image avatar could not be loaded.", {
        Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue),
        UserId: UserValue.id
      });
      return null;
    });
  }

  private DrawAvatar(Context: SKRSContext2D, CenterX: number, CenterY: number, Radius: number, Avatar: Image | null, Accent: string): void {
    Context.save();
    this.DrawCircle(Context, CenterX, CenterY, Radius + 12, "rgba(255, 255, 255, 0.08)");
    this.DrawCircle(Context, CenterX, CenterY, Radius + 6, Accent);
    this.DrawCircle(Context, CenterX, CenterY, Radius, "#111827");

    if (Avatar) {
      Context.beginPath();
      Context.arc(CenterX, CenterY, Radius - 7, 0, Math.PI * 2);
      Context.clip();
      Context.imageSmoothingEnabled = true;
      Context.imageSmoothingQuality = "high";
      Context.drawImage(Avatar, CenterX - Radius + 7, CenterY - Radius + 7, (Radius - 7) * 2, (Radius - 7) * 2);
    }

    Context.restore();
  }

  private DrawHeart(Context: SKRSContext2D, CenterX: number, CenterY: number, Size: number, FillStyle: string): void {
    Context.save();
    Context.translate(CenterX, CenterY);
    Context.scale(Size / 100, Size / 100);
    Context.beginPath();
    Context.moveTo(0, 34);
    Context.bezierCurveTo(-62, -18, -42, -68, 0, -34);
    Context.bezierCurveTo(42, -68, 62, -18, 0, 34);
    Context.closePath();
    Context.fillStyle = FillStyle;
    Context.shadowColor = FillStyle;
    Context.shadowBlur = 24;
    Context.fill();
    Context.restore();
  }

  private DrawGlow(Context: SKRSContext2D, CenterX: number, CenterY: number, Color: RgbColor, Opacity: number): void {
    const Gradient = Context.createRadialGradient(CenterX, CenterY, 0, CenterX, CenterY, 190);
    Gradient.addColorStop(0, `rgba(${Color.Red}, ${Color.Green}, ${Color.Blue}, ${Opacity})`);
    Gradient.addColorStop(1, `rgba(${Color.Red}, ${Color.Green}, ${Color.Blue}, 0)`);
    Context.fillStyle = Gradient;
    Context.fillRect(CenterX - 190, CenterY - 190, 380, 380);
  }

  private DrawCircle(Context: SKRSContext2D, CenterX: number, CenterY: number, Radius: number, FillStyle: SKRSContext2D["fillStyle"]): void {
    Context.beginPath();
    Context.arc(CenterX, CenterY, Radius, 0, Math.PI * 2);
    Context.fillStyle = FillStyle;
    Context.fill();
  }

  private DrawRoundedRect(Context: SKRSContext2D, X: number, Y: number, Width: number, Height: number, Radius: number, FillStyle: SKRSContext2D["fillStyle"]): void {
    this.BuildRoundedRectPath(Context, X, Y, Width, Height, Radius);
    Context.fillStyle = FillStyle;
    Context.fill();
  }

  private StrokeRoundedRect(Context: SKRSContext2D, X: number, Y: number, Width: number, Height: number, Radius: number): void {
    this.BuildRoundedRectPath(Context, X, Y, Width, Height, Radius);
    Context.stroke();
  }

  private BuildRoundedRectPath(Context: SKRSContext2D, X: number, Y: number, Width: number, Height: number, Radius: number): void {
    const SafeRadius = Math.min(Radius, Width / 2, Height / 2);
    Context.beginPath();
    Context.moveTo(X + SafeRadius, Y);
    Context.lineTo(X + Width - SafeRadius, Y);
    Context.quadraticCurveTo(X + Width, Y, X + Width, Y + SafeRadius);
    Context.lineTo(X + Width, Y + Height - SafeRadius);
    Context.quadraticCurveTo(X + Width, Y + Height, X + Width - SafeRadius, Y + Height);
    Context.lineTo(X + SafeRadius, Y + Height);
    Context.quadraticCurveTo(X, Y + Height, X, Y + Height - SafeRadius);
    Context.lineTo(X, Y + SafeRadius);
    Context.quadraticCurveTo(X, Y, X + SafeRadius, Y);
    Context.closePath();
  }

  private DrawCenteredText(Context: SKRSContext2D, Text: string, X: number, Y: number, FontSize: number, FontWeight: number, Color: string): void {
    Context.font = this.FormatFont(FontSize, FontWeight);
    Context.fillStyle = Color;
    Context.textAlign = "center";
    Context.textBaseline = "middle";
    Context.fillText(Text, X, Y);
    Context.textAlign = "start";
    Context.textBaseline = "alphabetic";
  }

  private TruncateText(Context: SKRSContext2D, Text: string, MaxWidth: number, FontSize: number, FontWeight: number): string {
    Context.font = this.FormatFont(FontSize, FontWeight);

    if (Context.measureText(Text).width <= MaxWidth) {
      return Text;
    }

    let TruncatedText = Text;

    while (TruncatedText.length > 1 && Context.measureText(`${TruncatedText}...`).width > MaxWidth) {
      TruncatedText = TruncatedText.slice(0, -1);
    }

    return `${TruncatedText.trimEnd()}...`;
  }

  private FormatFont(FontSize: number, FontWeight: number): string {
    const SafeWeight = FontWeight >= 800 ? "900" : FontWeight >= 700 ? "bold" : FontWeight >= 600 ? "600" : "normal";
    return `${SafeWeight} ${FontSize}px "DejaVu Sans", "Noto Sans", "Liberation Sans", sans-serif`;
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

  private SanitizeColor(ColorValue: string, Fallback: string): string {
    return /^#[0-9a-f]{6}$/iu.test(ColorValue) ? ColorValue : Fallback;
  }
}
