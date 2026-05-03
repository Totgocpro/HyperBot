import type { ChatInputCommandInteraction } from "discord.js";
import { BasePlugin } from "../../src/Core/BasePlugin.js";

export default class PingPongPlugin extends BasePlugin {
  public async OnEnable(): Promise<void> {
    this.Logger.Info("PingPong plugin enabled.");
  }

  public async OnDisable(): Promise<void> {
    this.Logger.Info("PingPong plugin disabled.");
  }

  public async OnSlashCommand(CommandName: string, Interaction: ChatInputCommandInteraction): Promise<void> {
    if (CommandName !== "ping" || !Interaction.guildId) {
      return;
    }

    const UserId = Interaction.user.id;
    const CurrentUsageCount = (await this.Storage.GetUserValue<number>(Interaction.guildId, UserId, "UsageCount")) ?? 0;
    const NextUsageCount = CurrentUsageCount + 1;
    const ReplyMessage = (await this.Storage.GetGlobalConfig<string>(Interaction.guildId, "ReplyMessage")) ?? "Pong!";

    await this.Storage.SetUserValue(Interaction.guildId, UserId, "UsageCount", NextUsageCount);
    await Interaction.reply(`${ReplyMessage} Usage count: ${NextUsageCount}`);
  }
}
