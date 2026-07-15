import { accessSync, constants as FileSystemConstants } from "node:fs";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  type AudioPlayer,
  type VoiceConnection,
} from "@discordjs/voice";
import type { Guild, VoiceBasedChannel } from "discord.js";
import type { PluginLoggerContract } from "../../src/Core/Types.js";
import { TempVoiceMusicResolver, type LazyResolveResult, type TempVoiceMusicTrack } from "./TempVoiceMusicResolver.js";

type TempVoiceMusicPlayOptions = {
  YoutubeCookiesPath?: string | null;
  SpotifyClientId?: string;
  SpotifyClientSecret?: string;
};

export class TempVoiceMusicError extends Error {
  public constructor(
    Message: string,
    public readonly Debug: Record<string, unknown>,
  ) {
    super(Message);
  }
}

export class TempVoiceMusicBusyError extends Error {
  public constructor(public readonly ChannelId: string) {
    super(`Music is already playing in <#${ChannelId}>.`);
  }
}

type TempVoiceMusicSession = {
  AccumulatedPausedMs: number;
  ChannelId: string;
  Connection: VoiceConnection;
  CurrentTrack: TempVoiceMusicTrack | null;
  FfmpegProcess: ChildProcessByStdio<null, Readable, Readable> | null;
  GuildId: string;
  PausedAtMs: number | null;
  Player: AudioPlayer;
  Queue: TempVoiceMusicTrack[];
  StartedAtMs: number | null;
  YoutubeCookiesPath?: string | null;
  _backgroundAborted?: boolean;
};

export type TempVoiceMusicState = {
  Active: boolean;
  CanSkip: boolean;
  ChannelId: string;
  DurationSeconds: number | null;
  Paused: boolean;
  PositionSeconds: number;
  Queue: Array<{
    Author: string;
    DurationSeconds: number | null;
    Source: string;
    ThumbnailUrl: string;
    Title: string;
    Url: string;
    VideoId: string;
  }>;
  Source: string;
  TrackAuthor: string;
  TrackTitle: string;
  TrackThumbnailUrl: string;
  TrackUrl: string;
  TrackVideoId: string;
  Status: string;
};

export class TempVoiceMusicPlayer {
  private readonly Sessions = new Map<string, TempVoiceMusicSession>();
  private readonly Resolver: TempVoiceMusicResolver;

  public constructor(
    private readonly Logger: PluginLoggerContract,
    private readonly OnStateChanged?: (ChannelId: string) => void | Promise<void>,
  ) {
    this.Resolver = new TempVoiceMusicResolver(Logger);
  }

  public GetState(ChannelId: string): TempVoiceMusicState {
    const Session = this.Sessions.get(ChannelId);

    if (!Session?.CurrentTrack) {
      return {
        Active: false,
        CanSkip: false,
        ChannelId,
        DurationSeconds: null,
        Paused: false,
        PositionSeconds: 0,
        Queue: [],
        Source: "",
        TrackAuthor: "",
        TrackTitle: "",
        TrackThumbnailUrl: "",
        TrackUrl: "",
        TrackVideoId: "",
        Status: "Idle",
      };
    }

    const Paused = Session.Player.state.status === AudioPlayerStatus.Paused;
    const PositionSeconds = this.GetSessionPositionSeconds(Session);
    return {
      Active: true,
      CanSkip: Session.Queue.length > 0,
      ChannelId,
      DurationSeconds: Session.CurrentTrack.DurationSeconds ?? null,
      Paused,
      PositionSeconds,
      Queue: Session.Queue.map((Track) => ({
        Author: Track.Author ?? "",
        DurationSeconds: Track.DurationSeconds ?? null,
        Source: Track.Source ?? "youtube",
        ThumbnailUrl: Track.ThumbnailUrl ?? this.BuildYoutubeThumbnailUrl(Track.VideoId ?? this.ExtractYouTubeVideoId(Track.Url) ?? ""),
        Title: Track.Title,
        Url: Track.Url,
        VideoId: Track.VideoId ?? this.ExtractYouTubeVideoId(Track.Url) ?? "",
      })),
      Source: Session.CurrentTrack.Source ?? "youtube",
      TrackAuthor: Session.CurrentTrack.Author ?? "",
      TrackTitle: Session.CurrentTrack.Title,
      TrackThumbnailUrl: Session.CurrentTrack.ThumbnailUrl ?? this.BuildYoutubeThumbnailUrl(Session.CurrentTrack.VideoId ?? this.ExtractYouTubeVideoId(Session.CurrentTrack.Url) ?? ""),
      TrackUrl: Session.CurrentTrack.Url,
      TrackVideoId: Session.CurrentTrack.VideoId ?? this.ExtractYouTubeVideoId(Session.CurrentTrack.Url) ?? "",
      Status: `${Paused ? "Paused" : "Playing"}: ${Session.CurrentTrack.Title}`,
    };
  }

