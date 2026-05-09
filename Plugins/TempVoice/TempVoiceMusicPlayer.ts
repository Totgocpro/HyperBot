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
import Play from "play-dl";
import { youtubeDl as YoutubeDl, type Payload as YoutubeDlPayload } from "youtube-dl-exec";
import type { PluginLoggerContract } from "../../src/Core/Types.js";

type TempVoiceMusicTrack = {
  DirectUrl?: string;
  Title: string;
  Url: string;
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
  ChannelId: string;
  Connection: VoiceConnection;
  CurrentTrack: TempVoiceMusicTrack | null;
  FfmpegProcess: ChildProcessByStdio<null, Readable, Readable> | null;
  GuildId: string;
  Player: AudioPlayer;
  Queue: TempVoiceMusicTrack[];
};

export type TempVoiceMusicState = {
  Active: boolean;
  CanSkip: boolean;
  Paused: boolean;
  TrackTitle: string;
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
        Paused: false,
        TrackTitle: "",
        Status: "Idle"
      };
    }

    const Paused = Session.Player.state.status === AudioPlayerStatus.Paused;
    return {
      Active: true,
      CanSkip: Session.Queue.length > 0,
      Paused,
      TrackTitle: Session.CurrentTrack.Title,
      Status: `${Paused ? "Paused" : "Playing"}: ${Session.CurrentTrack.Title}`
    };
  }

  public GetStatus(ChannelId: string): string {
    return this.GetState(ChannelId).Status;
  }

  public async Play(Channel: VoiceBasedChannel, Url: string): Promise<{ Count: number; FirstTitle: string }> {
    const ExistingGuildSession = this.GetGuildSession(Channel.guild.id);

    if (ExistingGuildSession && ExistingGuildSession.ChannelId !== Channel.id) {
      throw new TempVoiceMusicBusyError(ExistingGuildSession.ChannelId);
    }

    const Tracks = await this.ResolveTracks(Url);

    if (Tracks.length === 0) {
      throw new Error("No playable YouTube track found.");
    }

    const FirstTitle = Tracks[0].Title;
    const Count = Tracks.length;
    const Session = this.GetOrCreateSession(Channel);
    Session.Queue = Tracks;
    await this.PlayNext(Channel.id);

    return {
      Count,
      FirstTitle
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
    return this.Sessions.get(ChannelId)?.Player.pause() ?? false;
  }

  public Resume(ChannelId: string): boolean {
    return this.Sessions.get(ChannelId)?.Player.unpause() ?? false;
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
      ChannelId: Channel.id,
      Connection,
      CurrentTrack: null,
      FfmpegProcess: null,
      GuildId: Channel.guild.id,
      Player,
      Queue: []
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

  private async PlayNext(ChannelId: string): Promise<void> {
    const Session = this.Sessions.get(ChannelId);

    if (!Session) {
      return;
    }

    const Track = Session.Queue.shift() ?? null;
    this.StopFfmpeg(Session);
    Session.CurrentTrack = Track;

    if (!Track) {
      this.DestroySession(ChannelId, Session);
      return;
    }

    try {
      await entersState(Session.Connection, VoiceConnectionStatus.Ready, 15_000);

      const DirectUrl = Track.DirectUrl ?? await this.ResolveDirectStreamUrl(Track.Url);
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
      Session.Player.play(Resource);
      this.NotifyStateChanged(ChannelId);
    } catch (ErrorValue) {
      this.Logger.Warn("TempVoice music stream failed.", {
        ChannelId,
        Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue),
        TrackTitle: Track.Title,
        TrackUrl: Track.Url
      });
      throw ErrorValue;
    }
  }

  private GetGuildSession(GuildId: string): TempVoiceMusicSession | null {
    for (const Session of this.Sessions.values()) {
      if (Session.GuildId === GuildId) {
        return Session;
      }
    }

    return null;
  }

  private async ResolveTracks(Url: string): Promise<TempVoiceMusicTrack[]> {
    const NormalizedUrl = this.NormalizeYouTubeUrl(Url);
    const Validation = Play.yt_validate(NormalizedUrl);
    const VideoId = this.ExtractYouTubeVideoId(NormalizedUrl);
    const PlaylistId = this.ExtractYouTubePlaylistId(NormalizedUrl);
    const Debug = {
      InputUrl: Url,
      NormalizedUrl,
      PlaylistId,
      Validation,
      VideoId
    };
    if (Validation === "playlist" || (PlaylistId && !VideoId)) {
      try {
        const Playlist = await Play.playlist_info(NormalizedUrl, { incomplete: true });
        const Videos = await Playlist.all_videos();
        const Tracks = Videos.slice(0, MaxPlaylistTracks).map((Video) => ({
          Title: Video.title ?? "YouTube track",
          Url: this.NormalizeYouTubeUrl(Video.url)
        }));
        return Tracks;
      } catch (ErrorValue) {
        this.Logger.Warn("TempVoice music playlist load failed.", {
          ...Debug,
          Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue)
        });
        throw new TempVoiceMusicError("Playlist could not be loaded.", Debug);
      }
    }

    if (Validation === "video" || VideoId) {
      const TrackUrl = VideoId ? `https://www.youtube.com/watch?v=${VideoId}` : NormalizedUrl;

      try {
        const Info = await this.LoadYoutubeInfo(TrackUrl);
        const Title = Info.title ?? `YouTube ${VideoId ?? "track"}`;

        return [{
          Title,
          Url: TrackUrl
        }];
      } catch (ErrorValue) {
        this.Logger.Warn("TempVoice music video info failed.", {
          ...Debug,
          Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue),
          TrackUrl
        });
        throw new TempVoiceMusicError("Video could not be loaded.", Debug);
      }
    }

    this.Logger.Warn("TempVoice music URL rejected.", Debug);
    throw new TempVoiceMusicError("Use a valid YouTube video or playlist URL.", Debug);
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

  private async ResolveDirectStreamUrl(Url: string): Promise<string> {
    const Output = await YoutubeDl(Url, {
      format: "bestaudio/best",
      getUrl: true,
      noWarnings: true
    });
    const DirectUrl = String(Output).trim().split(/\r?\n/u).find(Boolean);

    if (!DirectUrl) {
      throw new TempVoiceMusicError("YouTube stream URL could not be resolved.", {
        TrackUrl: Url
      });
    }

    return DirectUrl;
  }

  private async LoadYoutubeInfo(Url: string): Promise<YoutubeDlPayload> {
    const Output = await YoutubeDl(Url, {
      dumpSingleJson: true,
      noWarnings: true,
      skipDownload: true
    });

    return Output as YoutubeDlPayload;
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
