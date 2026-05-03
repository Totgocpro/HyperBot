import { PluginSettingsPanel } from "@/src/Web/Components/PluginSettingsPanel";
import { RequireAuthenticatedPage } from "@/src/Web/PageAuth";

type DashboardPageProperties = {
  params: Promise<{
    guildId: string;
  }>;
};

export default async function DashboardPage(Properties: DashboardPageProperties) {
  const Params = await Properties.params;
  await RequireAuthenticatedPage(`/dashboard/${Params.guildId}`);

  return <PluginSettingsPanel GuildId={Params.guildId} />;
}
