import { createElement, type ReactNode } from "react";
import {
  RenderSatoriToPng,
  HexToRgb,
  Rgba
} from "../../src/Core/ImageGenerator.js";

export type AskYesImageOptions = {
  AccentColor: string;
  Answer: "YES" | "NO";
  MentionHighlights?: AskYesMentionHighlight[];
  NoLabel: string;
  Question: string;
  Title: string;
  YesLabel: string;
};

export type AskYesMentionHighlight = {
  UserId: string;
  Username: string;
};

type InlineTextToken = {
  Highlight: boolean;
  Text: string;
};

const H = createElement;
const SatoriFontFamily = "DejaVu Sans";

export class DiscordAskYesRenderer {
  public async BuildAskYesImage(Options: AskYesImageOptions): Promise<Buffer> {
    const Width = 1000;
    const Height = 420;
    return await RenderSatoriToPng(
      this.BuildAskYesElement(Options),
      Width,
      Height
    );
  }

  private BuildAskYesElement(Options: AskYesImageOptions): ReactNode {
    const Accent = this.SanitizeColor(Options.AccentColor, "#38bdf8");
    const AccentRgb = HexToRgb(Accent);
    const AnswerLabel = Options.Answer === "YES" ? Options.YesLabel : Options.NoLabel;
    const QuestionLines = this.TokenizeAndWrapQuestion(Options.Question, Options.MentionHighlights ?? []);

    return H("div", {
      style: {
        width: 1000,
        height: 420,
        display: "flex",
        position: "relative",
        overflow: "hidden",
        fontFamily: SatoriFontFamily,
        color: "#f8fafc"
      },
      children: [
        H("div", {
          key: "bg",
          style: {
            position: "absolute",
            left: 0,
            top: 0,
            width: 1000,
            height: 420,
            background: `linear-gradient(135deg, #020617 0%, ${Options.Answer === "YES" ? "#063a31" : "#3f1720"} 55%, #111827 100%)`
          }
        }),
        H("div", {
          key: "glow",
          style: {
            position: "absolute",
            left: 260,
            top: -30,
            width: 480,
            height: 480,
            borderRadius: 240,
            background: `radial-gradient(circle, ${Rgba(AccentRgb, 0.2)} 0%, transparent 100%)`
          }
        }),
        H("div", {
          key: "card",
          style: {
            position: "absolute",
            left: 54,
            top: 46,
            width: 892,
            height: 328,
            borderRadius: 34,
            border: `2px solid ${Rgba(AccentRgb, 0.55)}`,
            backgroundColor: "rgba(15, 23, 42, 0.76)"
          }
        }),
        H("div", {
          key: "title",
          style: {
            position: "absolute",
            left: 74,
            top: 92,
            width: 852,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            fontSize: 28,
            fontWeight: 900,
            color: "#ffffff"
          },
          children: this.TruncatePlainText(Options.Title, 40)
        }),
        this.BuildQuestionElement(QuestionLines, AccentRgb),
        H("div", {
          key: "answer",
          style: {
            position: "absolute",
            left: 330,
            top: 280,
            width: 340,
            height: 74,
            borderRadius: 24,
            backgroundColor: Options.Answer === "YES" ? "#22c55e" : "#ef4444",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          },
          children: H("div", {
            style: {
              fontSize: 42,
              fontWeight: 900,
              color: "#ffffff",
              textAlign: "center"
            },
            children: AnswerLabel.toUpperCase()
          })
        })
      ]
    });
  }

  private BuildQuestionElement(Lines: InlineTextToken[][], AccentRgb: { R: number; G: number; B: number }): ReactNode {
    return H("div", {
      key: "question",
      style: {
        position: "absolute",
        left: 110,
        top: 144,
        width: 780,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8
      },
      children: Lines.map((Line, LineIndex) =>
        H("div", {
          key: `ql-${LineIndex}`,
          style: {
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            alignItems: "center"
          },
          children: Line.map((Token, TokenIndex) =>
            Token.Highlight
              ? H("div", {
                key: `qt-${LineIndex}-${TokenIndex}`,
                style: {
                  paddingLeft: 10,
                  paddingRight: 10,
                  paddingTop: 4,
                  paddingBottom: 4,
                  borderRadius: 7,
                  backgroundColor: "rgba(88, 101, 242, 0.34)",
                  color: "#dbeafe",
                  fontSize: 30,
                  fontWeight: 700,
                  marginRight: 4,
                  marginBottom: 2
                },
                children: Token.Text
              })
              : H("span", {
                key: `qt-${LineIndex}-${TokenIndex}`,
                style: {
                  color: "#e2e8f0",
                  fontSize: 30,
                  fontWeight: 700,
                  marginRight: 4
                },
                children: Token.Text
              })
          )
        })
      )
    });
  }

