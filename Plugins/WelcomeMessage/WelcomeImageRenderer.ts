import { createElement, type ReactNode } from "react";
import type { GuildMember, PartialGuildMember } from "discord.js";
import {
  RenderSatoriToPng,
  HexToRgb,
  RgbToHex,
  MixRgb,
  Rgba,
  FetchImageAsDataUri,
  type RgbColor
} from "../../src/Core/ImageGenerator.js";

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

type WelcomeBuildOptions = {
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
};

type WelcomeAssets = {
  BackgroundImageDataUri: string | null;
  AvatarDataUri: string | null;
};

const H = createElement;
const SatoriFontFamily = "DejaVu Sans";

export class WelcomeImageRenderer {
  public constructor(private readonly Logger: WelcomeImageLogger) {}

  public async BuildWelcomePng(Options: WelcomeBuildOptions): Promise<Buffer> {
    const Width = 1000;
    const Height = 320;
    const AccentColor = HexToRgb(this.SanitizeColor(Options.AccentColor, "#38bdf8"));
    const Accent = RgbToHex(AccentColor);
    const BackgroundColor = HexToRgb(this.SanitizeColor(Options.BackgroundColor, "#020617"));
    const Background = RgbToHex(BackgroundColor);
    const Text = this.SanitizeColor(Options.TextColor, "#f8fafc");
    const MutedText = this.SanitizeColor(Options.MutedTextColor, "#cbd5e1");
    const PanelOpacity = this.ClampPercent(Options.PanelOpacity, 86) / 100;
    const DarkPanelColor = `rgba(2, 6, 23, ${PanelOpacity})`;
    const Username = `${Options.Member.user.username}#${String(Options.Member.user.discriminator).padStart(4, "0")}`;
    const Initials = this.BuildInitials(Options.Member.user.username);
    const AvatarRadius = this.ClampNumber(Options.AvatarSize, 64, 190, 140) / 2;
    const Assets = await this.BuildAssets(Options, AvatarRadius);

    const TitleFontSize = this.ResolveAdaptiveFontSize(
      Options.Title, this.ClampNumber(Options.TitleFontSize, 20, 58, 40), 17, 44, 92
    );
    const TitleLineHeight = Math.round(TitleFontSize * 1.45);
    const TitleLines = this.WrapText(Options.Title, 690, TitleFontSize, 2);

    const DescriptionFontSize = this.ResolveAdaptiveFontSize(
      Options.Description, this.ClampNumber(Options.DescriptionFontSize, 11, 26, 15), 12, 70, 150
    );
    const DescriptionLineHeight = Math.round(DescriptionFontSize * 1.62);
    const DescriptionY = 112 + TitleLines.length * TitleLineHeight + 4;
    const DescriptionLines = this.WrapText(Options.Description, 690, DescriptionFontSize, 3);

    return await RenderSatoriToPng(
      this.BuildWelcomeElement(Options, {
        Accent, AccentColor, Background, Text, MutedText,
        DarkPanelColor, Username, Initials, AvatarRadius,
        TitleFontSize, TitleLineHeight, TitleLines,
        DescriptionFontSize, DescriptionLineHeight, DescriptionLines, DescriptionY,
        Assets
      }),
      Width, Height
    );
  }

  public ResolveImageBackgroundSource(Config: WelcomeImageBackgroundConfig, Type: "Welcome" | "Leave"): string {
    const SpecificSource = Type === "Welcome" ? Config.WelcomeImageBackgroundImage : Config.LeaveImageBackgroundImage;
    return SpecificSource.trim() || Config.ImageBackgroundImage.trim();
  }

  private async BuildAssets(Options: WelcomeBuildOptions, AvatarRadius: number): Promise<WelcomeAssets> {
    const [AvatarDataUri, BackgroundImageDataUri] = await Promise.all([
      this.LoadMemberAvatar(Options.Member, AvatarRadius),
      this.LoadConfiguredImage(Options.BackgroundImageSource)
    ]);
    return { AvatarDataUri, BackgroundImageDataUri };
  }

