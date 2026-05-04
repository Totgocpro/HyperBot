import type { ChatInputCommandInteraction, Client, GuildMember, Interaction, Message, PartialGuildMember, PartialMessage, VoiceState } from "discord.js";
import type { PluginContext, PluginLoggerContract, PluginManifest, PluginStorageContract } from "./Types.js";

export abstract class BasePlugin {
  protected readonly Manifest: PluginManifest;
  protected readonly Storage: PluginStorageContract;
  protected readonly Logger: PluginLoggerContract;
  protected readonly DiscordClient: Client;

  public constructor(Context: PluginContext) {
    this.Manifest = Context.Manifest;
    this.Storage = Context.Storage;
    this.Logger = Context.Logger;
    this.DiscordClient = Context.DiscordClient;
  }

  public abstract OnEnable(): Promise<void>;

  public abstract OnDisable(): Promise<void>;

  public async OnMessage(_Message: Message): Promise<void> {
    return;
  }

  public async OnMessageDelete(_Message: Message | PartialMessage): Promise<void> {
    return;
  }

  public async OnMessageUpdate(_OldMessage: Message | PartialMessage, _NewMessage: Message | PartialMessage): Promise<void> {
    return;
  }

  public async OnGuildMemberAdd(_Member: GuildMember): Promise<void> {
    return;
  }

  public async OnGuildMemberRemove(_Member: GuildMember | PartialGuildMember): Promise<void> {
    return;
  }

  public async OnVoiceStateUpdate(_OldState: VoiceState, _NewState: VoiceState): Promise<void> {
    return;
  }

  public async OnTick(): Promise<void> {
    return;
  }

  public async OnDashboardAction(_GuildId: string, _ActionKey: string, _ActorId: string, _Payload?: unknown): Promise<void> {
    return;
  }

  public async OnInteraction(_Interaction: Interaction): Promise<void> {
    return;
  }

  public async OnSlashCommand(_CommandName: string, Interaction: ChatInputCommandInteraction): Promise<void> {
    await Interaction.reply({ content: "This command is not implemented.", ephemeral: true });
  }
}
