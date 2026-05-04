import { BasePlugin } from "../../src/Core/BasePlugin.js";

export default class CommandAliasesPlugin extends BasePlugin {
  public async OnEnable(): Promise<void> {
    this.Logger.Info("Command Aliases plugin enabled.");
  }

  public async OnDisable(): Promise<void> {
    this.Logger.Info("Command Aliases plugin disabled.");
  }
}
