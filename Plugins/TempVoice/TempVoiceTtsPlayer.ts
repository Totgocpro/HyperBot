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
import type { PluginLoggerContract } from "../../src/Core/Types.js";

type TempVoiceTtsSession = {
  ChannelId: string;
  Connection: VoiceConnection;
  FfmpegProcess: ChildProcessByStdio<null, Readable, Readable> | null;
  GuildId: string;
  Player: AudioPlayer;
};

export class TempVoiceTtsBusyError extends Error {
  public constructor(public readonly ChannelId: string) {
    super(`The bot is already speaking in <#${ChannelId}>.`);
  }
}

const SupportedLanguages = new Set(["ar", "de", "en", "es", "fr", "it", "ja", "ko", "nl", "pl", "pt", "ru", "tr", "uk", "zh"]);

export class TempVoiceTtsPlayer {
  private readonly Sessions = new Map<string, TempVoiceTtsSession>();

  public constructor(
    private readonly Logger: PluginLoggerContract,
    private readonly OnStateChanged?: (ChannelId: string) => void | Promise<void>
  ) {}

  public GetGuildActiveChannelId(GuildId: string): string | null {
    return this.GetGuildSession(GuildId)?.ChannelId ?? null;
  }

  public async Speak(Channel: VoiceBasedChannel, Text: string, Language: string): Promise<void> {
    const ExistingGuildSession = this.GetGuildSession(Channel.guild.id);

    if (ExistingGuildSession && ExistingGuildSession.ChannelId !== Channel.id) {
      throw new TempVoiceTtsBusyError(ExistingGuildSession.ChannelId);
    }

    const CleanText = this.NormalizeText(Text);

    if (!CleanText) {
      throw new Error("TTS text is required.");
    }

    const SafeLanguage = this.NormalizeLanguage(Language);
    const Session = this.GetOrCreateSession(Channel);

    try {
      await entersState(Session.Connection, VoiceConnectionStatus.Ready, 15_000);

      const Ffmpeg = spawn("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-user_agent",
        "Mozilla/5.0 HyperBot TTS",
        "-i",
        this.BuildTtsUrl(CleanText, SafeLanguage),
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
        this.Logger.Warn("TempVoice TTS ffmpeg process failed.", {
          ChannelId: Channel.id,
          Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue)
        });
        this.DestroySession(Channel.id, Session);
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
      this.NotifyStateChanged(Channel.id);
    } catch (ErrorValue) {
      this.DestroySession(Channel.id, Session);
      throw ErrorValue;
    }
  }

  private GetOrCreateSession(Channel: VoiceBasedChannel): TempVoiceTtsSession {
    const ExistingSession = this.Sessions.get(Channel.id);

    if (ExistingSession && ExistingSession.Connection.state.status !== VoiceConnectionStatus.Destroyed) {
      this.StopFfmpeg(ExistingSession);
      ExistingSession.Player.stop(true);
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
    Connection.on("error", (ErrorValue) => {
      this.Logger.Warn("TempVoice TTS voice connection error.", ErrorValue);
    });
    const Session: TempVoiceTtsSession = {
      ChannelId: Channel.id,
      Connection,
      FfmpegProcess: null,
      GuildId: Channel.guild.id,
      Player
    };

    Player.on(AudioPlayerStatus.Idle, () => {
      this.DestroySession(Channel.id, Session);
    });
    Player.on("error", (ErrorValue) => {
      this.Logger.Warn("TempVoice TTS player error.", ErrorValue);
      this.DestroySession(Channel.id, Session);
    });

    Connection.subscribe(Player);
    this.Sessions.set(Channel.id, Session);
    return Session;
  }

  private GetGuildSession(GuildId: string): TempVoiceTtsSession | null {
    for (const Session of this.Sessions.values()) {
      if (Session.GuildId === GuildId) {
        return Session;
      }
    }

    return null;
  }

  private NormalizeText(Text: string): string {
    return Text.replace(/\s+/gu, " ").trim().slice(0, 150);
  }

  private NormalizeLanguage(Language: string): string {
    const SafeLanguage = Language.trim().toLowerCase().split("-")[0] ?? "";
    return SupportedLanguages.has(SafeLanguage) ? SafeLanguage : "fr";
  }

  private BuildTtsUrl(Text: string, Language: string): string {
    const UrlValue = new URL("https://translate.google.com/translate_tts");
    UrlValue.searchParams.set("ie", "UTF-8");
    UrlValue.searchParams.set("client", "tw-ob");
    UrlValue.searchParams.set("tl", Language);
    UrlValue.searchParams.set("q", Text);
    return UrlValue.toString();
  }

  private StopFfmpeg(Session: TempVoiceTtsSession): void {
    if (!Session.FfmpegProcess) {
      return;
    }

    Session.FfmpegProcess.kill("SIGKILL");
    Session.FfmpegProcess = null;
  }

  private DestroySession(ChannelId: string, Session: TempVoiceTtsSession): void {
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
      this.Logger.Warn("TempVoice TTS state refresh failed.", ErrorValue);
    });
  }
}
