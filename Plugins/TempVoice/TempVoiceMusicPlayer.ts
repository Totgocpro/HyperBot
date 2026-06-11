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
  type VoiceConnection
} from "@discordjs/voice";
import type { Guild, VoiceBasedChannel } from "discord.js";
import { youtubeDl as YoutubeDl, type Flags as YoutubeDlFlags, type Payload as YoutubeDlPayload } from "youtube-dl-exec";
import type { PluginLoggerContract } from "../../src/Core/Types.js";

type TempVoiceMusicTrack = {
  Author?: string;
  DirectUrl?: string;
  DurationSeconds?: number | null;
  ThumbnailUrl?: string;
  Title: string;
  Url: string;
  VideoId?: string;
};

type TempVoiceMusicPlayOptions = {
  YoutubeCookiesPath?: string | null;
};

export class TempVoiceMusicError extends Error {
  public constructor(
    Message: string,
    public readonly Debug: Record<string, unknown>
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
};

type YoutubeDlPlaylistPayload = YoutubeDlPayload & {
  entries?: Array<YoutubeDlPlaylistEntry | null>;
};

type YoutubeDlPlaylistEntry = {
  artist?: string;
  channel?: string;
  duration?: number | string | null;
  id?: string;
  thumbnail?: string;
  title?: string;
  uploader?: string;
  url?: string;
  webpage_url?: string;
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
    ThumbnailUrl: string;
    Title: string;
    Url: string;
    VideoId: string;
  }>;
  TrackAuthor: string;
  TrackTitle: string;
  TrackThumbnailUrl: string;
  TrackUrl: string;
  TrackVideoId: string;
  Status: string;
};

const MaxPlaylistTracks = 100;

export class TempVoiceMusicPlayer {
  private readonly Sessions = new Map<string, TempVoiceMusicSession>();