  public GetStatus(ChannelId: string): string {
    return this.GetState(ChannelId).Status;
  }

  public GetGuildActiveChannelId(GuildId: string): string | null {
    return this.GetGuildSession(GuildId)?.ChannelId ?? null;
  }

  public async Play(Channel: VoiceBasedChannel, Url: string, Options: TempVoiceMusicPlayOptions = {}): Promise<{ Count: number; FirstTitle: string }> {
    const ExistingGuildSession = this.GetGuildSession(Channel.guild.id);

    if (ExistingGuildSession && ExistingGuildSession.ChannelId !== Channel.id) {
      throw new TempVoiceMusicBusyError(ExistingGuildSession.ChannelId);
    }

    const LazyResult = await this.Resolver.resolveTracksLazy(
      Url,
      Options.YoutubeCookiesPath,
      Options.SpotifyClientId,
      Options.SpotifyClientSecret,
    );

    if (LazyResult.initialBatch.length === 0) {
      throw new Error("No playable track found.");
    }

    const Session = this.GetOrCreateSession(Channel);
    Session.YoutubeCookiesPath = Options.YoutubeCookiesPath;
    Session.Queue = LazyResult.initialBatch;
    Session._backgroundAborted = false;

    const StartedTrack = await this.PlayNext(Channel.id, true);

    if (!StartedTrack) {
      throw new Error("No playable track found.");
    }

    this.StartBackgroundResolve(Session, LazyResult);

    return {
      Count: LazyResult.initialBatch.length,
      FirstTitle: StartedTrack.Title,
    };
  }

  public async Enqueue(Channel: VoiceBasedChannel, Url: string, Options: TempVoiceMusicPlayOptions = {}): Promise<{ Count: number; FirstTitle: string; Started: boolean }> {
    const ExistingGuildSession = this.GetGuildSession(Channel.guild.id);

    if (ExistingGuildSession && ExistingGuildSession.ChannelId !== Channel.id) {
      throw new TempVoiceMusicBusyError(ExistingGuildSession.ChannelId);
    }

    const LazyResult = await this.Resolver.resolveTracksLazy(
      Url,
      Options.YoutubeCookiesPath,
      Options.SpotifyClientId,
      Options.SpotifyClientSecret,
    );

    if (LazyResult.initialBatch.length === 0) {
      throw new Error("No playable track found.");
    }

    const Session = this.GetOrCreateSession(Channel);
    Session.YoutubeCookiesPath = Options.YoutubeCookiesPath;

    if (Session.CurrentTrack) {
      Session.Queue.push(...LazyResult.initialBatch);
      this.StartBackgroundResolve(Session, LazyResult);
      this.NotifyStateChanged(Channel.id);
      return {
        Count: LazyResult.initialBatch.length,
        FirstTitle: LazyResult.initialBatch[0].Title,
        Started: false,
      };
    }

    Session.Queue = LazyResult.initialBatch;
    Session._backgroundAborted = false;
    const StartedTrack = await this.PlayNext(Channel.id, true);

    if (!StartedTrack) {
      throw new Error("No playable track found.");
    }

    this.StartBackgroundResolve(Session, LazyResult);

    return {
      Count: Session.Queue.length + 1,
      FirstTitle: StartedTrack.Title,
      Started: true,
    };
  }

