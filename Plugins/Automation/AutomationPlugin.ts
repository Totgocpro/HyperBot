import type { GuildMember, Message, PartialGuildMember, TextChannel, VoiceState } from "discord.js";
import { BasePlugin } from "../../src/Core/BasePlugin.js";

type RuleCondition = {
  Type: string;
  ChannelId?: string;
  RoleId?: string;
  Text?: string;
  Weekdays?: number[];
  IsBot?: boolean;
};

type RuleAction = {
  Type: string;
  ChannelId?: string;
  Message?: string;
  RoleId?: string;
  Emoji?: string;
};

type RuleTrigger = {
  Type: string;
  ChannelIds?: string[];
};

type AutomationRule = {
  Id: string;
  Name: string;
  Enabled: boolean;
  Trigger: RuleTrigger;
  ConditionOperator: "AND" | "OR";
  Conditions: RuleCondition[];
  Actions: RuleAction[];
};

export default class AutomationPlugin extends BasePlugin {
  private GuildRulesCache = new Map<string, { Rules: AutomationRule[]; LoadedAt: number }>();
  private readonly CacheTtlMs = 15_000;

  public async OnEnable(): Promise<void> {
    this.Logger.Info("Automation plugin enabled.");
  }

  public async OnDisable(): Promise<void> {
    this.GuildRulesCache.clear();
    this.Logger.Info("Automation plugin disabled.");
  }

  private async GetGuildRules(GuildId: string): Promise<AutomationRule[]> {
    const Cached = this.GuildRulesCache.get(GuildId);
    if (Cached && Date.now() - Cached.LoadedAt < this.CacheTtlMs) {
      return Cached.Rules;
    }

    try {
      const Stored = await this.Storage.GetGlobalConfig<AutomationRule[]>(GuildId, "Rules");
      const Rules = Array.isArray(Stored) ? Stored : [];
      this.GuildRulesCache.set(GuildId, { Rules, LoadedAt: Date.now() });
      return Rules;
    } catch {
      return [];
    }
  }

  private async GetEnabledRules(GuildId: string, TriggerType: string): Promise<AutomationRule[]> {
    const AllRules = await this.GetGuildRules(GuildId);
    return AllRules.filter((Rule) => Rule.Enabled && Rule.Trigger.Type === TriggerType);
  }

  private MatchConditions(Rule: AutomationRule, Context: Record<string, unknown>): boolean {
    if (!Rule.Conditions.length) return true;

    const Results = Rule.Conditions.map((Cond) => {
      switch (Cond.Type) {
        case "ChannelIs":
          return Cond.ChannelId ? Context.ChannelId === Cond.ChannelId : true;
        case "ChannelNot":
          return Cond.ChannelId ? Context.ChannelId !== Cond.ChannelId : true;
        case "RoleHas":
          return Cond.RoleId ? (Context.MemberRoleIds as string[] ?? []).includes(Cond.RoleId) : true;
        case "RoleNot":
          return Cond.RoleId ? !(Context.MemberRoleIds as string[] ?? []).includes(Cond.RoleId) : true;
        case "MessageContains":
          return Cond.Text ? String(Context.MessageContent ?? "").toLowerCase().includes(Cond.Text.toLowerCase()) : true;
        case "MessageNotContains":
          return Cond.Text ? !String(Context.MessageContent ?? "").toLowerCase().includes(Cond.Text.toLowerCase()) : true;
        case "UserIsBot":
          return Cond.IsBot !== undefined ? Context.IsBot === Cond.IsBot : true;
        case "UserIsNotBot":
          return Cond.IsBot !== undefined ? Context.IsBot !== Cond.IsBot : true;
        case "OnWeekday": {
          const Day = new Date().getDay();
          return Cond.Weekdays ? Cond.Weekdays.includes(Day) : true;
        }
        default:
          return true;
      }
    });

    return Rule.ConditionOperator === "OR" ? Results.some(Boolean) : Results.every(Boolean);
  }

