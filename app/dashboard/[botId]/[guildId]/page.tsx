import { PluginSettingsPanel } from "@/src/Web/Components/PluginSettingsPanel";
import { RequireAuthenticatedPage } from "@/src/Web/PageAuth";

type DashboardPageProperties = {
  params: Promise<{
    botId: string;
    guildId: string;
  }>;
};

export default async function DashboardPage(Properties: DashboardPageProperties) {
  const Params = await Properties.params;
  await RequireAuthenticatedPage(`/dashboard/${Params.botId}/${Params.guildId}`);

  return <PluginSettingsPanel BotId={Params.botId} GuildId={Params.guildId} />;
}