  public Stop(ChannelId: string): void {
    const Session = this.Sessions.get(ChannelId);

    if (!Session) {
      return;
    }

    Session._backgroundAborted = true;
    Session.Queue = [];
    Session.CurrentTrack = null;
    this.StopFfmpeg(Session);
    Session.Player.stop(true);
    this.DestroySession(ChannelId, Session);
  }

  public Pause(ChannelId: string): boolean {
    const Session = this.Sessions.get(ChannelId);

    if (!Session) {
      return false;
    }

    const Paused = Session.Player.pause();

    if (Paused && !Session.PausedAtMs) {
      Session.PausedAtMs = Date.now();
      this.NotifyStateChanged(ChannelId);
    }

    return Paused;
  }

  public Resume(ChannelId: string): boolean {
    const Session = this.Sessions.get(ChannelId);

    if (!Session) {
      return false;
    }

    const Resumed = Session.Player.unpause();

    if (Resumed && Session.PausedAtMs) {
      Session.AccumulatedPausedMs += Date.now() - Session.PausedAtMs;
      Session.PausedAtMs = null;
      this.NotifyStateChanged(ChannelId);
    }

    return Resumed;
  }

  public async Skip(ChannelId: string): Promise<boolean> {
    const Session = this.Sessions.get(ChannelId);

    if (!Session) {
      return false;
    }

    if (Session.Queue.length === 0) {
      this.Stop(ChannelId);
      return true;
    }

    this.StopFfmpeg(Session);
    Session.Player.stop(true);
    return true;
  }

  public TogglePause(ChannelId: string): boolean {
    const State = this.GetState(ChannelId);

    if (!State.Active) {
      return false;
    }

    return State.Paused ? this.Resume(ChannelId) : this.Pause(ChannelId);
  }