  public constructor(
    private readonly Logger: PluginLoggerContract,
    private readonly OnStateChanged?: (ChannelId: string) => void | Promise<void>
  ) {}

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
        TrackAuthor: "",
        TrackTitle: "",
        TrackThumbnailUrl: "",
        TrackUrl: "",
        TrackVideoId: "",
        Status: "Idle"
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
        ThumbnailUrl: Track.ThumbnailUrl ?? this.BuildYoutubeThumbnailUrl(Track.VideoId ?? this.ExtractYouTubeVideoId(Track.Url) ?? ""),
        Title: Track.Title,
        Url: Track.Url,
        VideoId: Track.VideoId ?? this.ExtractYouTubeVideoId(Track.Url) ?? ""
      })),
      TrackAuthor: Session.CurrentTrack.Author ?? "",
      TrackTitle: Session.CurrentTrack.Title,
      TrackThumbnailUrl: Session.CurrentTrack.ThumbnailUrl ?? this.BuildYoutubeThumbnailUrl(Session.CurrentTrack.VideoId ?? this.ExtractYouTubeVideoId(Session.CurrentTrack.Url) ?? ""),
      TrackUrl: Session.CurrentTrack.Url,
      TrackVideoId: Session.CurrentTrack.VideoId ?? this.ExtractYouTubeVideoId(Session.CurrentTrack.Url) ?? "",
      Status: `${Paused ? "Paused" : "Playing"}: ${Session.CurrentTrack.Title}`
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

    const Tracks = await this.ResolveTracks(Url, Options.YoutubeCookiesPath);

    if (Tracks.length === 0) {
      throw new Error("No playable YouTube track found.");
    }

    const Session = this.GetOrCreateSession(Channel);
    Session.YoutubeCookiesPath = Options.YoutubeCookiesPath;
    Session.Queue = Tracks;
    const StartedTrack = await this.PlayNext(Channel.id, true);

    if (!StartedTrack) {
      throw new Error("No playable YouTube track found.");
    }

    return {
      Count: Session.Queue.length + 1,
      FirstTitle: StartedTrack.Title
    };
  }

  public async Enqueue(Channel: VoiceBasedChannel, Url: string, Options: TempVoiceMusicPlayOptions = {}): Promise<{ Count: number; FirstTitle: string; Started: boolean }> {
    const ExistingGuildSession = this.GetGuildSession(Channel.guild.id);

    if (ExistingGuildSession && ExistingGuildSession.ChannelId !== Channel.id) {
      throw new TempVoiceMusicBusyError(ExistingGuildSession.ChannelId);
    }

    const Tracks = await this.ResolveTracks(Url, Options.YoutubeCookiesPath);

    if (Tracks.length === 0) {
      throw new Error("No playable YouTube track found.");
    }

    const Session = this.GetOrCreateSession(Channel);
    Session.YoutubeCookiesPath = Options.YoutubeCookiesPath;

    if (Session.CurrentTrack) {
      Session.Queue.push(...Tracks);
      this.NotifyStateChanged(Channel.id);
      return {
        Count: Tracks.length,
        FirstTitle: Tracks[0].Title,
        Started: false
      };
    }

    Session.Queue = Tracks;
    const StartedTrack = await this.PlayNext(Channel.id, true);

    if (!StartedTrack) {
      throw new Error("No playable YouTube track found.");
    }

    return {
      Count: Session.Queue.length + 1,
      FirstTitle: StartedTrack.Title,
      Started: true
    };
  }

  public Stop(ChannelId: string): void {
    const Session = this.Sessions.get(ChannelId);

    if (!Session) {
      return;
    }

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
        noSubscriber: NoSubscriberBehavior.Play
      }
    });
    const Connection = joinVoiceChannel({
      channelId: Channel.id,
      guildId: Channel.guild.id,
      adapterCreator: (Channel.guild as Guild).voiceAdapterCreator
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
      YoutubeCookiesPath: undefined
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

      const DirectUrl = Track.DirectUrl ?? await this.ResolveDirectStreamUrl(Track.Url, Session.YoutubeCookiesPath);
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
        "pipe:1"
      ], {
        stdio: ["ignore", "pipe", "pipe"]
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
          TrackUrl: Track.Url
        });
        this.DestroySession(ChannelId, Session);
      });
      Ffmpeg.once("close", () => {
        if (Session.FfmpegProcess === Ffmpeg) {
          Session.FfmpegProcess = null;
        }
      });

      const Resource = createAudioResource(Ffmpeg.stdout, {
        inputType: StreamType.Raw
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
        TrackUrl: Track.Url
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
      TrackUrl: Track.Url
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

  private async ResolveTracks(Url: string, YoutubeCookiesPath?: string | null): Promise<TempVoiceMusicTrack[]> {
    const NormalizedUrl = this.NormalizeYouTubeUrl(Url);
    const VideoId = this.ExtractYouTubeVideoId(NormalizedUrl);
    const PlaylistId = this.ExtractYouTubePlaylistId(NormalizedUrl);
    const IsPlaylist = Boolean(PlaylistId && !VideoId);
    const Debug = {
      InputUrl: Url,
      IsPlaylist,
      NormalizedUrl,
      PlaylistId,
      VideoId
    };

    if (IsPlaylist) {
      try {
        const Tracks = await this.LoadPlaylistTracks(NormalizedUrl, YoutubeCookiesPath);

        if (Tracks.length === 0) {
          throw new TempVoiceMusicError("Playlist did not contain playable YouTube tracks.", Debug);
        }

        return Tracks;
      } catch (ErrorValue) {
        this.LogResolveFailure("TempVoice music playlist load failed.", Debug, ErrorValue);
        throw this.BuildYoutubeDlError("Playlist could not be loaded.", ErrorValue, Debug);
      }
    }

    if (VideoId) {
      const TrackUrl = VideoId ? `https://www.youtube.com/watch?v=${VideoId}` : NormalizedUrl;

      try {
        const Info = await this.LoadYoutubeInfo(TrackUrl, YoutubeCookiesPath);
        const Title = Info.title ?? `YouTube ${VideoId ?? "track"}`;

        return [{
          Author: this.ExtractAuthor(Info),
          DurationSeconds: this.ParseDurationSeconds(Info.duration),
          ThumbnailUrl: typeof Info.thumbnail === "string" ? Info.thumbnail : this.BuildYoutubeThumbnailUrl(VideoId ?? ""),
          Title,
          Url: TrackUrl,
          VideoId: VideoId ?? undefined
        }];
      } catch (ErrorValue) {
        this.LogResolveFailure("TempVoice music video info failed.", Debug, ErrorValue, { TrackUrl });
        throw this.BuildYoutubeDlError("Video could not be loaded.", ErrorValue, Debug);
      }
    }

    this.LogResolveFailure("TempVoice music URL rejected.", Debug);
    throw new TempVoiceMusicError("Use a valid YouTube video or playlist URL.", Debug);
  }

  private LogResolveFailure(Message: string, Debug: Record<string, unknown>, ErrorValue?: unknown, Extra: Record<string, unknown> = {}): void {
    const ErrorMessage = ErrorValue instanceof Error ? ErrorValue.message : ErrorValue === undefined ? undefined : String(ErrorValue);

    if (this.IsReleaseMode()) {
      this.Logger.Info(Message, {
        Error: ErrorMessage,
        NormalizedUrl: Debug.NormalizedUrl,
        PlaylistId: Debug.PlaylistId,
        VideoId: Debug.VideoId,
        ...Extra
      });
      return;
    }

    this.Logger.Warn(Message, {
      ...Debug,
      Error: ErrorMessage,
      ...Extra
    });
  }

  private IsReleaseMode(): boolean {
    return process.env.NODE_ENV === "production";
  }

  private NormalizeYouTubeUrl(Value: string): string {
    const TrimmedValue = Value.trim();

    if (!TrimmedValue) {
      return "";
    }

    try {
      const UrlValue = new URL(TrimmedValue);
      const Hostname = UrlValue.hostname.replace(/^www\./u, "");

      if (Hostname === "youtu.be") {
        const VideoId = UrlValue.pathname.split("/").filter(Boolean)[0] ?? "";
        return VideoId ? `https://www.youtube.com/watch?v=${VideoId}` : TrimmedValue;
      }

      if (Hostname === "youtube.com" || Hostname === "music.youtube.com") {
        const PlaylistId = UrlValue.searchParams.get("list");
        const VideoId = UrlValue.searchParams.get("v") ?? (UrlValue.pathname.startsWith("/shorts/") ? UrlValue.pathname.split("/")[2] : "");

        if (PlaylistId && !VideoId) {
          return `https://www.youtube.com/playlist?list=${PlaylistId}`;
        }

        if (VideoId) {
          return `https://www.youtube.com/watch?v=${VideoId}${PlaylistId ? `&list=${PlaylistId}` : ""}`;
        }
      }
    } catch {
      return TrimmedValue;
    }

    return TrimmedValue;
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

  private ExtractYouTubePlaylistId(Value: string): string | null {
    try {
      const UrlValue = new URL(Value.trim());
      const PlaylistId = UrlValue.searchParams.get("list") ?? "";
      return /^[a-z0-9_-]{10,80}$/iu.test(PlaylistId) ? PlaylistId : null;
    } catch {
      return null;
    }
  }

  private NormalizeVideoId(Value: string): string | null {
    const TrimmedValue = Value.trim();
    return /^[a-z0-9_-]{11}$/iu.test(TrimmedValue) ? TrimmedValue : null;
  }

  private async ResolveDirectStreamUrl(Url: string, YoutubeCookiesPath?: string | null): Promise<string> {
    let Output: YoutubeDlPayload | string;

    try {
      Output = await YoutubeDl(Url, this.BuildYoutubeDlFlags({
        format: "bestaudio/best",
        getUrl: true
      }, YoutubeCookiesPath));
    } catch (ErrorValue) {
      throw this.BuildYoutubeDlError("YouTube stream URL could not be resolved.", ErrorValue, {
        TrackUrl: Url
      });
    }

    const DirectUrl = String(Output).trim().split(/\r?\n/u).find(Boolean);

    if (!DirectUrl) {
      throw new TempVoiceMusicError("YouTube stream URL could not be resolved.", {
        TrackUrl: Url
      });
    }

    return DirectUrl;
  }

  private async LoadYoutubeInfo(Url: string, YoutubeCookiesPath?: string | null): Promise<YoutubeDlPayload> {
    const Output = await YoutubeDl(Url, this.BuildYoutubeDlFlags({
      dumpSingleJson: true,
      skipDownload: true
    }, YoutubeCookiesPath));

    return Output as YoutubeDlPayload;
  }

  private async LoadPlaylistTracks(Url: string, YoutubeCookiesPath?: string | null): Promise<TempVoiceMusicTrack[]> {
    const Output = await YoutubeDl(Url, this.BuildYoutubeDlFlags({
      dumpSingleJson: true,
      flatPlaylist: true,
      ignoreErrors: true,
      playlistEnd: MaxPlaylistTracks,
      skipDownload: true
    }, YoutubeCookiesPath)) as YoutubeDlPlaylistPayload;
    const Entries = Array.isArray(Output.entries) ? Output.entries : [];

    return Entries
      .filter((Entry): Entry is NonNullable<(typeof Entries)[number]> => Boolean(Entry))
      .map((Entry): TempVoiceMusicTrack | null => {
        const TrackUrl = this.BuildPlaylistEntryUrl(Entry);
        const VideoId = Entry.id && /^[a-z0-9_-]{11}$/iu.test(Entry.id) ? Entry.id : this.ExtractYouTubeVideoId(TrackUrl ?? "");
        return TrackUrl
          ? {
              Author: this.ExtractAuthor(Entry),
              DurationSeconds: this.ParseDurationSeconds(Entry.duration),
              ThumbnailUrl: Entry.thumbnail ?? this.BuildYoutubeThumbnailUrl(VideoId ?? ""),
              Title: Entry.title?.trim() || `YouTube ${Entry.id ?? "track"}`,
              Url: TrackUrl,
              VideoId: VideoId ?? undefined
            }
          : null;
      })
      .filter((Track): Track is TempVoiceMusicTrack => Track !== null)
      .slice(0, MaxPlaylistTracks);
  }

  private BuildPlaylistEntryUrl(Entry: YoutubeDlPlaylistEntry): string | null {
    if (Entry.webpage_url) {
      return this.NormalizeYouTubeUrl(Entry.webpage_url);
    }

    if (Entry.id && /^[a-z0-9_-]{11}$/iu.test(Entry.id)) {
      return `https://www.youtube.com/watch?v=${Entry.id}`;
    }

    if (Entry.url) {
      return this.NormalizeYouTubeUrl(Entry.url);
    }

    return null;
  }

  private BuildYoutubeThumbnailUrl(VideoId: string): string {
    return VideoId ? `https://i.ytimg.com/vi/${VideoId}/hqdefault.jpg` : "";
  }

  private ExtractAuthor(Value: unknown): string {
    const Source = Value as Record<string, unknown> | null;

    for (const Key of ["artist", "uploader", "channel", "creator"] as const) {
      const Candidate = Source?.[Key];

      if (typeof Candidate === "string" && Candidate.trim()) {
        return Candidate.trim();
      }
    }

    return "";
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

  private ParseDurationSeconds(Value: unknown): number | null {
    const ParsedValue = typeof Value === "number" ? Value : typeof Value === "string" ? Number.parseFloat(Value) : Number.NaN;
    return Number.isFinite(ParsedValue) && ParsedValue > 0 ? Math.round(ParsedValue) : null;
  }

  private BuildYoutubeDlFlags(Flags: YoutubeDlFlags, YoutubeCookiesPath?: string | null): YoutubeDlFlags {
    const CookiesPath = this.GetReadableYoutubeCookiesPath(YoutubeCookiesPath);

    return {
      noWarnings: true,
      ...Flags,
      ...(CookiesPath ? { cookies: CookiesPath } : {})
    };
  }

  private GetReadableYoutubeCookiesPath(YoutubeCookiesPath?: string | null): string {
    const CookiesPath = (YoutubeCookiesPath === undefined
      ? process.env.TEMPVOICE_YOUTUBE_COOKIES_PATH ?? process.env.YOUTUBE_COOKIES_PATH ?? ""
      : YoutubeCookiesPath ?? "").trim();

    if (!CookiesPath) {
      return "";
    }

    try {
      accessSync(CookiesPath, FileSystemConstants.R_OK);
      return CookiesPath;
    } catch (ErrorValue) {
      throw new TempVoiceMusicError("YouTube linked account is configured but the cookies file cannot be read by the bot.", {
        CookiesConfigured: true,
        Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue)
      });
    }
  }

  private BuildYoutubeDlError(Message: string, ErrorValue: unknown, Debug: Record<string, unknown>): TempVoiceMusicError {
    const ErrorMessage = ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue);

    if (this.IsYoutubeCookieRequiredError(ErrorMessage)) {
      return new TempVoiceMusicError(`${Message} YouTube requires a linked account for this video.`, {
        ...Debug,
        Error: ErrorMessage
      });
    }

    if (ErrorValue instanceof TempVoiceMusicError) {
      return ErrorValue;
    }

    return new TempVoiceMusicError(Message, {
      ...Debug,
      Error: ErrorMessage
    });
  }

  private IsYoutubeCookieRequiredError(ErrorMessage: string): boolean {
    return [
      "Sign in to confirm",
      "--cookies",
      "cookies.txt",
      "Video unavailable. This video is not available",
      "This video is only available to Music Premium members",
      "Private video",
      "This video may be inappropriate for some users"
    ].some((Pattern) => ErrorMessage.includes(Pattern));
  }

  private StopFfmpeg(Session: TempVoiceMusicSession): void {
    if (!Session.FfmpegProcess) {
      return;
    }

    Session.FfmpegProcess.kill("SIGKILL");
    Session.FfmpegProcess = null;
  }

  private DestroySession(ChannelId: string, Session: TempVoiceMusicSession): void {
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
}