  private async LoadMemberAvatar(Member: GuildMember | PartialGuildMember, AvatarRadius: number): Promise<string | null> {
    const AvatarUrl = Member.user.displayAvatarURL({ extension: "png", size: 256, forceStatic: true });
    const Size = Math.max(4, Math.round((AvatarRadius - 7) * 2));
    return await FetchImageAsDataUri(AvatarUrl, { Width: Size, Height: Size }).catch((ErrorValue: unknown) => {
      this.Logger.Warn("Avatar image could not be loaded for welcome card.", {
        Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue),
        UserId: Member.user.id
      });
      return null;
    });
  }

  private async LoadConfiguredImage(Source: string): Promise<string | null> {
    const TrimmedSource = Source.trim();
    if (!TrimmedSource) return null;

    if (TrimmedSource.startsWith("data:image/")) {
      return TrimmedSource;
    }

    if (!/^https?:\/\//iu.test(TrimmedSource)) return null;

    return await FetchImageAsDataUri(TrimmedSource).catch((ErrorValue: unknown) => {
      this.Logger.Warn("Remote welcome background could not be loaded.", {
        Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue)
      });
      return null;
    });
  }

  public WarnIfCanvasFontsAreMissing(): void {
  }

  private BuildWelcomeElement(
    Options: WelcomeBuildOptions,
    Layout: {
      Accent: string;
      AccentColor: RgbColor;
      Background: string;
      Text: string;
      MutedText: string;
      DarkPanelColor: string;
      Username: string;
      Initials: string;
      AvatarRadius: number;
      TitleFontSize: number;
      TitleLineHeight: number;
      TitleLines: string[];
      DescriptionFontSize: number;
      DescriptionLineHeight: number;
      DescriptionLines: string[];
      DescriptionY: number;
      Assets: WelcomeAssets;
    }
  ): ReactNode {
    const TextX = 242;
    const BadgeText = this.TruncatePlainText(this.NormalizeCardText(Options.BadgeText.replaceAll("%type%", Options.Type).toUpperCase()), 24);

    return H("div", {
      style: {
        width: 1000,
        height: 320,
        display: "flex",
        position: "relative",
        overflow: "hidden",
        fontFamily: SatoriFontFamily,
        color: "#f8fafc"
      },
      children: [
        this.BuildBackgroundLayer(Options, Layout),
        this.BuildOverlayLayer(Options, Layout),
        Options.PanelEnabled
          ? H("div", {
            key: "panel",
            style: {
              position: "absolute",
              left: 34,
              top: 34,
              width: 932,
              height: 252,
              borderRadius: 26,
              backgroundColor: Layout.DarkPanelColor,
              boxShadow: "0 10px 18px rgba(0,0,0,0.36)",
              border: `2px solid ${Rgba(Layout.AccentColor, 160 / 255)}`,
              display: "flex"
            }
          })
          : null,
        BadgeText
          ? H("div", {
            key: "badge",
            style: {
              position: "absolute",
              left: TextX,
              top: 72,
              paddingLeft: 14,
              paddingRight: 14,
              height: 30,
              borderRadius: 15,
              backgroundColor: Rgba(Layout.AccentColor, 0.18),
              border: `1.5px solid ${Rgba(Layout.AccentColor, 0.75)}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 700,
              color: Layout.Accent
            },
            children: BadgeText
          })
          : null,
        this.BuildAvatarNodeCanvas(Layout),
        this.BuildTextContentCanvas(Options, Layout),
        this.BuildFooterCanvas(Options, Layout)
      ]
    });
  }

  private BuildBackgroundLayer(Options: WelcomeBuildOptions, Layout: { Accent: string; Background: string; Assets: WelcomeAssets }): ReactNode {
    const BackgroundGradient = `linear-gradient(135deg, ${Layout.Background} 0%, #0f172a 100%)`;

    return H("div", {
      key: "bg-group",
      style: {
        position: "absolute",
        left: 0,
        top: 0,
        width: 1000,
        height: 320,
        display: "flex"
      },
      children: [
        H("div", {
          key: "bg-gradient",
          style: {
            position: "absolute",
            left: 0,
            top: 0,
            width: 1000,
            height: 320,
            background: BackgroundGradient
          }
        }),
        Layout.Assets.BackgroundImageDataUri
          ? H("img", {
            key: "bg-image",
            src: Layout.Assets.BackgroundImageDataUri,
            style: {
              position: "absolute",
              left: 0,
              top: 0,
              width: 1000,
              height: 320,
              objectFit: Options.BackgroundFit === "Cover" ? "cover" : Options.BackgroundFit === "Contain" ? "contain" : "fill",
              opacity: this.ClampPercent(Options.BackgroundOpacity, 100) / 100
            }
          })
          : null
      ]
    });
  }

  private BuildOverlayLayer(Options: WelcomeBuildOptions, _Layout: Record<string, unknown>): ReactNode {
    const OverlayOpacity = this.ClampPercent(Options.OverlayOpacity, 55) / 100;
    return H("div", {
      key: "overlay",
      style: {
        position: "absolute",
        left: 0,
        top: 0,
        width: 1000,
        height: 320,
        background: `linear-gradient(135deg, rgba(2,6,23,${OverlayOpacity}) 0%, rgba(15,23,42,${Math.min(0.9, OverlayOpacity + 0.16)}) 100%)`
      }
    });
  }

  private BuildAvatarNodeCanvas(Layout: {
    Accent: string;
    AccentColor: RgbColor;
    Initials: string;
    AvatarRadius: number;
    Assets: WelcomeAssets;
  }): ReactNode {
    const R = Layout.AvatarRadius;
    const OuterRadius = R + 12;
    const AccentRadius = R + 6;
    const InnerRadius = R;
    const ImageRadius = R - 7;

    return H("div", {
      key: "avatar",
      style: {
        position: "absolute",
        left: 134 - OuterRadius,
        top: 160 - OuterRadius,
        width: OuterRadius * 2,
        height: OuterRadius * 2,
        borderRadius: "50%",
        backgroundColor: "rgba(255, 255, 255, 0.05)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      },
      children: H("div", {
        style: {
          width: AccentRadius * 2,
          height: AccentRadius * 2,
          borderRadius: "50%",
          backgroundColor: Layout.Accent,
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        },
        children: H("div", {
          style: {
            width: InnerRadius * 2,
            height: InnerRadius * 2,
            borderRadius: "50%",
            backgroundColor: "rgba(2, 6, 23, 0.92)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          },
          children: Layout.Assets.AvatarDataUri
            ? H("img", {
              src: Layout.Assets.AvatarDataUri,
              style: {
                width: ImageRadius * 2,
                height: ImageRadius * 2,
                borderRadius: "50%"
              }
            })
            : this.BuildInitialsNode(Layout.Initials, ImageRadius * 2)
        })
      })
    });
  }

  private BuildInitialsNode(Initials: string, Size: number): ReactNode {
    return H("div", {
      style: {
        width: Size,
        height: Size,
        borderRadius: "50%",
        background: `linear-gradient(135deg, #38bdf8, rgba(15,23,42,0.82))`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 38,
        fontWeight: 900,
        color: "#ffffff"
      },
      children: Initials
    });
  }

  private BuildTextContentCanvas(
    Options: WelcomeBuildOptions,
    Layout: {
      Text: string;
      MutedText: string;
      TitleFontSize: number;
      TitleLineHeight: number;
      TitleLines: string[];
      DescriptionFontSize: number;
      DescriptionLineHeight: number;
      DescriptionLines: string[];
      DescriptionY: number;
    }
  ): ReactNode {
    const TextX = 242;
    return H("div", {
      key: "text-content",
      style: {
        position: "absolute",
        left: TextX,
        top: 34,
        width: 690,
        display: "flex",
        flexDirection: "column"
      },
      children: [
        this.BuildTitleBlock(Layout, TextX),
        this.BuildDescriptionBlock(Layout, TextX)
      ]
    });
  }

  private BuildTitleBlock(
    Layout: {
      Text: string;
      TitleFontSize: number;
      TitleLineHeight: number;
      TitleLines: string[];
    },
    _TextX: number
  ): ReactNode {
    return H("div", {
      key: "title",
      style: {
        position: "absolute",
        left: 0,
        top: 78,
        display: "flex",
        flexDirection: "column"
      },
      children: Layout.TitleLines.map((Line, Index) =>
        H("div", {
          key: `tl-${Index}`,
          style: {
            fontSize: Layout.TitleFontSize,
            fontWeight: 700,
            lineHeight: `${Layout.TitleLineHeight}px`,
            color: Layout.Text,
            overflow: "hidden"
          },
          children: Line
        })
      )
    });
  }

  private BuildDescriptionBlock(
    Layout: {
      MutedText: string;
      DescriptionFontSize: number;
      DescriptionLineHeight: number;
      DescriptionLines: string[];
      DescriptionY: number;
    },
    _TextX: number
  ): ReactNode {
    return H("div", {
      key: "description",
      style: {
        position: "absolute",
        left: 0,
        top: Layout.DescriptionY - 34,
        display: "flex",
        flexDirection: "column"
      },
      children: Layout.DescriptionLines.map((Line, Index) =>
        H("div", {
          key: `dl-${Index}`,
          style: {
            fontSize: Layout.DescriptionFontSize,
            fontWeight: 400,
            lineHeight: `${Layout.DescriptionLineHeight}px`,
            color: Layout.MutedText,
            overflow: "hidden"
          },
          children: Line
        })
      )
    });
  }

  private BuildFooterCanvas(Options: WelcomeBuildOptions, Layout: { Username: string }): ReactNode {
    const TextX = 242;
    return H("div", {
      key: "footer",
      style: {
        position: "absolute",
        left: TextX,
        top: 260,
        width: 690,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      },
      children: [
        H("div", {
          key: "username",
          style: {
            fontSize: 11,
            fontWeight: 600,
            color: "rgba(148, 163, 184, 0.94)"
          },
          children: this.TruncatePlainText(Layout.Username, 40)
        }),
        Options.Footer
          ? H("div", {
            key: "footer-text",
            style: {
              fontSize: 11,
              fontWeight: 400,
              color: "rgba(148, 163, 184, 0.86)"
            },
            children: this.TruncatePlainText(this.NormalizeCardText(Options.Footer), 50)
          })
          : null
      ]
    });
  }

  private WrapText(Text: string, MaxWidth: number, FontSize: number, MaxLines: number): string[] {
    const Words = this.NormalizeCardText(Text).split(" ").filter(Boolean);
    const Lines: string[] = [];
    let CurrentLine = "";
    const CharWidth = Math.max(5, FontSize * 0.6);
    const MaxCharsPerLine = Math.max(1, Math.floor(MaxWidth / CharWidth));

    for (const Word of Words) {
      const WordParts = this.SplitOversizedWord(Word, MaxCharsPerLine);

      for (const WordPart of WordParts) {
        const CandidateLine = CurrentLine ? `${CurrentLine} ${WordPart}` : WordPart;

        if (CandidateLine.length <= MaxCharsPerLine) {
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
    Lines[LastIndex] = this.TruncatePlainText(Lines[LastIndex], MaxCharsPerLine);
    return Lines;
  }

  private SplitOversizedWord(Word: string, MaxCharsPerLine: number): string[] {
    if (Word.length <= MaxCharsPerLine) {
      return [Word];
    }

    const Parts: string[] = [];
    for (let Index = 0; Index < Word.length; Index += MaxCharsPerLine) {
      Parts.push(Word.slice(Index, Index + MaxCharsPerLine));
    }

    return Parts;
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

  private NormalizeCardText(Text: string): string {
    return Text.replace(/[`*_~|>#]/gu, "").replace(/\s+/gu, " ").trim();
  }

  private TruncatePlainText(Value: string, MaxLength: number): string {
    if (Value.length <= MaxLength) {
      return Value;
    }

    return `${Value.slice(0, Math.max(1, MaxLength - 3)).trimEnd()}...`;
  }

  private BuildInitials(Username: string): string {
    const CleanUsername = Username.replace(/[^a-z0-9]/giu, "").toUpperCase();
    return (CleanUsername.slice(0, 2) || "HB").padEnd(2, " ");
  }

  private SanitizeColor(ColorValue: string, Fallback: string): string {
    return /^#[0-9a-f]{6}$/iu.test(ColorValue) ? ColorValue : Fallback;
  }
}