  private GetOrCreateSession(Channel: VoiceBasedChannel): TempVoiceMusicSession {
    const ExistingSession = this.Sessions.get(Channel.id);

    if (ExistingSession && ExistingSession.Connection.state.status !== VoiceConnectionStatus.Destroyed) {
      return ExistingSession;
    }

    const Player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Play,
      },
    });
    const Connection = joinVoiceChannel({
      channelId: Channel.id,
      guildId: Channel.guild.id,
      adapterCreator: (Channel.guild as Guild).voiceAdapterCreator,
    });
    const Session: TempVoiceMusicSession = {
      AccumulatedPausedMs: 0,
      ChannelId: Channel.id,
      Connection,
      CurrentTrack: null,
      FfmpegProcess: null,
      GuildId: Channel.guild.id,
      PausedAtMs: null,
      Player,
      Queue: [],
      StartedAtMs: null,
      YoutubeCookiesPath: undefined,
    };

    Player.on(AudioPlayerStatus.Idle, () => {
      void this.PlayNext(Channel.id).catch((ErrorValue: unknown) => {
        this.Logger.Warn("TempVoice music playback failed.", ErrorValue);
      });
    });
    Player.on("error", (ErrorValue) => {
      this.Logger.Warn("TempVoice music player error.", ErrorValue);
      void this.PlayNext(Channel.id).catch((NextError: unknown) => {
        this.Logger.Warn("TempVoice music playback failed.", NextError);
      });
    });

    Connection.subscribe(Player);
    this.Sessions.set(Channel.id, Session);
    return Session;
  }

  private async PlayNext(ChannelId: string, ThrowIfAllTracksFailed = false): Promise<TempVoiceMusicTrack | null> {
    const Session = this.Sessions.get(ChannelId);

    if (!Session) {
      return null;
    }

    const Track = Session.Queue.shift() ?? null;
    this.StopFfmpeg(Session);
    Session.CurrentTrack = Track;
    Session.StartedAtMs = null;
    Session.PausedAtMs = null;
    Session.AccumulatedPausedMs = 0;

    if (!Track) {
      this.DestroySession(ChannelId, Session);
      return null;
    }

    try {
      await entersState(Session.Connection, VoiceConnectionStatus.Ready, 15_000);

      const DirectUrl = Track.DirectUrl ?? await this.Resolver.resolveDirectStreamUrl(Track.Url, Session.YoutubeCookiesPath);
      const Ffmpeg = spawn("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-reconnect",
        "1",
        "-reconnect_streamed",
        "1",
        "-reconnect_delay_max",
        "5",
        "-i",
        DirectUrl,
        "-analyzeduration",
        "0",
        "-vn",
        "-f",
        "s16le",
        "-ar",
        "48000",
        "-ac",
        "2",
        "pipe:1",
      ], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      Session.FfmpegProcess = Ffmpeg;
      Ffmpeg.once("error", (ErrorValue) => {
        if (Session.FfmpegProcess === Ffmpeg) {
          Session.FfmpegProcess = null;
        }

        this.Logger.Warn("TempVoice music ffmpeg process failed.", {
          ChannelId,
          Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue),
          TrackTitle: Track.Title,
          TrackUrl: Track.Url,
        });
        this.DestroySession(ChannelId, Session);
      });
      Ffmpeg.once("close", () => {
        if (Session.FfmpegProcess === Ffmpeg) {
          Session.FfmpegProcess = null;
        }
      });

      const Resource = createAudioResource(Ffmpeg.stdout, {
        inputType: StreamType.Raw,
      });
      Session.StartedAtMs = Date.now();
      Session.Player.play(Resource);
      this.NotifyStateChanged(ChannelId);
      return Track;
    } catch (ErrorValue) {
      const VoiceConnectionError = this.BuildVoiceConnectionError(ErrorValue, ChannelId, Track);

      if (VoiceConnectionError) {
        this.Logger.Warn("TempVoice music voice connection failed.", VoiceConnectionError.Debug);
        this.DestroySession(ChannelId, Session);

        if (ThrowIfAllTracksFailed) {
          throw VoiceConnectionError;
        }

        return null;
      }

      this.Logger.Warn("TempVoice music stream failed.", {
        ChannelId,
        Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue),
        RemainingQueue: Session.Queue.length,
        TrackTitle: Track.Title,
        TrackUrl: Track.Url,
      });

      if (Session.Queue.length > 0) {
        return await this.PlayNext(ChannelId, ThrowIfAllTracksFailed);
      }

      this.DestroySession(ChannelId, Session);

      if (ThrowIfAllTracksFailed) {
        throw ErrorValue;
      }

      return null;
    }
  }

  private BuildVoiceConnectionError(ErrorValue: unknown, ChannelId: string, Track: TempVoiceMusicTrack): TempVoiceMusicError | null {
    if (!this.IsVoiceConnectionAbortError(ErrorValue)) {
      return null;
    }

    return new TempVoiceMusicError("Voice connection could not be established.", {
      ChannelId,
      Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue),
      TrackTitle: Track.Title,
      TrackUrl: Track.Url,
    });
  }

  private IsVoiceConnectionAbortError(ErrorValue: unknown): boolean {
    const Candidate = ErrorValue as { code?: unknown; message?: unknown } | null;
    const Message = typeof Candidate?.message === "string" ? Candidate.message : "";
    return Candidate?.code === "ABORT_ERR" || Message.includes("operation was aborted") || Message.includes("This operation was aborted");
  }

  private GetGuildSession(GuildId: string): TempVoiceMusicSession | null {
    for (const Session of this.Sessions.values()) {
      if (Session.GuildId === GuildId) {
        return Session;
      }
    }

    return null;
  }

  private BuildYoutubeThumbnailUrl(VideoId: string): string {
    return VideoId ? `https://i.ytimg.com/vi/${VideoId}/hqdefault.jpg` : "";
  }

  private ExtractYouTubeVideoId(Value: string): string | null {
    try {
      const UrlValue = new URL(Value.trim());
      const Hostname = UrlValue.hostname.replace(/^www\./u, "");

      if (Hostname === "youtu.be") {
        return this.NormalizeVideoId(UrlValue.pathname.split("/").filter(Boolean)[0] ?? "");
      }

      if (Hostname === "youtube.com" || Hostname === "music.youtube.com") {
        if (UrlValue.pathname === "/watch") {
          return this.NormalizeVideoId(UrlValue.searchParams.get("v") ?? "");
        }

        if (UrlValue.pathname.startsWith("/shorts/") || UrlValue.pathname.startsWith("/embed/")) {
          return this.NormalizeVideoId(UrlValue.pathname.split("/")[2] ?? "");
        }
      }
    } catch {
      return this.NormalizeVideoId(Value);
    }

    return this.NormalizeVideoId(Value);
  }

  private NormalizeVideoId(Value: string): string | null {
    const TrimmedValue = Value.trim();
    return /^[a-z0-9_-]{11}$/iu.test(TrimmedValue) ? TrimmedValue : null;
  }

  private GetSessionPositionSeconds(Session: TempVoiceMusicSession): number {
    if (!Session.StartedAtMs) {
      return 0;
    }

    const EffectiveNow = Session.PausedAtMs ?? Date.now();
    const ElapsedMs = Math.max(0, EffectiveNow - Session.StartedAtMs - Session.AccumulatedPausedMs);
    const PositionSeconds = Math.floor(ElapsedMs / 1000);
    const DurationSeconds = Session.CurrentTrack?.DurationSeconds;

    if (typeof DurationSeconds === "number" && DurationSeconds > 0) {
      return Math.min(PositionSeconds, Math.floor(DurationSeconds));
    }

    return PositionSeconds;
  }

  private StopFfmpeg(Session: TempVoiceMusicSession): void {
    if (!Session.FfmpegProcess) {
      return;
    }

    Session.FfmpegProcess.kill("SIGKILL");
    Session.FfmpegProcess = null;
  }

  private DestroySession(ChannelId: string, Session: TempVoiceMusicSession): void {
    Session._backgroundAborted = true;
    this.StopFfmpeg(Session);

    if (Session.Connection.state.status !== VoiceConnectionStatus.Destroyed) {
      Session.Connection.destroy();
    }

    this.Sessions.delete(ChannelId);
    this.NotifyStateChanged(ChannelId);
  }

  private NotifyStateChanged(ChannelId: string): void {
    if (!this.OnStateChanged) {
      return;
    }

    void Promise.resolve(this.OnStateChanged(ChannelId)).catch((ErrorValue: unknown) => {
      this.Logger.Warn("TempVoice music state refresh failed.", ErrorValue);
    });
  }

  private StartBackgroundResolve(Session: TempVoiceMusicSession, LazyResult: LazyResolveResult): void {
    const ChannelId = Session.ChannelId;

    void (async () => {
      try {
        while (!Session._backgroundAborted) {
          const Batch = await LazyResult.resolveNextBatch();
          if (!Batch || Batch.length === 0) break;
          if (Session._backgroundAborted) break;

          Session.Queue.push(...Batch);
          this.NotifyStateChanged(ChannelId);

          // Small delay between batches to let playback catch up
          await this.Sleep(1000);
        }
      } catch (ErrorValue) {
        if (!Session._backgroundAborted) {
          this.Logger.Warn("TempVoice background playlist resolve failed.", {
            ChannelId,
            Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue),
          });
        }
      }
    })();
  }

  private async Sleep(DurationMs: number): Promise<void> {
    await new Promise<void>((Resolve) => {
      const Timer = setTimeout(Resolve, DurationMs);
      Timer.unref?.();
    });
  }
}
