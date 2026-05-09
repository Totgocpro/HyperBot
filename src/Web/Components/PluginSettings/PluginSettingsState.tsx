import type { DashboardPlugin } from "../PluginInterfaceRenderer";

export function PluginHamburgerIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </svg>
  );
}


export function ScrollToPluginSection(SectionId: string): void {
  document.getElementById(SectionId)?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

export function BuildDraftValues(Plugins: DashboardPlugin[]): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    Plugins.map((Plugin) => [
      Plugin.Metadata.Id,
      BuildPluginDraftValues(Plugin)
    ])
  );
}

export function BuildPluginDraftValues(Plugin: DashboardPlugin): Record<string, unknown> {
  return Object.fromEntries(Plugin.WebInterface.map((Field) => [Field.Key, Field.Value ?? Field.Default]));
}

export function BuildPersistablePluginValues(Plugin: DashboardPlugin, Values: Record<string, unknown>): Record<string, unknown> {
  const PersistableKeys = new Set(Plugin.WebInterface.filter((Field) => Field.Type !== "Button").map((Field) => Field.Key));

  return Object.fromEntries(Object.entries(Values).filter(([Key]) => PersistableKeys.has(Key)));
}

export function HasPluginUnsavedChanges(Plugin: DashboardPlugin, DraftValues: Record<string, Record<string, unknown>>): boolean {
  const PluginSavedDraftValues = BuildPluginDraftValues(Plugin);
  const SavedValues = BuildPersistablePluginValues(Plugin, PluginSavedDraftValues);
  const CurrentValues = BuildPersistablePluginValues(Plugin, {
    ...PluginSavedDraftValues,
    ...(DraftValues[Plugin.Metadata.Id] ?? {})
  });

  return StableStringify(SavedValues) !== StableStringify(CurrentValues);
}

export function UpdatePluginSavedValues(Plugins: DashboardPlugin[], PluginId: string, SavedValues: Record<string, unknown>): DashboardPlugin[] {
  return Plugins.map((Plugin) => {
    if (Plugin.Metadata.Id !== PluginId) {
      return Plugin;
    }

    return {
      ...Plugin,
      WebInterface: Plugin.WebInterface.map((Field) => ({
        ...Field,
        Value: Object.prototype.hasOwnProperty.call(SavedValues, Field.Key) ? SavedValues[Field.Key] : Field.Value
      }))
    };
  });
}

export function StableStringify(Value: unknown): string {
  if (Array.isArray(Value)) {
    return `[${Value.map((Item) => StableStringify(Item)).join(",")}]`;
  }

  if (Value && typeof Value === "object") {
    const Entries = Object.entries(Value).sort(([LeftKey], [RightKey]) => LeftKey.localeCompare(RightKey));
    return `{${Entries.map(([Key, EntryValue]) => `${JSON.stringify(Key)}:${StableStringify(EntryValue)}`).join(",")}}`;
  }

  return JSON.stringify(Value);
}
