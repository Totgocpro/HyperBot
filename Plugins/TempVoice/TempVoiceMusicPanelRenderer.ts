import { createElement, type ReactNode } from "react";
import {
  RenderSatoriToPng,
  BuildBackgroundDataUri,
  FetchImageAsDataUri
} from "../../src/Core/ImageGenerator.js";
import type { TempVoiceMusicState } from "./TempVoiceMusicPlayer.js";
import { SourceInfo } from "./TempVoiceMusicResolver.js";

type TempVoiceMusicPanelLogger = {
  Warn(Message: string, Metadata?: unknown): void;
};

type TempVoiceMusicPanelRenderOptions = {
  HideTiming?: boolean;
};

type PanelSourceAssets = {
  LogoDataUri: string | null;
  Name: string;
  Label: string;
  Color: string;
};

type PanelAssets = {
  Current: PanelSourceAssets;
  All: Map<string, PanelSourceAssets>;
};

const LogoDataUriCache = new Map<string, Promise<string | null>>();
const H = createElement;
const SatoriFontFamily = "DejaVu Sans";

export class TempVoiceMusicPanelRenderer {
  private readonly ThumbnailCache = new Map<string, Promise<string | null>>();

  public constructor(private readonly Logger: TempVoiceMusicPanelLogger) {}

  public async BuildPanelImage(State: TempVoiceMusicState, Options: TempVoiceMusicPanelRenderOptions = {}): Promise<Buffer> {
    const Width = 1200;
    const Height = 560;
    const QueueSources = State.Queue.map((T) => T.Source);
    const [ThumbnailUri, Assets] = await Promise.all([
      this.LoadThumbnail(State.TrackThumbnailUrl),
      this.LoadAllAssets(State.Source, QueueSources)
    ]);
    const Progress = !Options.HideTiming && State.DurationSeconds && State.DurationSeconds > 0
      ? Math.min(State.PositionSeconds / State.DurationSeconds, 1)
      : 0;

    return await RenderSatoriToPng(
      this.BuildPanelElement(State, Options, ThumbnailUri, Assets, Progress),
      Width,
      Height
    );
  }

  private async LoadAllAssets(Source: string, QueueSources: string[]): Promise<PanelAssets> {
    const UniqueSources = [Source, ...QueueSources].filter((S, I, A) => A.indexOf(S) === I);
    const Entries = await Promise.all(UniqueSources.map(async (Src) => {
      const Info = SourceInfo[Src] ?? { label: "MU", logoUrl: "", color: "#64748B", name: "Music" };
      const LogoDataUri = Info.logoUrl ? await this.LoadLogo(Info.logoUrl) : null;
      return [Src, { LogoDataUri, Name: Info.name, Label: Info.label, Color: Info.color } as PanelSourceAssets];
    }));
    const All = new Map(Entries as [string, PanelSourceAssets][]);
    return {
      Current: All.get(Source)!,
      All
    };
  }

  private async LoadThumbnail(ThumbnailUrl: string): Promise<string | null> {
    const SafeUrl = ThumbnailUrl.trim();

    if (!SafeUrl) {
      return null;
    }

    const Existing = this.ThumbnailCache.get(SafeUrl);

    if (Existing) {
      return await Existing;
    }

    const Pending = FetchImageAsDataUri(SafeUrl, { Width: 520, Height: 292 }).catch((ErrorValue: unknown) => {
      this.Logger.Warn("TempVoice music panel thumbnail could not be loaded.", {
        Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue),
        ThumbnailUrl: SafeUrl,
      });
      return null;
    });

