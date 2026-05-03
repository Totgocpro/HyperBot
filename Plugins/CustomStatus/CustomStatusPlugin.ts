import { BasePlugin } from "../../src/Core/BasePlugin.js";

type PresenceStatus = "online" | "idle" | "dnd";
type ActivityTypeName = "Playing" | "Watching" | "Listening";

const ActivityTypeValues: Record<ActivityTypeName, number> = {
  Playing: 0,
  Listening: 2,
  Watching: 3
};

export default class CustomStatusPlugin extends BasePlugin {
  private LastAppliedSignature = "";

  public async OnEnable(): Promise<void> {
    await this.RefreshStatus();
    this.Logger.Info("Custom status plugin enabled.");
  }

  public async OnDisable(): Promise<void> {
    this.Logger.Info("Custom status plugin disabled.");
  }

  public async OnTick(): Promise<void> {
    await this.RefreshStatus();
  }

  private async RefreshStatus(): Promise<void> {
    const StatusText = (await this.Storage.GetGlobalConfig<string>("Global", "StatusText")) ?? "HyperBot Dashboard";
    const PresenceStatusValue = (await this.Storage.GetGlobalConfig<PresenceStatus>("Global", "PresenceStatus")) ?? "online";
    const ActivityTypeValue = (await this.Storage.GetGlobalConfig<ActivityTypeName>("Global", "ActivityType")) ?? "Playing";
    const Signature = `${StatusText}:${PresenceStatusValue}:${ActivityTypeValue}`;

    if (Signature === this.LastAppliedSignature) {
      return;
    }

    this.LastAppliedSignature = Signature;
    await this.ApplyStatus(StatusText, PresenceStatusValue, ActivityTypeValue);
  }

  private async ApplyStatus(StatusText: string, PresenceStatusValue: PresenceStatus, ActivityTypeValue: ActivityTypeName): Promise<void> {
    this.DiscordClient.user?.setPresence({
      status: PresenceStatusValue,
      activities: [
        {
          name: StatusText,
          type: ActivityTypeValues[ActivityTypeValue]
        }
      ]
    });
  }
}
