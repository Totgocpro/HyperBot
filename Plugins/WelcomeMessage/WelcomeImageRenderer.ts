import { createCanvas, GlobalFonts, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import type { GuildMember, PartialGuildMember } from "discord.js";

export type ImageFitMode = "Cover" | "Contain" | "Stretch";
export type ImageAvatarStyle = "Circle" | "Rounded" | "Square";

type WelcomeImageLogger = {
  Warn(Message: string, Metadata?: Record<string, unknown>): void;
};

type WelcomeImageBackgroundConfig = {
  ImageBackgroundImage: string;
  WelcomeImageBackgroundImage: string;
  LeaveImageBackgroundImage: string;
};

type PngColor = {
  Red: number;
  Green: number;
  Blue: number;
  Alpha: number;
};

type PngTextBlock = {
  Color: string;
  FontSize: number;
  FontWeight: number;
  LineHeight: number;
  Lines: string[];
  X: number;
  Y: number;
};

export class WelcomeImageRenderer {
  public constructor(private readonly Logger: WelcomeImageLogger) {}

  public async BuildWelcomePng(Options: {
    AccentColor: string;
    BackgroundColor: string;
    BackgroundFit: ImageFitMode;
    BackgroundImageSource: string;
    BackgroundOpacity: number;
    BadgeText: string;
    Description: string;
    DescriptionFontSize: number;
    Footer: string;
    Member: GuildMember | PartialGuildMember;
    MutedTextColor: string;
    OverlayOpacity: number;
    PanelEnabled: boolean;
    PanelOpacity: number;
    AvatarSize: number;
    AvatarStyle: ImageAvatarStyle;
    ShowInitialsAvatar: boolean;
    TextColor: string;
    Title: string;
    TitleFontSize: number;
    Type: "Welcome" | "Leave";
  }): Promise<Buffer> {
    const Width = 1000;
    const Height = 320;
    const Canvas = createCanvas(Width, Height);
    const Context = Canvas.getContext("2d");
    const AccentColor = this.HexToRgb(this.SanitizeColor(Options.AccentColor, "#38bdf8"));
    const BackgroundColor = this.HexToRgb(this.SanitizeColor(Options.BackgroundColor, "#020617"));
    const TextColor = this.HexToRgb(this.SanitizeColor(Options.TextColor, "#f8fafc"));
    const MutedTextColor = this.HexToRgb(this.SanitizeColor(Options.MutedTextColor, "#cbd5e1"));
    const PanelColor = "#0f172a";
    const DarkPanelColor = `rgba(2, 6, 23, ${this.ClampPercent(Options.PanelOpacity, 86) / 100})`;
    const Username = Options.Member.user.tag;
    const Initials = this.BuildInitials(Options.Member.user.username);
    const Accent = this.ToCssColor(AccentColor);
    const Background = this.ToCssColor(BackgroundColor);
    const Text = this.ToCssColor(TextColor);
    const MutedText = this.ToCssColor(MutedTextColor);
    const TextX = 242;
    const ContentWidth = 690;
    const AvatarImage = await this.LoadMemberAvatar(Options.Member);

    const BackgroundGradient = Context.createLinearGradient(0, 0, Width, Height);
    BackgroundGradient.addColorStop(0, Background);
    BackgroundGradient.addColorStop(1, PanelColor);
    Context.fillStyle = BackgroundGradient;
    Context.fillRect(0, 0, Width, Height);

    const BackgroundImage = await this.LoadConfiguredImage(Options.BackgroundImageSource);

    if (BackgroundImage) {
      Context.save();
      Context.globalAlpha = this.ClampPercent(Options.BackgroundOpacity, 100) / 100;
      this.DrawFittedImage(Context, BackgroundImage, 0, 0, Width, Height, Options.BackgroundFit);
      Context.restore();
    }

    const OverlayOpacity = this.ClampPercent(Options.OverlayOpacity, 55) / 100;
    const OverlayGradient = Context.createLinearGradient(0, 0, Width, Height);
    OverlayGradient.addColorStop(0, `rgba(2, 6, 23, ${OverlayOpacity})`);
    OverlayGradient.addColorStop(1, `rgba(15, 23, 42, ${Math.min(0.9, OverlayOpacity + 0.16)})`);
    Context.fillStyle = OverlayGradient;
    Context.fillRect(0, 0, Width, Height);

    if (Options.PanelEnabled) {
      Context.shadowColor = "rgba(0, 0, 0, 0.36)";
      Context.shadowBlur = 18;
      Context.shadowOffsetY = 10;
      this.DrawRoundedRect(Context, 34, 34, 932, 252, 26, DarkPanelColor);
      Context.shadowColor = "transparent";
      Context.lineWidth = 2;
      Context.strokeStyle = this.ToCssColor({ ...AccentColor, Alpha: 160 });
      this.StrokeRoundedRect(Context, 34, 34, 932, 252, 26);
    }

    this.DrawAvatar(Context, 134, 160, this.ClampNumber(Options.AvatarSize, 64, 190, 140) / 2, Accent, Text, Initials, Options.ShowInitialsAvatar, AvatarImage, Options.AvatarStyle);

    const BadgeText = this.TruncateText(Context, this.NormalizeCardText(Options.BadgeText.replaceAll("%type%", Options.Type).toUpperCase()), 210, 13, 700);

    if (BadgeText) {
      this.DrawBadge(Context, TextX, 72, BadgeText, Accent);
    }

    const TitleFontSize = this.ResolveAdaptiveFontSize(Options.Title, this.ClampNumber(Options.TitleFontSize, 20, 58, 40), 17, 44, 92);
    const TitleLineHeight = Math.round(TitleFontSize * 1.45);
    const TitleLines = this.WrapText(Context, Options.Title, ContentWidth, TitleFontSize, 700, 2);
    this.FillTextBlock(Context, {
      Color: Text,
      FontSize: TitleFontSize,
      FontWeight: 700,
      LineHeight: TitleLineHeight,
      Lines: TitleLines,
      X: TextX,
      Y: 145
    });

    const DescriptionFontSize = this.ResolveAdaptiveFontSize(Options.Description, this.ClampNumber(Options.DescriptionFontSize, 11, 26, 15), 12, 70, 150);
    const DescriptionLineHeight = Math.round(DescriptionFontSize * 1.62);
    const DescriptionY = 122 + TitleLines.length * TitleLineHeight;
    const DescriptionLines = this.WrapText(Context, Options.Description, ContentWidth, DescriptionFontSize, 400, 3);
    this.FillTextBlock(Context, {
      Color: MutedText,
      FontSize: DescriptionFontSize,
      FontWeight: 400,
      LineHeight: DescriptionLineHeight,
      Lines: DescriptionLines,
      X: TextX,
      Y: DescriptionY
    });

    const MetadataY = 260;
    Context.font = this.FormatFont(11, 600);
    Context.fillStyle = "rgba(148, 163, 184, 0.94)";
    Context.fillText(this.TruncateText(Context, Username, 300, 11, 600), TextX, MetadataY);

    Context.font = this.FormatFont(11, 400);
    Context.fillStyle = "rgba(148, 163, 184, 0.86)";
    if (Options.Footer) {
      Context.fillText(this.TruncateText(Context, this.NormalizeCardText(Options.Footer), 360, 11, 400), 570, MetadataY);
    }

    return Canvas.encodeSync("png");
  }

  public ResolveImageBackgroundSource(Config: WelcomeImageBackgroundConfig, Type: "Welcome" | "Leave"): string {
    const SpecificSource = Type === "Welcome" ? Config.WelcomeImageBackgroundImage : Config.LeaveImageBackgroundImage;
    return SpecificSource.trim() || Config.ImageBackgroundImage.trim();
  }

  private async LoadConfiguredImage(Source: string): Promise<Image | null> {
    const TrimmedSource = Source.trim();

    if (!TrimmedSource) {
      return null;
    }

    if (TrimmedSource.startsWith("data:image/")) {
      const Match = TrimmedSource.match(/^data:image\/[a-z0-9.+-]+;base64,(.+)$/iu);

      if (!Match?.[1]) {
        return null;
      }

      return await loadImage(Buffer.from(Match[1], "base64")).catch((ErrorValue: unknown) => {
        this.Logger.Warn("Uploaded welcome background could not be loaded.", {
          Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue)
        });
        return null;
      });
    }

    if (!/^https?:\/\//iu.test(TrimmedSource)) {
      return null;
    }

    return await loadImage(TrimmedSource).catch((ErrorValue: unknown) => {
      this.Logger.Warn("Remote welcome background could not be loaded.", {
        Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue)
      });
      return null;
    });
  }

  private DrawFittedImage(Context: SKRSContext2D, ImageValue: Image, X: number, Y: number, Width: number, Height: number, Fit: ImageFitMode): void {
    if (Fit === "Stretch") {
      Context.drawImage(ImageValue, X, Y, Width, Height);
      return;
    }

    const ImageWidth = ImageValue.width;
    const ImageHeight = ImageValue.height;
    const Scale = Fit === "Contain" ? Math.min(Width / ImageWidth, Height / ImageHeight) : Math.max(Width / ImageWidth, Height / ImageHeight);
    const DrawWidth = ImageWidth * Scale;
    const DrawHeight = ImageHeight * Scale;
    const DrawX = X + (Width - DrawWidth) / 2;
    const DrawY = Y + (Height - DrawHeight) / 2;

    Context.drawImage(ImageValue, DrawX, DrawY, DrawWidth, DrawHeight);
  }

  private async LoadMemberAvatar(Member: GuildMember | PartialGuildMember): Promise<Image | null> {
    const AvatarUrl = Member.user.displayAvatarURL({ extension: "png", size: 256, forceStatic: true });

    return await loadImage(AvatarUrl).catch((ErrorValue: unknown) => {
      this.Logger.Warn("Avatar image could not be loaded for welcome card.", {
        Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue),
        UserId: Member.user.id
      });
      return null;
    });
  }

  private DrawAvatar(
    Context: SKRSContext2D,
    CenterX: number,
    CenterY: number,
    Radius: number,
    Accent: string,
    Text: string,
    Initials: string,
    ShowInitialsAvatar: boolean,
    AvatarImage: Image | null,
    AvatarStyle: ImageAvatarStyle
  ): void {
    Context.save();
    this.DrawAvatarFrame(Context, CenterX, CenterY, Radius + 12, AvatarStyle, "rgba(255, 255, 255, 0.05)");
    this.DrawAvatarFrame(Context, CenterX, CenterY, Radius + 6, AvatarStyle, Accent);
    this.DrawAvatarFrame(Context, CenterX, CenterY, Radius, AvatarStyle, "rgba(2, 6, 23, 0.92)");

    if (AvatarImage) {
      Context.save();
      this.BuildAvatarPath(Context, CenterX, CenterY, Radius - 7, AvatarStyle);
      Context.clip();
      Context.imageSmoothingEnabled = true;
      Context.imageSmoothingQuality = "high";
      Context.drawImage(AvatarImage, CenterX - Radius + 7, CenterY - Radius + 7, (Radius - 7) * 2, (Radius - 7) * 2);
      Context.restore();
    } else if (ShowInitialsAvatar) {
      const AvatarGradient = Context.createLinearGradient(CenterX - Radius, CenterY - Radius, CenterX + Radius, CenterY + Radius);
      AvatarGradient.addColorStop(0, Accent);
      AvatarGradient.addColorStop(1, "rgba(15, 23, 42, 0.82)");
      this.DrawAvatarFrame(Context, CenterX, CenterY, Radius - 7, AvatarStyle, AvatarGradient);
      Context.font = this.FormatFont(38, 900);
      Context.fillStyle = Text;
      Context.textAlign = "center";
      Context.textBaseline = "middle";
      Context.fillText(Initials, CenterX, CenterY + 2);
      Context.textAlign = "start";
      Context.textBaseline = "alphabetic";
    }

    Context.restore();
  }

  private DrawAvatarFrame(Context: SKRSContext2D, CenterX: number, CenterY: number, Radius: number, AvatarStyle: ImageAvatarStyle, FillStyle: SKRSContext2D["fillStyle"]): void {
    this.BuildAvatarPath(Context, CenterX, CenterY, Radius, AvatarStyle);
    Context.fillStyle = FillStyle;
    Context.fill();
  }

  private BuildAvatarPath(Context: SKRSContext2D, CenterX: number, CenterY: number, Radius: number, AvatarStyle: ImageAvatarStyle): void {
    if (AvatarStyle === "Circle") {
      Context.beginPath();
      Context.arc(CenterX, CenterY, Radius, 0, Math.PI * 2);
      return;
    }

    const Size = Radius * 2;
    const RadiusValue = AvatarStyle === "Rounded" ? Math.max(12, Radius * 0.25) : 4;
    this.BuildRoundedRectPath(Context, CenterX - Radius, CenterY - Radius, Size, Size, RadiusValue);
  }

  private DrawCircle(Context: SKRSContext2D, CenterX: number, CenterY: number, Radius: number, FillStyle: SKRSContext2D["fillStyle"]): void {
    Context.beginPath();
    Context.arc(CenterX, CenterY, Radius, 0, Math.PI * 2);
    Context.fillStyle = FillStyle;
    Context.fill();
  }

  private DrawBadge(Context: SKRSContext2D, X: number, Y: number, Text: string, Accent: string): void {
    Context.font = this.FormatFont(13, 700);
    const Width = Math.min(240, Math.max(86, Context.measureText(Text).width + 28));
    this.DrawRoundedRect(Context, X, Y, Width, 30, 15, this.ApplyCssOpacity(Accent, 0.18));
    Context.strokeStyle = this.ApplyCssOpacity(Accent, 0.75);
    Context.lineWidth = 1.5;
    this.StrokeRoundedRect(Context, X, Y, Width, 30, 15);
    Context.fillStyle = Accent;
    Context.fillText(this.TruncateText(Context, Text, Width - 28, 13, 700), X + 14, Y + 20);
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

  private FillTextBlock(Context: SKRSContext2D, Options: PngTextBlock): void {
    Context.font = this.FormatFont(Options.FontSize, Options.FontWeight);
    Context.fillStyle = Options.Color;

    for (let Index = 0; Index < Options.Lines.length; Index += 1) {
      Context.fillText(Options.Lines[Index], Options.X, Options.Y + Index * Options.LineHeight);
    }
  }

  private WrapText(Context: SKRSContext2D, Text: string, MaxWidth: number, FontSize: number, FontWeight: number, MaxLines: number): string[] {
    Context.font = this.FormatFont(FontSize, FontWeight);
    const Words = this.NormalizeCardText(Text).split(" ").filter(Boolean);
    const Lines: string[] = [];
    let CurrentLine = "";

    for (const Word of Words) {
      const WordParts = this.SplitOversizedWord(Context, Word, MaxWidth, FontSize, FontWeight);

      for (const WordPart of WordParts) {
        const CandidateLine = CurrentLine ? `${CurrentLine} ${WordPart}` : WordPart;

        if (Context.measureText(CandidateLine).width <= MaxWidth) {
          CurrentLine = CandidateLine;
          continue;
        }

        if (CurrentLine) {
          Lines.push(CurrentLine);
        }

        CurrentLine = WordPart;

        if (Lines.length === MaxLines) {
          break;
        }
      }

      if (Lines.length === MaxLines) {
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

  private SplitOversizedWord(Context: SKRSContext2D, Word: string, MaxWidth: number, FontSize: number, FontWeight: number): string[] {
    Context.font = this.FormatFont(FontSize, FontWeight);

    if (Context.measureText(Word).width <= MaxWidth) {
      return [Word];
    }

    const Parts: string[] = [];
    let CurrentPart = "";

    for (const Character of Word) {
      const CandidatePart = `${CurrentPart}${Character}`;

      if (Context.measureText(CandidatePart).width <= MaxWidth) {
        CurrentPart = CandidatePart;
        continue;
      }

      if (CurrentPart) {
        Parts.push(CurrentPart);
      }

      CurrentPart = Character;
    }

    if (CurrentPart) {
      Parts.push(CurrentPart);
    }

    return Parts;
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

  private ResolveAdaptiveFontSize(Text: string, MaxFontSize: number, MinFontSize: number, ShortTextLength: number, LongTextLength: number): number {
    const NormalizedLength = this.NormalizeCardText(Text).length;

    if (NormalizedLength <= ShortTextLength) {
      return MaxFontSize;
    }

    if (NormalizedLength >= LongTextLength) {
      return MinFontSize;
    }

    const Ratio = (NormalizedLength - ShortTextLength) / (LongTextLength - ShortTextLength);
    return Math.round(MaxFontSize - (MaxFontSize - MinFontSize) * Ratio);
  }

  private ClampPercent(Value: number, Fallback: number): number {
    return this.ClampNumber(Value, 0, 100, Fallback);
  }

  private ClampNumber(Value: number, Minimum: number, Maximum: number, Fallback: number): number {
    return Number.isFinite(Value) ? Math.min(Maximum, Math.max(Minimum, Number(Value))) : Fallback;
  }

  private FormatFont(FontSize: number, FontWeight: number): string {
    const SafeWeight = FontWeight >= 700 ? "bold" : FontWeight >= 600 ? "600" : "normal";
    return `${SafeWeight} ${FontSize}px "DejaVu Sans", "Noto Sans", "Liberation Sans", sans-serif`;
  }

  public WarnIfCanvasFontsAreMissing(): void {
    const RequiredFontFamilies = ["DejaVu Sans", "Noto Sans", "Liberation Sans"];

    if (RequiredFontFamilies.some((FontFamily) => GlobalFonts.has(FontFamily))) {
      return;
    }

    this.Logger.Warn("No expected canvas font family is available. Welcome image cards may render without text.", {
      ExpectedFontFamilies: RequiredFontFamilies,
      AvailableFontFamilies: GlobalFonts.families.slice(0, 12).map((FontFamily) => FontFamily.family)
    });
  }

  private NormalizeCardText(Text: string): string {
    return Text.replace(/[`*_~|>#]/gu, "").replace(/\s+/gu, " ").trim();
  }

  private ToCssColor(Color: PngColor): string {
    return `rgba(${Color.Red}, ${Color.Green}, ${Color.Blue}, ${Color.Alpha / 255})`;
  }

  private ApplyCssOpacity(Color: string, Opacity: number): string {
    const Match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/iu.exec(Color);

    if (!Match) {
      return Color;
    }

    return `rgba(${Match[1]}, ${Match[2]}, ${Match[3]}, ${Opacity})`;
  }


  private HexToRgb(ColorValue: string): PngColor {
    const SafeColor = this.SanitizeColor(ColorValue, "#020617").replace("#", "");
    return {
      Red: Number.parseInt(SafeColor.slice(0, 2), 16),
      Green: Number.parseInt(SafeColor.slice(2, 4), 16),
      Blue: Number.parseInt(SafeColor.slice(4, 6), 16),
      Alpha: 255
    };
  }

  private SanitizeColor(ColorValue: string, Fallback: string): string {
    return /^#[0-9a-f]{6}$/iu.test(ColorValue) ? ColorValue : Fallback;
  }

  private BuildInitials(Username: string): string {
    const CleanUsername = Username.replace(/[^a-z0-9]/giu, "").toUpperCase();
    return (CleanUsername.slice(0, 2) || "HB").padEnd(2, " ");
  }
}
