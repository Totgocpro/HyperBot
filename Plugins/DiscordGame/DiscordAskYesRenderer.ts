import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";

export type AskYesImageOptions = {
  AccentColor: string;
  Answer: "YES" | "NO";
  NoLabel: string;
  Question: string;
  Title: string;
  YesLabel: string;
};

type RgbColor = {
  Blue: number;
  Green: number;
  Red: number;
};

export class DiscordAskYesRenderer {
  public BuildAskYesImage(Options: AskYesImageOptions): Buffer {
    const Width = 1000;
    const Height = 420;
    const Canvas = createCanvas(Width, Height);
    const Context = Canvas.getContext("2d");
    const Accent = this.SanitizeColor(Options.AccentColor, "#38bdf8");
    const AccentRgb = this.HexToRgb(Accent);
    const AnswerLabel = Options.Answer === "YES" ? Options.YesLabel : Options.NoLabel;

    const Background = Context.createLinearGradient(0, 0, Width, Height);
    Background.addColorStop(0, "#020617");
    Background.addColorStop(0.55, Options.Answer === "YES" ? "#063a31" : "#3f1720");
    Background.addColorStop(1, "#111827");
    Context.fillStyle = Background;
    Context.fillRect(0, 0, Width, Height);

    this.DrawGlow(Context, 500, 210, AccentRgb, 0.2);
    this.DrawRoundedRect(Context, 54, 46, 892, 328, 34, "rgba(15, 23, 42, 0.76)");
    Context.lineWidth = 2;
    Context.strokeStyle = `rgba(${AccentRgb.Red}, ${AccentRgb.Green}, ${AccentRgb.Blue}, 0.55)`;
    this.StrokeRoundedRect(Context, 54, 46, 892, 328, 34);

    this.DrawCenteredText(Context, this.TruncateText(Context, Options.Title, 760, 28, 900), 500, 92, 28, 900, "#ffffff");
    const QuestionLines = this.WrapText(Context, Options.Question, 780, 30, 700, 3);
    this.DrawTextBlock(Context, QuestionLines, 500, 160, 42, 30, 700, "#e2e8f0");

    const AnswerColor = Options.Answer === "YES" ? "#22c55e" : "#ef4444";
    this.DrawRoundedRect(Context, 330, 280, 340, 74, 24, AnswerColor);
    this.DrawCenteredText(Context, AnswerLabel.toUpperCase(), 500, 318, 42, 900, "#ffffff");

    return Canvas.encodeSync("png");
  }

  private WrapText(Context: SKRSContext2D, Text: string, MaxWidth: number, FontSize: number, FontWeight: number, MaxLines: number): string[] {
    Context.font = this.FormatFont(FontSize, FontWeight);
    const Words = Text.replace(/\s+/gu, " ").trim().split(" ").filter(Boolean);
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

      if (Lines.length >= MaxLines) {
        break;
      }
    }

    if (CurrentLine && Lines.length < MaxLines) {
      Lines.push(CurrentLine);
    }

    if (Lines.length === 0) {
      Lines.push("");
    }

    const LastIndex = Lines.length - 1;
    Lines[LastIndex] = this.TruncateText(Context, Lines[LastIndex], MaxWidth, FontSize, FontWeight);
    return Lines;
  }

  private DrawTextBlock(Context: SKRSContext2D, Lines: string[], CenterX: number, StartY: number, LineHeight: number, FontSize: number, FontWeight: number, Color: string): void {
    const TotalHeight = (Lines.length - 1) * LineHeight;

    for (let Index = 0; Index < Lines.length; Index += 1) {
      this.DrawCenteredText(Context, Lines[Index], CenterX, StartY + Index * LineHeight - TotalHeight / 2, FontSize, FontWeight, Color);
    }
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

  private DrawGlow(Context: SKRSContext2D, CenterX: number, CenterY: number, Color: RgbColor, Opacity: number): void {
    const Gradient = Context.createRadialGradient(CenterX, CenterY, 0, CenterX, CenterY, 240);
    Gradient.addColorStop(0, `rgba(${Color.Red}, ${Color.Green}, ${Color.Blue}, ${Opacity})`);
    Gradient.addColorStop(1, `rgba(${Color.Red}, ${Color.Green}, ${Color.Blue}, 0)`);
    Context.fillStyle = Gradient;
    Context.fillRect(CenterX - 240, CenterY - 240, 480, 480);
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

  private FormatFont(FontSize: number, FontWeight: number): string {
    const SafeWeight = FontWeight >= 800 ? "900" : FontWeight >= 700 ? "bold" : FontWeight >= 600 ? "600" : "normal";
    return `${SafeWeight} ${FontSize}px "DejaVu Sans", "Noto Sans", "Liberation Sans", sans-serif`;
  }

  private HexToRgb(ColorValue: string): RgbColor {
    const SafeColor = this.SanitizeColor(ColorValue, "#38bdf8").replace("#", "");
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
