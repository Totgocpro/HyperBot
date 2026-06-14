import { EventEmitter } from "node:events";

export type PluginChangeEvent = {
  BotId: string;
  GuildId: string;
  PluginId: string;
};

const Emitter = new EventEmitter();
Emitter.setMaxListeners(200);

export function EmitPluginChange(BotId: string, GuildId: string, PluginId: string): void {
  const Channel = `PluginChange:${BotId}:${GuildId}`;
  Emitter.emit(Channel, { BotId, GuildId, PluginId } satisfies PluginChangeEvent);
}

export function OnPluginChange(
  BotId: string,
  GuildId: string,
  Handler: (Event: PluginChangeEvent) => void
): () => void {
  const Channel = `PluginChange:${BotId}:${GuildId}`;
  Emitter.on(Channel, Handler);
  return () => {
    Emitter.off(Channel, Handler);
  };
}