  private async ExecuteActions(Rule: AutomationRule, GuildId: string, Member: GuildMember | null, Channel: TextChannel | null, TriggerMessage?: Message | null): Promise<void> {
    for (const Action of Rule.Actions) {
      try {
        switch (Action.Type) {
          case "SendMessage": {
            if (!Action.ChannelId || !Action.Message) break;
            const TargetChannel = this.DiscordClient.channels.cache.get(Action.ChannelId) as TextChannel | undefined;
            if (TargetChannel?.isSendable()) {
              await TargetChannel.send(Action.Message);
            }
            break;
          }
          case "AddRole": {
            if (!Member || !Action.RoleId) break;
            if (!Member.roles.cache.has(Action.RoleId)) {
              await Member.roles.add(Action.RoleId);
            }
            break;
          }
          case "RemoveRole": {
            if (!Member || !Action.RoleId) break;
            if (Member.roles.cache.has(Action.RoleId)) {
              await Member.roles.remove(Action.RoleId);
            }
            break;
          }
          case "DeleteMessage": {
            if (TriggerMessage) {
              await TriggerMessage.delete().catch(() => {});
            }
            break;
          }
          case "AddReaction": {
            if (TriggerMessage && Action.Emoji) {
              await TriggerMessage.react(Action.Emoji).catch(() => {});
            }
            break;
          }
          case "DmUser": {
            if (Member && Action.Message) {
              await Member.send(Action.Message).catch(() => {});
            }
            break;
          }
        }
      } catch (ErrorValue) {
        this.Logger.Warn(`Automation action ${Action.Type} failed for rule ${Rule.Name}:`, ErrorValue);
      }
    }
  }

  public override async OnMessage(Message: Message): Promise<void> {
    if (Message.author.bot || !Message.guildId) return;

    const GuildId = Message.guildId;
    const Channel = Message.channel as TextChannel;
    const Member = Message.member;
    const Context: Record<string, unknown> = {
      ChannelId: Channel.id,
      MemberRoleIds: Member ? [...Member.roles.cache.keys()] : [],
      MessageContent: Message.content,
      IsBot: Message.author.bot
    };

    const Rules = await this.GetEnabledRules(GuildId, "OnMessage");
    for (const Rule of Rules) {
      if (this.MatchConditions(Rule, Context)) {
        await this.ExecuteActions(Rule, GuildId, Member, Channel, Message);
      }
    }
  }

  public override async OnGuildMemberAdd(Member: GuildMember): Promise<void> {
    const GuildId = Member.guild.id;
    const Context: Record<string, unknown> = {
      ChannelId: "",
      MemberRoleIds: [...Member.roles.cache.keys()],
      MessageContent: "",
      IsBot: Member.user.bot
    };

    const Rules = await this.GetEnabledRules(GuildId, "OnMemberJoin");
    for (const Rule of Rules) {
      if (this.MatchConditions(Rule, Context)) {
        await this.ExecuteActions(Rule, GuildId, Member, null);
      }
    }
  }

  public override async OnGuildMemberRemove(Member: GuildMember | PartialGuildMember): Promise<void> {
    if (!("roles" in Member)) return;

    const GuildId = Member.guild.id;
    const Context: Record<string, unknown> = {
      ChannelId: "",
      MemberRoleIds: [...Member.roles.cache.keys()],
      MessageContent: "",
      IsBot: Member.user.bot
    };

    const Rules = await this.GetEnabledRules(GuildId, "OnMemberLeave");
    for (const Rule of Rules) {
      if (this.MatchConditions(Rule, Context)) {
        await this.ExecuteActions(Rule, GuildId, null, null);
      }
    }
  }

  public override async OnVoiceStateUpdate(OldState: VoiceState, NewState: VoiceState): Promise<void> {
    const Member = NewState.member;
    if (!Member) return;

    const GuildId = NewState.guild.id;
    const Context: Record<string, unknown> = {
      ChannelId: NewState.channelId ?? "",
      MemberRoleIds: [...Member.roles.cache.keys()],
      MessageContent: "",
      IsBot: Member.user.bot
    };

    const Rules = await this.GetEnabledRules(GuildId, "OnVoiceStateChange");
    for (const Rule of Rules) {
      if (this.MatchConditions(Rule, Context)) {
        await this.ExecuteActions(Rule, GuildId, Member, null);
      }
    }
  }

  public override async OnDashboardAction(GuildId: string, ActionKey: string, ActorId: string, Payload?: unknown): Promise<void> {
    if (ActionKey === "RunRule" && Payload) {
      const RuleId = String(Payload);
      const Rules = await this.GetGuildRules(GuildId);
      const Rule = Rules.find((R) => R.Id === RuleId);
      if (Rule) {
        this.Logger.Info(`Manually running rule "${Rule.Name}" triggered by ${ActorId}`);
        const Context: Record<string, unknown> = {
          ChannelId: "",
          MemberRoleIds: [],
          MessageContent: "",
          IsBot: false
        };
        if (this.MatchConditions(Rule, Context)) {
          await this.ExecuteActions(Rule, GuildId, null, null);
        }
      }
    }
  }
}
