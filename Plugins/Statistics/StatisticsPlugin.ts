import type { GuildMember, Message, PartialGuildMember, VoiceState } from "discord.js";
import { BasePlugin } from "../../src/Core/BasePlugin.js";

type DailyCounters = Record<string, number>;

type VoiceSession = {
  GuildId: string;
  UserId: string;
  LastFlushedAt: number;
};

const MessagesDailyKey = "MessagesDaily";
const VoiceSecondsDailyKey = "VoiceSecondsDaily";
const JoinsDailyKey = "JoinsDaily";
const LeavesDailyKey = "LeavesDaily";

export default class StatisticsPlugin extends BasePlugin {
  private readonly VoiceSessions = new Map<string, VoiceSession>();

  public async OnEnable(): Promise<void> {
    this.Logger.Info("Statistics plugin enabled.");
  }

  public async OnDisable(): Promise<void> {
    await this.FlushAllVoiceSessions();
    this.Logger.Info("Statistics plugin disabled.");
  }

  public async OnMessage(MessageValue: Message): Promise<void> {
    if (!MessageValue.guildId || (!(await this.ShouldTrackBots(MessageValue.guildId)) && MessageValue.author.bot)) {
      return;
    }

    await this.IncrementDailyCounter(MessageValue.guildId, MessagesDailyKey, 1, new Date());
  }

  public async OnGuildMemberAdd(Member: GuildMember): Promise<void> {
    if (!(await this.ShouldTrackBots(Member.guild.id)) && Member.user.bot) {
      return;
    }

    await this.IncrementDailyCounter(Member.guild.id, JoinsDailyKey, 1, new Date());
  }

  public async OnGuildMemberRemove(Member: GuildMember | PartialGuildMember): Promise<void> {
    if (!(await this.ShouldTrackBots(Member.guild.id)) && Member.user.bot) {
      return;
    }

    await this.IncrementDailyCounter(Member.guild.id, LeavesDailyKey, 1, new Date());
  }

  public async OnVoiceStateUpdate(OldState: VoiceState, NewState: VoiceState): Promise<void> {
    const GuildId = NewState.guild.id;
    const UserId = NewState.id;

    if (!(await this.ShouldTrackBots(GuildId)) && NewState.member?.user.bot) {
      return;
    }

    const SessionKey = this.BuildVoiceSessionKey(GuildId, UserId);
    const WasInVoice = Boolean(OldState.channelId);
    const IsInVoice = Boolean(NewState.channelId);

    if (!WasInVoice && IsInVoice) {
      this.VoiceSessions.set(SessionKey, {
        GuildId,
        UserId,
        LastFlushedAt: Date.now()
      });
      return;
    }

    if (WasInVoice && !IsInVoice) {
      await this.FlushVoiceSession(SessionKey, Date.now());
      this.VoiceSessions.delete(SessionKey);
    }
  }

  public async OnTick(): Promise<void> {
    await this.FlushAllVoiceSessions();
  }

  private async FlushAllVoiceSessions(): Promise<void> {
    const Now = Date.now();

    for (const SessionKey of this.VoiceSessions.keys()) {
      await this.FlushVoiceSession(SessionKey, Now);
    }
  }

  private async FlushVoiceSession(SessionKey: string, Now: number): Promise<void> {
    const Session = this.VoiceSessions.get(SessionKey);

    if (!Session || Now <= Session.LastFlushedAt) {
      return;
    }

    const Seconds = Math.floor((Now - Session.LastFlushedAt) / 1000);

    if (Seconds <= 0) {
      return;
    }

    await this.IncrementDailyCounter(Session.GuildId, VoiceSecondsDailyKey, Seconds, new Date(Now));
    Session.LastFlushedAt = Now;
  }

  private async IncrementDailyCounter(GuildId: string, Key: string, Amount: number, DateValue: Date): Promise<void> {
    const DayKey = DateValue.toISOString().slice(0, 10);
    const Counters = (await this.Storage.GetGlobalConfig<DailyCounters>(GuildId, Key)) ?? {};
    Counters[DayKey] = (Counters[DayKey] ?? 0) + Amount;
    await this.Storage.SetGlobalConfig(GuildId, Key, Counters);
  }

  private async ShouldTrackBots(GuildId: string): Promise<boolean> {
    return (await this.Storage.GetGlobalConfig<boolean>(GuildId, "TrackBots")) ?? false;
  }

  private BuildVoiceSessionKey(GuildId: string, UserId: string): string {
    return `${GuildId}:${UserId}`;
  }
}