  private TokenizeAndWrapQuestion(Text: string, Mentions: AskYesMentionHighlight[]): InlineTextToken[][] {
    const Tokens = this.TokenizeInlineText(Text, Mentions);
    const Lines: InlineTextToken[][] = [];
    let CurrentLine: InlineTextToken[] = [];
    let CurrentCharCount = 0;
    const MaxCharsPerLine = 35;
    const MaxLines = 3;

    for (const Token of Tokens) {
      const IsWhitespace = Token.Text.trim() === "";

      if (IsWhitespace && CurrentLine.length === 0) {
        continue;
      }

      if (!IsWhitespace && CurrentLine.length > 0 && CurrentCharCount + Token.Text.length > MaxCharsPerLine) {
        Lines.push(CurrentLine);
        if (Lines.length >= MaxLines) {
          const LastLine = Lines[Lines.length - 1];
          if (LastLine.length > 0) {
            const LastToken = LastLine[LastLine.length - 1];
            LastToken.Text = this.TruncatePlainText(LastToken.Text, Math.max(3, MaxCharsPerLine - 3));
            if (LastToken.Text.endsWith("...")) {
              LastToken.Highlight = false;
            }
          }
          return Lines;
        }
        CurrentLine = [];
        CurrentCharCount = 0;
      }

      CurrentLine.push({ ...Token });
      CurrentCharCount += Token.Text.length;
    }

    if (CurrentLine.length > 0 && Lines.length < MaxLines) {
      Lines.push(CurrentLine);
    }

    if (Lines.length === 0) {
      Lines.push([{ Highlight: false, Text: "" }]);
    }

    const LastVisibleLine = Lines[Lines.length - 1];
    if (LastVisibleLine.length > 0) {
      const LastToken = LastVisibleLine[LastVisibleLine.length - 1];
      LastToken.Text = this.TruncatePlainText(LastToken.Text, MaxCharsPerLine);
    }

    return Lines;
  }

  private TokenizeInlineText(Text: string, Mentions: AskYesMentionHighlight[]): InlineTextToken[] {
    const MentionUsernames = new Map(Mentions.map((Mention) => [Mention.UserId, Mention.Username]));
    const Tokens: InlineTextToken[] = [];
    const MentionPattern = /<@!?(\d{17,20})>/gu;
    let LastIndex = 0;

    for (const Match of Text.matchAll(MentionPattern)) {
      if (Match.index > LastIndex) {
        Tokens.push(...this.TokenizePlainText(Text.slice(LastIndex, Match.index)));
      }

      const Username = MentionUsernames.get(Match[1]);
      Tokens.push({
        Highlight: Username !== undefined,
        Text: Username ? `@${Username}` : Match[0]
      });
      LastIndex = Match.index + Match[0].length;
    }

    if (LastIndex < Text.length) {
      Tokens.push(...this.TokenizePlainText(Text.slice(LastIndex)));
    }

    return Tokens.length > 0 ? Tokens : [{ Highlight: false, Text: "" }];
  }

  private TokenizePlainText(Text: string): InlineTextToken[] {
    return (Text.replace(/\s+/gu, " ").match(/\s+|[^\s]+/gu) ?? [])
      .map((Token) => ({ Highlight: false, Text: Token }));
  }

  private TruncatePlainText(Value: string, MaxLength: number): string {
    if (Value.length <= MaxLength) {
      return Value;
    }

    return `${Value.slice(0, Math.max(1, MaxLength - 3)).trimEnd()}...`;
  }

  private SanitizeColor(ColorValue: string, Fallback: string): string {
    return /^#[0-9a-f]{6}$/iu.test(ColorValue) ? ColorValue : Fallback;
  }
}
