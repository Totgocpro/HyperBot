import type { PluginLoggerContract } from "./Types.js";

export class PluginLogger implements PluginLoggerContract {
  private readonly Prefix: string;

  public constructor(PluginName: string) {
    this.Prefix = `[Plugin:${PluginName}]`;
  }

  public Info(Message: string, Metadata?: unknown): void {
    console.info(this.Format(Message), Metadata ?? "");
  }

  public Warn(Message: string, Metadata?: unknown): void {
    console.warn(this.Format(Message), Metadata ?? "");
  }

  public Error(Message: string, Metadata?: unknown): void {
    console.error(this.Format(Message), Metadata ?? "");
  }

  private Format(Message: string): string {
    return `${this.Prefix} ${Message}`;
  }
}
