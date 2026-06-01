import { createCanvas, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import type { TempVoiceMusicState } from "./TempVoiceMusicPlayer.js";

type TempVoiceMusicPanelLogger = {
  Warn(Message: string, Metadata?: unknown): void;
};

type TempVoiceMusicPanelRenderOptions = {
  HideTiming?: boolean;
};

export class TempVoiceMusicPanelRenderer {
  private readonly ThumbnailCache = new Map<string, Promise<Image | null>>();

  public constructor(private readonly Logger: TempVoiceMusicPanelLogger) {}

  public async BuildPanelImage(State: TempVoiceMusicState, Options: TempVoiceMusicPanelRenderOptions = {}): Promise<Buffer> {
    const Width = 1200;
    const Height = 560;
    const Canvas = createCanvas(Width, Height);
    const Context = Canvas.getContext("2d");
    const Thumbnail = await this.LoadThumbnail(State.TrackThumbnailUrl);
    const Progress = !Options.HideTiming && State.DurationSeconds && State.DurationSeconds > 0
      ? Math.min(State.PositionSeconds / State.DurationSeconds, 1)
      : 0;

    const Background = Context.createLinearGradient(0, 0, Width, Height);
    Background.addColorStop(0, "#111827");
    Background.addColorStop(0.48, "#1f2937");
    Background.addColorStop(1, "#0f172a");
    Context.fillStyle = Background;
    Context.fillRect(0, 0, Width, Height);

    this.DrawGlow(Context, 280, 210, "rgba(239, 68, 68, 0.22)");
    this.DrawGlow(Context, 790, 95, "rgba(56, 189, 248, 0.16)");
    this.DrawYoutubeBadge(Context, 54, 42);

    this.DrawThumbnail(Context, 54, 104, 520, 292, Thumbnail);
    this.DrawTrackInfo(Context, State, Options, 610, 104, 526);
    this.DrawQueue(Context, State, 610, 258, 526, 190);

    if (!Options.HideTiming) {
      this.DrawProgress(Context, State, Progress, 54, 462, 1082);
    }

    return Canvas.encodeSync("png");
  }

  private async LoadThumbnail(ThumbnailUrl: string): Promise<Image | null> {
    const SafeUrl = ThumbnailUrl.trim();

    if (!SafeUrl) {
      return null;
    }

    const Existing = this.ThumbnailCache.get(SafeUrl);

    if (Existing) {
      return await Existing;
    }

    const Pending = loadImage(SafeUrl).catch((ErrorValue: unknown) => {
      this.Logger.Warn("TempVoice music panel thumbnail could not be loaded.", {
        Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue),
        ThumbnailUrl: SafeUrl
      });
      return null;
    });

    this.ThumbnailCache.set(SafeUrl, Pending);
    return await Pending;
  }

  private DrawYoutubeBadge(Context: SKRSContext2D, X: number, Y: number): void {
    this.DrawRoundedRect(Context, X, Y, 178, 42, 14, "rgba(15, 23, 42, 0.76)");
    this.DrawRoundedRect(Context, X + 12, Y + 9, 40, 24, 8, "#ef4444");
    Context.beginPath();
    Context.moveTo(X + 29, Y + 16);
    Context.lineTo(X + 29, Y + 26);
    Context.lineTo(X + 39, Y + 21);
    Context.closePath();
    Context.fillStyle = "#ffffff";
    Context.fill();
    Context.font = "700 20px \"DejaVu Sans\", \"Noto Sans\", \"Liberation Sans\", sans-serif";
    Context.fillStyle = "#f8fafc";
    Context.textAlign = "left";
    Context.textBaseline = "middle";
    Context.fillText("YT Music", X + 64, Y + 22);
  }

  private DrawThumbnail(Context: SKRSContext2D, X: number, Y: number, Width: number, Height: number, Thumbnail: Image | null): void {
    this.DrawRoundedRect(Context, X - 4, Y - 4, Width + 8, Height + 8, 22, "rgba(255, 255, 255, 0.08)");
    this.DrawRoundedRect(Context, X, Y, Width, Height, 18, "#020617");
    Context.save();
    this.RoundedPath(Context, X, Y, Width, Height, 18);
    Context.clip();

    if (Thumbnail) {
      const Scale = Math.max(Width / Thumbnail.width, Height / Thumbnail.height);
      const DrawWidth = Thumbnail.width * Scale;
      const DrawHeight = Thumbnail.height * Scale;
      Context.imageSmoothingEnabled = true;
      Context.imageSmoothingQuality = "high";
      Context.drawImage(Thumbnail, X + (Width - DrawWidth) / 2, Y + (Height - DrawHeight) / 2, DrawWidth, DrawHeight);
    } else {
      const Gradient = Context.createLinearGradient(X, Y, X + Width, Y + Height);
      Gradient.addColorStop(0, "#1e293b");
      Gradient.addColorStop(1, "#0f172a");
      Context.fillStyle = Gradient;
      Context.fillRect(X, Y, Width, Height);
      Context.font = "800 96px \"DejaVu Sans\", \"Noto Sans\", \"Liberation Sans\", sans-serif";
      Context.fillStyle = "rgba(248, 250, 252, 0.24)";
      Context.textAlign = "center";
      Context.textBaseline = "middle";
      Context.fillText("YT", X + Width / 2, Y + Height / 2);
    }

    Context.restore();
  }

  private DrawTrackInfo(Context: SKRSContext2D, State: TempVoiceMusicState, Options: TempVoiceMusicPanelRenderOptions, X: number, Y: number, Width: number): void {
    Context.font = "800 36px \"DejaVu Sans\", \"Noto Sans\", \"Liberation Sans\", sans-serif";
    Context.fillStyle = "#f8fafc";
    Context.textAlign = "left";
    Context.textBaseline = "top";
    this.DrawWrappedText(Context, State.TrackTitle || "No track", X, Y, Width, 44, 2);

    if (State.TrackAuthor) {
      Context.font = "700 20px \"DejaVu Sans\", \"Noto Sans\", \"Liberation Sans\", sans-serif";
      Context.fillStyle = "#cbd5e1";
      Context.fillText(this.TruncateText(Context, `by ${State.TrackAuthor}`, Width), X, Y + 92);
    }

    Context.font = "700 18px \"DejaVu Sans\", \"Noto Sans\", \"Liberation Sans\", sans-serif";
    Context.fillStyle = State.Paused ? "#fbbf24" : "#22c55e";
    Context.fillText(State.Paused ? "Paused" : "Playing now", X, Y + 124);

    if (Options.HideTiming) {
      return;
    }

    Context.fillStyle = "#94a3b8";
    Context.fillText(`${this.FormatDuration(State.PositionSeconds)} / ${this.FormatDuration(State.DurationSeconds)}`, X + 132, Y + 124);
  }

  private DrawQueue(Context: SKRSContext2D, State: TempVoiceMusicState, X: number, Y: number, Width: number, Height: number): void {
    this.DrawRoundedRect(Context, X, Y, Width, Height, 18, "rgba(15, 23, 42, 0.68)");
    Context.font = "800 20px \"DejaVu Sans\", \"Noto Sans\", \"Liberation Sans\", sans-serif";
    Context.fillStyle = "#e2e8f0";
    Context.textAlign = "left";
    Context.textBaseline = "top";
    Context.fillText("Next tracks", X + 22, Y + 18);

    const VisibleQueue = State.Queue.slice(0, 4);

    if (VisibleQueue.length === 0) {
      Context.font = "600 18px \"DejaVu Sans\", \"Noto Sans\", \"Liberation Sans\", sans-serif";
      Context.fillStyle = "#64748b";
      Context.fillText("Waitlist is empty", X + 22, Y + 66);
      return;
    }

    Context.font = "700 18px \"DejaVu Sans\", \"Noto Sans\", \"Liberation Sans\", sans-serif";
    for (let Index = 0; Index < VisibleQueue.length; Index += 1) {
      const Track = VisibleQueue[Index];
      const RowY = Y + 58 + Index * 30;
      Context.fillStyle = "#94a3b8";
      Context.fillText(`${Index + 1}.`, X + 22, RowY);
      Context.fillStyle = "#f8fafc";
      Context.fillText(this.TruncateText(Context, Track.Title, Width - 92), X + 54, RowY);
    }

    if (State.Queue.length > VisibleQueue.length) {
      Context.font = "700 15px \"DejaVu Sans\", \"Noto Sans\", \"Liberation Sans\", sans-serif";
      Context.fillStyle = "#64748b";
      Context.fillText(`+${State.Queue.length - VisibleQueue.length} more`, X + 22, Y + Height - 15);
    }
  }

  private DrawProgress(Context: SKRSContext2D, State: TempVoiceMusicState, Progress: number, X: number, Y: number, Width: number): void {
    const BarHeight = 22;
    this.DrawRoundedRect(Context, X, Y, Width, BarHeight, 11, "rgba(15, 23, 42, 0.88)");
    this.DrawRoundedRect(Context, X, Y, Math.max(BarHeight, Width * Progress), BarHeight, 11, State.Paused ? "#f59e0b" : "#ef4444");
    Context.lineWidth = 2;
    Context.strokeStyle = "rgba(255, 255, 255, 0.16)";
    this.StrokeRoundedRect(Context, X, Y, Width, BarHeight, 11);

    Context.font = "700 18px \"DejaVu Sans\", \"Noto Sans\", \"Liberation Sans\", sans-serif";
    Context.fillStyle = "#cbd5e1";
    Context.textAlign = "left";
    Context.textBaseline = "top";
    Context.fillText(this.FormatDuration(State.PositionSeconds), X, Y + 36);
    Context.textAlign = "right";
    Context.fillText(this.FormatDuration(State.DurationSeconds), X + Width, Y + 36);
  }

  private DrawWrappedText(Context: SKRSContext2D, Text: string, X: number, Y: number, MaxWidth: number, LineHeight: number, MaxLines: number): void {
    const Words = Text.split(/\s+/u).filter(Boolean);
    const Lines: string[] = [];
    let CurrentLine = "";

    for (const Word of Words) {
      const Candidate = CurrentLine ? `${CurrentLine} ${Word}` : Word;

      if (Context.measureText(Candidate).width <= MaxWidth) {
        CurrentLine = Candidate;
        continue;
      }

      if (CurrentLine) {
        Lines.push(CurrentLine);
      }

      CurrentLine = Word;

      if (Lines.length === MaxLines - 1) {
        break;
      }
    }

    if (CurrentLine && Lines.length < MaxLines) {
      Lines.push(CurrentLine);
    }

    for (let Index = 0; Index < Lines.length; Index += 1) {
      const IsLastLine = Index === MaxLines - 1;
      Context.fillText(IsLastLine ? this.TruncateText(Context, Lines[Index], MaxWidth) : Lines[Index], X, Y + Index * LineHeight);
    }
  }

  private TruncateText(Context: SKRSContext2D, Text: string, MaxWidth: number): string {
    if (Context.measureText(Text).width <= MaxWidth) {
      return Text;
    }

    let Result = Text;

    while (Result.length > 1 && Context.measureText(`${Result}...`).width > MaxWidth) {
      Result = Result.slice(0, -1);
    }

    return `${Result.trimEnd()}...`;
  }

  private FormatDuration(Value: number | null): string {
    if (!Value || Value < 0) {
      return "--:--";
    }

    const TotalSeconds = Math.floor(Value);
    const Hours = Math.floor(TotalSeconds / 3600);
    const Minutes = Math.floor((TotalSeconds % 3600) / 60);
    const Seconds = TotalSeconds % 60;

    if (Hours > 0) {
      return `${Hours}:${String(Minutes).padStart(2, "0")}:${String(Seconds).padStart(2, "0")}`;
    }

    return `${Minutes}:${String(Seconds).padStart(2, "0")}`;
  }

  private DrawGlow(Context: SKRSContext2D, X: number, Y: number, Color: string): void {
    const Gradient = Context.createRadialGradient(X, Y, 0, X, Y, 260);
    Gradient.addColorStop(0, Color);
    Gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    Context.fillStyle = Gradient;
    Context.fillRect(X - 260, Y - 260, 520, 520);
  }

  private DrawRoundedRect(Context: SKRSContext2D, X: number, Y: number, Width: number, Height: number, Radius: number, FillStyle: string): void {
    this.RoundedPath(Context, X, Y, Width, Height, Radius);
    Context.fillStyle = FillStyle;
    Context.fill();
  }

  private StrokeRoundedRect(Context: SKRSContext2D, X: number, Y: number, Width: number, Height: number, Radius: number): void {
    this.RoundedPath(Context, X, Y, Width, Height, Radius);
    Context.stroke();
  }

  private RoundedPath(Context: SKRSContext2D, X: number, Y: number, Width: number, Height: number, Radius: number): void {
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
}