    this.ThumbnailCache.set(SafeUrl, Pending);
    return await Pending;
  }

  private async LoadLogo(LogoUrl: string): Promise<string | null> {
    const Existing = LogoDataUriCache.get(LogoUrl);
    if (Existing) return await Existing;

    const Pending = FetchImageAsDataUri(LogoUrl, { Width: 24, Height: 24 }).catch(() => null);
    LogoDataUriCache.set(LogoUrl, Pending);
    return await Pending;
  }

  private BuildPanelElement(
    State: TempVoiceMusicState,
    Options: TempVoiceMusicPanelRenderOptions,
    ThumbnailUri: string | null,
    Assets: PanelAssets,
    Progress: number
  ): ReactNode {
    const AccentColor = "#ef4444";
    const BackgroundUri = BuildBackgroundDataUri(1200, 560, AccentColor);

    return H("div", {
      style: {
        width: 1200,
        height: 560,
        position: "relative",
        overflow: "hidden",
        display: "flex",
        fontFamily: SatoriFontFamily,
        color: "#f8fafc",
        backgroundColor: "#0f172a"
      },
      children: [
        H("img", {
          key: "bg",
          src: BackgroundUri,
          style: { position: "absolute", left: 0, top: 0, width: 1200, height: 560 }
        }),
        this.BuildSourceBadge(Assets),
        this.BuildThumbnailNode(ThumbnailUri, Assets),
        this.BuildTrackInfoNode(State, Options, Assets),
        this.BuildQueueNode(State, Assets),
        this.BuildProgressNode(State, Progress)
      ]
    });
  }

  private BuildSourceBadge(Assets: PanelAssets): ReactNode {
    const Src = Assets.Current;
    return H("div", {
      key: "badge",
      style: {
        position: "absolute",
        left: 54,
        top: 42,
        display: "flex",
        alignItems: "center",
        height: 42,
        paddingLeft: 12,
        paddingRight: 24,
        borderRadius: 14,
        backgroundColor: "rgba(15, 23, 42, 0.76)"
      },
      children: [
        Src.LogoDataUri
          ? H("img", {
            key: "logo",
            src: Src.LogoDataUri,
            style: { width: 24, height: 24, borderRadius: 6 }
          })
          : H("div", {
            key: "logo-fallback",
            style: {
              width: 24,
              height: 24,
              borderRadius: 6,
              backgroundColor: Src.Color,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              fontWeight: 700,
              color: "#ffffff"
            },
            children: Src.Label
          }),
        H("div", {
          key: "name",
          style: {
            marginLeft: 12,
            fontSize: 20,
            fontWeight: 700,
            color: "#f8fafc"
          },
          children: Src.Name
        })
      ]
    });
  }

  private BuildThumbnailNode(ThumbnailUri: string | null, Assets: PanelAssets): ReactNode {
    const Src = Assets.Current;
    const X = 54;
    const Y = 104;
    const ThumbWidth = 520;
    const ThumbHeight = 292;

    return H("div", {
      key: "thumbnail",
      style: {
        position: "absolute",
        left: X - 4,
        top: Y - 4,
        width: ThumbWidth + 8,
        height: ThumbHeight + 8,
        borderRadius: 22,
        backgroundColor: "rgba(255, 255, 255, 0.08)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      },
      children: H("div", {
        style: {
          width: ThumbWidth,
          height: ThumbHeight,
          borderRadius: 18,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#020617"
        },
        children: ThumbnailUri
          ? H("img", {
            src: ThumbnailUri,
            style: { width: ThumbWidth, height: ThumbHeight, borderRadius: 18 }
          })
          : H("div", {
            style: {
              width: ThumbWidth,
              height: ThumbHeight,
              borderRadius: 18,
              background: `linear-gradient(135deg, #1e293b, ${Src.Color}55)`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 28,
              fontWeight: 800,
              color: "rgba(248, 250, 252, 0.24)"
            },
            children: Src.Name
          })
      })
    });
  }

  private BuildTrackInfoNode(State: TempVoiceMusicState, Options: TempVoiceMusicPanelRenderOptions, Assets: PanelAssets): ReactNode {
    const Src = Assets.Current;
    const X = 610;
    const Y = 104;
    const MaxWidth = 526;

    const TrackInfoChildren: ReactNode[] = [
      H("div", {
        key: "title",
        style: {
          fontSize: 36,
          fontWeight: 800,
          lineHeight: 1.2,
          color: "#f8fafc",
          overflow: "hidden",
          maxHeight: 86
        },
        children: this.TruncatePlainText(State.TrackTitle || "No track", 55)
      })
    ];

    if (State.TrackAuthor) {
      TrackInfoChildren.push(H("div", {
        key: "author",
        style: {
          fontSize: 20,
          fontWeight: 700,
          color: "#cbd5e1",
          marginTop: 12
        },
        children: `by ${this.TruncatePlainText(State.TrackAuthor, 40)}`
      }));
    }

    const SrcIconSize = 18;
    const StatusChildren: ReactNode[] = [
      Src.LogoDataUri
        ? H("img", {
          key: "src-icon",
          src: Src.LogoDataUri,
          style: { width: SrcIconSize, height: SrcIconSize, borderRadius: 4, marginRight: 8 }
        })
        : H("div", {
          key: "src-fallback",
          style: {
            width: SrcIconSize,
            height: SrcIconSize,
            borderRadius: 4,
            backgroundColor: Src.Color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 9,
            fontWeight: 700,
            color: "#ffffff",
            marginRight: 8
          },
          children: Src.Label
        }),
      H("span", {
        key: "status-text",
        children: State.Paused ? "Paused" : "Playing now"
      })
    ];

    if (!Options.HideTiming) {
      StatusChildren.push(H("span", {
        key: "timing",
        style: { color: "#94a3b8", marginLeft: 12, fontWeight: 700 },
        children: `${this.FormatDuration(State.PositionSeconds)} / ${this.FormatDuration(State.DurationSeconds)}`
      }));
    }

    TrackInfoChildren.push(H("div", {
      key: "status",
      style: {
        fontSize: 18,
        fontWeight: 700,
        color: State.Paused ? "#fbbf24" : "#22c55e",
        marginTop: 8,
        display: "flex"
      },
      children: StatusChildren
    }));

    return H("div", {
      key: "track-info",
      style: {
        position: "absolute",
        left: X,
        top: Y,
        width: MaxWidth,
        display: "flex",
        flexDirection: "column"
      },
      children: TrackInfoChildren
    });
  }

  private BuildQueueNode(State: TempVoiceMusicState, Assets: PanelAssets): ReactNode {
    const X = 610;
    const Y = 258;
    const Width = 526;
    const Height = 190;
    const VisibleQueue = State.Queue.slice(0, 4);

    const QueueChildren: ReactNode[] = [
      H("div", {
        key: "queue-header",
        style: {
          fontSize: 20,
          fontWeight: 800,
          color: "#e2e8f0"
        },
        children: "Next tracks"
      })
    ];

    if (VisibleQueue.length === 0) {
      QueueChildren.push(H("div", {
        key: "empty",
        style: {
          fontSize: 18,
          fontWeight: 600,
          color: "#64748b",
          marginTop: 28
        },
        children: "Waitlist is empty"
      }));
    } else {
      for (let Index = 0; Index < VisibleQueue.length; Index += 1) {
        const Track = VisibleQueue[Index];
        const TrackSrc = Assets.All.get(Track.Source) ?? Assets.Current;
        const IconSize = 20;
        QueueChildren.push(H("div", {
          key: `q-${Index}`,
          style: {
            display: "flex",
            alignItems: "center",
            marginTop: Index === 0 ? 22 : 8,
            fontSize: 18,
            fontWeight: 700
          },
          children: [
            H("span", {
              key: "num",
              style: { color: "#94a3b8", marginRight: 8, minWidth: 28 },
              children: `${Index + 1}.`
            }),
            TrackSrc.LogoDataUri
              ? H("img", {
                key: "src-icon",
                src: TrackSrc.LogoDataUri,
                style: { width: IconSize, height: IconSize, borderRadius: 4, marginRight: 8 }
              })
              : H("div", {
                key: "src-fallback",
                style: {
                  width: IconSize,
                  height: IconSize,
                  borderRadius: 4,
                  backgroundColor: TrackSrc.Color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#ffffff",
                  marginRight: 8
                },
                children: TrackSrc.Label
              }),
            H("span", {
              key: "title",
              style: { color: "#f8fafc", flex: 1, overflow: "hidden" },
              children: this.TruncatePlainText(Track.Title, 24)
            })
          ]
        }));
      }
      if (State.Queue.length > VisibleQueue.length) {
        QueueChildren.push(H("div", {
          key: "more",
          style: {
            fontSize: 15,
            fontWeight: 700,
            color: "#64748b",
            position: "absolute",
            bottom: 15,
            left: 22
          },
          children: `+${State.Queue.length - VisibleQueue.length} more`
        }));
      }
    }

    return H("div", {
      key: "queue",
      style: {
        position: "absolute",
        left: X,
        top: Y,
        width: Width,
        height: Height,
        borderRadius: 18,
        backgroundColor: "rgba(15, 23, 42, 0.68)",
        display: "flex",
        flexDirection: "column",
        padding: "18px 22px"
      },
      children: QueueChildren
    });
  }

  private BuildProgressNode(State: TempVoiceMusicState, Progress: number): ReactNode {
    const X = 54;
    const Y = 462;
    const Width = 1082;
    const BarHeight = 22;
    const FillColor = State.Paused ? "#f59e0b" : "#ef4444";
    const FillWidth = Math.max(BarHeight, Width * Progress);

    return H("div", {
      key: "progress",
      style: {
        position: "absolute",
        left: X,
        top: Y,
        width: Width,
        display: "flex",
        flexDirection: "column"
      },
      children: [
        H("div", {
          key: "bar-container",
          style: {
            width: Width,
            height: BarHeight,
            borderRadius: 11,
            backgroundColor: "rgba(15, 23, 42, 0.88)",
            position: "relative",
            overflow: "hidden",
            border: "2px solid rgba(255, 255, 255, 0.16)",
            display: "flex"
          },
          children: H("div", {
            key: "bar-fill",
            style: {
              width: FillWidth,
              height: BarHeight,
              borderRadius: 11,
              backgroundColor: FillColor
            }
          })
        }),
        H("div", {
          key: "timing",
          style: {
            display: "flex",
            justifyContent: "space-between",
            marginTop: 8,
            fontSize: 18,
            fontWeight: 700,
            color: "#cbd5e1"
          },
          children: [
            H("span", { key: "pos", children: this.FormatDuration(State.PositionSeconds) }),
            H("span", { key: "dur", children: this.FormatDuration(State.DurationSeconds) })
          ]
        })
      ]
    });
  }

  public async BuildAskMusicRequestImage(
    ThumbnailUrl: string | null,
    Source: string,
    Title: string,
    Author: string | null,
    RequesterName: string
  ): Promise<Buffer> {
    const Width = 800;
    const Height = 400;
    const AccentColor = "#ef4444";
    const Info = SourceInfo[Source] ?? { label: "MU", logoUrl: "", color: "#64748B", name: "Music" };
    const LogoDataUri = Info.logoUrl ? await this.LoadLogo(Info.logoUrl) : null;
    const ThumbnailDataUri = ThumbnailUrl ? await this.LoadAskThumbnail(ThumbnailUrl) : null;

    const CoverSize = 320;
    const InfoX = 360;
    const InfoWidth = Width - InfoX - 40;
    const BadgeColor = Info.color;

    return await RenderSatoriToPng(
      H("div", {
        style: {
          width: Width,
          height: Height,
          display: "flex",
          fontFamily: SatoriFontFamily,
          color: "#f8fafc",
          backgroundColor: "#0f172a",
          position: "relative",
          overflow: "hidden"
        },
        children: [
          H("div", {
            key: "cover",
            style: {
              width: CoverSize,
              height: Height,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              backgroundColor: "#020617",
              flexShrink: 0
            },
            children: ThumbnailDataUri
              ? H("img", {
                src: ThumbnailDataUri,
                style: { width: CoverSize, height: Height, objectFit: "cover" }
              })
              : H("div", {
                style: {
                  width: CoverSize,
                  height: Height,
                  background: `linear-gradient(135deg, #1e293b, ${BadgeColor}44)`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 48,
                  fontWeight: 800,
                  color: "rgba(248, 250, 252, 0.15)"
                },
                children: Info.name
              })
          }),
          H("div", {
            key: "info",
            style: {
              position: "absolute",
              left: InfoX,
              top: 0,
              width: InfoWidth,
              height: Height,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              paddingLeft: 0
            },
            children: [
              H("div", {
                key: "badge",
                style: {
                  display: "flex",
                  alignItems: "center",
                  marginBottom: 16
                },
                children: [
                  LogoDataUri
                    ? H("img", {
                      key: "logo",
                      src: LogoDataUri,
                      style: { width: 22, height: 22, borderRadius: 5, marginRight: 10 }
                    })
                    : H("div", {
                      key: "logo-fallback",
                      style: {
                        width: 22,
                        height: 22,
                        borderRadius: 5,
                        backgroundColor: BadgeColor,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#ffffff",
                        marginRight: 10
                      },
                      children: Info.label
                    }),
                  H("span", {
                    key: "name",
                    style: { fontSize: 16, fontWeight: 700, color: "#94a3b8" },
                    children: Info.name
                  })
                ]
              }),
              H("div", {
                key: "title",
                style: {
                  fontSize: 30,
                  fontWeight: 800,
                  lineHeight: 1.25,
                  color: "#f8fafc",
                  overflow: "hidden",
                  maxHeight: 76
                },
                children: this.TruncatePlainText(Title || "Music request", 42)
              }),
              Author
                ? H("div", {
                  key: "author",
                  style: {
                    fontSize: 18,
                    fontWeight: 700,
                    color: "#cbd5e1",
                    marginTop: 10
                  },
                  children: `by ${this.TruncatePlainText(Author, 36)}`
                })
                : null,
              H("div", {
                key: "requester",
                style: {
                  fontSize: 16,
                  fontWeight: 600,
                  color: "#64748b",
                  marginTop: 24
                },
                children: `Requested by ${RequesterName}`
              })
            ]
          })
        ]
      }),
      Width,
      Height
    );
  }

  private async LoadAskThumbnail(Url: string): Promise<string | null> {
    return await FetchImageAsDataUri(Url, { Width: 320, Height: 400 }).catch(() => null);
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

  private TruncatePlainText(Value: string, MaxLength: number): string {
    if (Value.length <= MaxLength) {
      return Value;
    }

    return `${Value.slice(0, Math.max(1, MaxLength - 3)).trimEnd()}...`;
  }
}
