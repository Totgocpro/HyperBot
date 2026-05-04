"use client";

import Link from "next/link";
import { useEffect as UseEffect, useState as UseState } from "react";
import type { BotGuildSummary, DashboardElement, SettingsField } from "../../Core/Types";

type DashboardPlugin = {
  Metadata: {
    Id: string;
    DisplayName: string;
    Version: string;
    Author: string;
    Icon: string;
  };
  Commands: Array<{
    Name: string;
    Description: string;
  }>;
  WebInterface: Array<SettingsField & { Value: unknown }>;
  DashboardElements?: Array<DashboardElement & { Value: unknown }>;
};

type PluginSettingsPanelProperties = {
  GuildId: string;
};

type PluginConfigSection = {
  Id: string;
  Label: string;
  Fields: Array<SettingsField & { Value: unknown }>;
};

export function PluginSettingsPanel(Properties: PluginSettingsPanelProperties) {
  const [Plugins, SetPlugins] = UseState<DashboardPlugin[]>([]);
  const [Guild, SetGuild] = UseState<BotGuildSummary | null>(null);
  const [SelectedPluginId, SetSelectedPluginId] = UseState("");
  const [PluginMenuOpen, SetPluginMenuOpen] = UseState(false);
  const [SectionMenuOpen, SetSectionMenuOpen] = UseState(true);
  const [DraftValues, SetDraftValues] = UseState<Record<string, Record<string, unknown>>>({});
  const [Status, SetStatus] = UseState("Loading plugins...");

  const SelectedPlugin = Plugins.find((Plugin) => Plugin.Metadata.Id === SelectedPluginId) ?? Plugins[0];
  const ConfigSections = SelectedPlugin ? BuildConfigSections(SelectedPlugin) : [];
  const HasDashboardOverview = Boolean(SelectedPlugin?.DashboardElements?.length);

  UseEffect(() => {
    void LoadPlugins();
    void LoadGuild();

    const RefreshInterval = window.setInterval(() => {
      void LoadPlugins(true);
    }, 5_000);

    return () => window.clearInterval(RefreshInterval);
  }, [Properties.GuildId]);

  async function LoadGuild(): Promise<void> {
    const Response = await fetch("/api/guilds");

    if (!Response.ok) {
      return;
    }

    const Payload = (await Response.json()) as { Guilds: BotGuildSummary[] };
    SetGuild(Payload.Guilds.find((GuildValue) => GuildValue.Id === Properties.GuildId) ?? null);
  }

  async function LoadPlugins(PreserveDraftValues = false): Promise<void> {
    const Response = await fetch(`/api/plugins/${Properties.GuildId}`, {
      headers: BuildGuildHeaders()
    });

    if (!Response.ok) {
      SetStatus(await Response.text());
      return;
    }

    const Payload = (await Response.json()) as { Plugins: DashboardPlugin[] };
    SetPlugins(Payload.Plugins);
    SetSelectedPluginId((PreviousPluginId) => PreviousPluginId || Payload.Plugins[0]?.Metadata.Id || "");

    if (!PreserveDraftValues) {
      SetDraftValues(BuildDraftValues(Payload.Plugins));
    }

    SetStatus(`${Payload.Plugins.length} plugin(s) available.`);
  }

  async function SavePlugin(Plugin: DashboardPlugin): Promise<void> {
    const MissingRequiredField = Plugin.WebInterface.find((Field) => Field.Required && !DraftValues[Plugin.Metadata.Id]?.[Field.Key]);

    if (MissingRequiredField) {
      SetStatus(`${MissingRequiredField.Label} is required.`);
      return;
    }

    const Response = await fetch(`/api/plugins/${Properties.GuildId}`, {
      method: "PUT",
      headers: {
        ...BuildGuildHeaders(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        PluginId: Plugin.Metadata.Id,
        Values: BuildPersistablePluginValues(Plugin, DraftValues[Plugin.Metadata.Id] ?? {})
      })
    });

    SetStatus(Response.ok ? `${Plugin.Metadata.DisplayName} saved.` : await Response.text());
  }

  function UpdateDraftValue(PluginId: string, Key: string, Value: unknown): void {
    SetDraftValues((PreviousValues) => ({
      ...PreviousValues,
      [PluginId]: {
        ...(PreviousValues[PluginId] ?? {}),
        [Key]: Value
      }
    }));
  }

  return (
    <main className="min-h-screen bg-slate-950 px-3 py-5 text-slate-100 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900 p-4 shadow-xl shadow-black/20 sm:p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-3xl bg-blue-600 text-2xl font-black text-white sm:h-16 sm:w-16">
              {Guild?.Icon ? <img alt="" className="h-16 w-16 rounded-3xl" src={Guild.Icon} /> : (Guild?.Name ?? "S").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <Link className="text-sm font-semibold text-blue-400" href="/">
                Back to servers
              </Link>
              <h1 className="mt-2 truncate text-2xl font-black text-white sm:text-3xl">{Guild?.Name ?? "Discord server"}</h1>
              <p className="mt-1 break-all text-sm text-slate-400 sm:break-normal">
                {Guild?.MemberCount ?? "?"} members | Guild ID: {Properties.GuildId}
              </p>
            </div>
          </div>
          <button className="w-full rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500 sm:w-auto" onClick={() => void LoadPlugins()}>
            Refresh
          </button>
        </header>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <aside className="rounded-3xl border border-slate-800 bg-slate-900 p-3 shadow-xl shadow-black/20 sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="px-2 text-xs font-bold uppercase tracking-wide text-slate-500">Plugins</p>
              <button
                aria-expanded={PluginMenuOpen}
                aria-label="Open plugin menu"
                className="rounded-2xl border border-slate-700 p-2 text-slate-200 hover:bg-slate-800 lg:hidden"
                onClick={() => SetPluginMenuOpen(!PluginMenuOpen)}
              >
                <PluginHamburgerIcon />
              </button>
            </div>
            <div className={`${PluginMenuOpen ? "grid" : "hidden"} mt-3 gap-2 lg:grid lg:space-y-2`}>
              {Plugins.map((Plugin) => (
                <button
                  className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
                    SelectedPlugin?.Metadata.Id === Plugin.Metadata.Id ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800"
                  }`}
                  key={Plugin.Metadata.Id}
                  onClick={() => {
                    SetSelectedPluginId(Plugin.Metadata.Id);
                    SetPluginMenuOpen(false);
                    SetSectionMenuOpen(true);
                  }}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-sm font-black">
                    {Plugin.Metadata.Icon.slice(0, 2).toUpperCase()}
                  </span>
                  <span>
                    <span className="block font-bold">{Plugin.Metadata.DisplayName}</span>
                    <span className={SelectedPlugin?.Metadata.Id === Plugin.Metadata.Id ? "text-xs text-blue-100" : "text-xs text-slate-500"}>
                      {Plugin.Commands.length} command(s)
                    </span>
                  </span>
                </button>
              ))}
            </div>

            {SelectedPlugin ? (
              <div className="mt-4 rounded-3xl border border-slate-800 bg-slate-950 p-3">
                <button
                  className="flex w-full items-center justify-between rounded-2xl px-3 py-2 text-left text-xs font-black uppercase tracking-wide text-slate-500 hover:bg-slate-900"
                  onClick={() => SetSectionMenuOpen(!SectionMenuOpen)}
                >
                  Sections
                  <span className={`text-slate-300 transition-transform duration-200 ${SectionMenuOpen ? "rotate-180" : ""}`}>⌄</span>
                </button>
                <div className={`grid overflow-hidden transition-all duration-300 ${SectionMenuOpen ? "mt-2 max-h-96 opacity-100" : "max-h-0 opacity-0"}`}>
                  {HasDashboardOverview ? (
                    <button className="rounded-2xl px-3 py-2 text-left text-sm font-semibold text-slate-300 hover:bg-slate-900 hover:text-white" onClick={() => ScrollToPluginSection("plugin-section-overview")}>
                      Overview
                    </button>
                  ) : null}
                  {ConfigSections.map((Section) => (
                    <button
                      className="rounded-2xl px-3 py-2 text-left text-sm font-semibold text-slate-300 hover:bg-slate-900 hover:text-white"
                      key={Section.Id}
                      onClick={() => ScrollToPluginSection(`plugin-section-${Section.Id}`)}
                    >
                      {Section.Label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </aside>

          <section className="rounded-3xl border border-slate-800 bg-slate-900 p-4 shadow-xl shadow-black/20 sm:p-6">
            <p className="mb-5 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-300">{Status}</p>

            {SelectedPlugin ? (
              <>
                <div className="flex flex-col gap-3 border-b border-slate-800 pb-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-2xl font-black text-white">{SelectedPlugin.Metadata.DisplayName}</h2>
                    <p className="mt-1 text-sm text-slate-400">
                        Version {SelectedPlugin.Metadata.Version} by {SelectedPlugin.Metadata.Author}
                    </p>
                  </div>
                  <button className="w-full rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500 sm:w-auto" onClick={() => void SavePlugin(SelectedPlugin)}>
                    Save
                  </button>
                </div>

                <div className="mt-6 grid gap-5">
                  {SelectedPlugin.DashboardElements?.length ? (
                    <section className="scroll-mt-28 rounded-[2rem] border border-slate-800 bg-slate-950/40 p-4 sm:p-5" id="plugin-section-overview">
                      <div className="mb-4">
                        <p className="text-xs font-bold uppercase tracking-[0.3em] text-blue-300">Overview</p>
                        <h3 className="mt-2 text-2xl font-black text-white">Plugin dashboard</h3>
                      </div>
                      <div className="grid gap-4">
                        {SelectedPlugin.DashboardElements.map((Element) => (
                          <DashboardElementRenderer Element={Element} key={Element.Key} />
                        ))}
                      </div>
                    </section>
                  ) : null}
                  {ConfigSections.map((Section) => (
                    <section className="scroll-mt-28 rounded-[2rem] border border-slate-800 bg-slate-950/40 p-4 sm:p-5" id={`plugin-section-${Section.Id}`} key={Section.Id}>
                      <div className="mb-4">
                        <p className="text-xs font-bold uppercase tracking-[0.3em] text-blue-300">Configuration</p>
                        <h3 className="mt-2 text-2xl font-black text-white">{Section.Label}</h3>
                      </div>
                      <div className="grid gap-4">
                        {Section.Fields.map((Field) => (
                          <div key={Field.Key}>{RenderField(Properties.GuildId, SelectedPlugin.Metadata.Id, Field, DraftValues, UpdateDraftValue, SetStatus)}</div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-700 p-10 text-center text-slate-400">
                No plugin loaded for this server.
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function DashboardElementRenderer(Properties: { Element: DashboardElement & { Value: unknown } }) {
  const [SelectedMonth, SetSelectedMonth] = UseState(BuildCurrentMonth());
  const Series = BuildMonthlySeries(Properties.Element.Value, SelectedMonth);
  const Total = Series.reduce((TotalValue, Point) => TotalValue + Point.Value, 0);
  const Average = Series.length > 0 ? Total / Series.length : 0;

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-950 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-black text-white">{Properties.Element.Label}</h3>
          <p className="mt-1 text-sm text-slate-500">
            Total: {FormatChartValue(Total, Properties.Element.Unit)} | Average/day: {FormatChartValue(Average, Properties.Element.Unit)}
          </p>
        </div>
        <input
          className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-blue-500"
          onChange={(Event) => SetSelectedMonth(Event.target.value)}
          type="month"
          value={SelectedMonth}
        />
      </div>
      {Properties.Element.Type === "MetricGrid" ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <MetricTile Label="Total" Value={FormatChartValue(Total, Properties.Element.Unit)} />
          <MetricTile Label="Average/day" Value={FormatChartValue(Average, Properties.Element.Unit)} />
          <MetricTile Label="Active days" Value={String(Series.filter((Point) => Point.Value > 0).length)} />
        </div>
      ) : (
        <ChartSvg Series={Series} Type={Properties.Element.Type} Unit={Properties.Element.Unit} />
      )}
    </section>
  );
}

function ChartSvg(Properties: { Series: Array<{ Label: string; Value: number }>; Type: DashboardElement["Type"]; Unit?: string }) {
  const [HoveredIndex, SetHoveredIndex] = UseState<number | null>(null);
  const MaxValue = Math.max(...Properties.Series.map((Point) => Point.Value), 1);
  const Width = 820;
  const Height = 280;
  const Padding = 36;
  const InnerWidth = Width - Padding * 2;
  const InnerHeight = Height - Padding * 2;

  if (Properties.Series.length === 0) {
    return <p className="mt-4 rounded-2xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">No data for this period.</p>;
  }

  const Points = Properties.Series.map((Point, Index) => {
    const X = Padding + (Properties.Series.length === 1 ? InnerWidth / 2 : (Index / (Properties.Series.length - 1)) * InnerWidth);
    const Y = Padding + InnerHeight - (Point.Value / MaxValue) * InnerHeight;
    return { ...Point, X, Y };
  });
  const Polyline = Points.map((Point) => `${Point.X},${Point.Y}`).join(" ");
  const BarWidth = Math.max(4, InnerWidth / Properties.Series.length - 3);
  const HoveredPoint = HoveredIndex === null ? null : Points[HoveredIndex] ?? null;
  const TooltipWidth = 152;
  const TooltipX = HoveredPoint ? Math.min(Math.max(HoveredPoint.X - TooltipWidth / 2, 10), Width - TooltipWidth - 10) : 0;
  const TooltipY = HoveredPoint ? Math.max(HoveredPoint.Y - 72, 10) : 0;

  return (
    <div className="mt-4 overflow-x-auto">
      <svg className="min-w-[720px]" height={Height} onMouseLeave={() => SetHoveredIndex(null)} viewBox={`0 0 ${Width} ${Height}`} width="100%">
        <defs>
          <linearGradient id="HyperBotChartArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgb(59 130 246)" stopOpacity="0.38" />
            <stop offset="100%" stopColor="rgb(59 130 246)" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="HyperBotChartBar" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgb(96 165 250)" />
            <stop offset="100%" stopColor="rgb(37 99 235)" />
          </linearGradient>
        </defs>
        <rect fill="rgb(15 23 42)" height={Height} rx="20" width={Width} />
        {[0, 0.25, 0.5, 0.75, 1].map((Step) => (
          <g key={Step}>
            <line stroke="rgb(51 65 85)" strokeDasharray="4 6" x1={Padding} x2={Width - Padding} y1={Padding + InnerHeight * Step} y2={Padding + InnerHeight * Step} />
            <text fill="rgb(100 116 139)" fontSize="10" textAnchor="end" x={Padding - 8} y={Padding + InnerHeight * Step + 4}>
              {FormatChartValue(MaxValue * (1 - Step), Properties.Unit)}
            </text>
          </g>
        ))}
        {Properties.Type === "LineChart" ? (
          <>
            <polygon fill="url(#HyperBotChartArea)" points={`${Padding},${Height - Padding} ${Polyline} ${Width - Padding},${Height - Padding}`} />
            <polyline fill="none" points={Polyline} stroke="rgb(96 165 250)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
          </>
        ) : null}
        {Points.map((Point) =>
          Properties.Type === "BarChart" ? (
            <rect
              fill={HoveredPoint?.Label === Point.Label ? "rgb(147 197 253)" : "url(#HyperBotChartBar)"}
              height={Height - Padding - Point.Y}
              key={Point.Label}
              onMouseEnter={() => SetHoveredIndex(Points.indexOf(Point))}
              rx="5"
              width={BarWidth}
              x={Point.X - BarWidth / 2}
              y={Point.Y}
            />
          ) : (
            <circle
              cx={Point.X}
              cy={Point.Y}
              fill={HoveredPoint?.Label === Point.Label ? "rgb(255 255 255)" : "rgb(147 197 253)"}
              key={Point.Label}
              onMouseEnter={() => SetHoveredIndex(Points.indexOf(Point))}
              r={HoveredPoint?.Label === Point.Label ? "6" : "4"}
              stroke="rgb(37 99 235)"
              strokeWidth="2"
            />
          )
        )}
        {Points.map((Point, Index) => (
          <rect
            fill="transparent"
            height={InnerHeight}
            key={`hit-${Point.Label}`}
            onMouseEnter={() => SetHoveredIndex(Index)}
            width={Math.max(8, InnerWidth / Properties.Series.length)}
            x={Point.X - Math.max(8, InnerWidth / Properties.Series.length) / 2}
            y={Padding}
          />
        ))}
        {Points.filter((_, Index) => Index % Math.ceil(Points.length / 8) === 0).map((Point) => (
          <text fill="rgb(148 163 184)" fontSize="10" key={Point.Label} textAnchor="middle" x={Point.X} y={Height - 8}>
            {Point.Label.slice(5)}
          </text>
        ))}
        <text fill="rgb(203 213 225)" fontSize="12" x={Padding} y="18">
          Max: {FormatChartValue(MaxValue, Properties.Unit)}
        </text>
        {HoveredPoint ? (
          <g pointerEvents="none">
            <line stroke="rgb(191 219 254)" strokeDasharray="3 5" x1={HoveredPoint.X} x2={HoveredPoint.X} y1={Padding} y2={Height - Padding} />
            <rect fill="rgb(2 6 23)" height="54" opacity="0.96" rx="12" stroke="rgb(59 130 246)" width={TooltipWidth} x={TooltipX} y={TooltipY} />
            <text fill="rgb(226 232 240)" fontSize="12" fontWeight="700" x={TooltipX + 12} y={TooltipY + 22}>
              {HoveredPoint.Label}
            </text>
            <text fill="rgb(147 197 253)" fontSize="12" x={TooltipX + 12} y={TooltipY + 40}>
              {FormatChartValue(HoveredPoint.Value, Properties.Unit)}
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}

function MetricTile(Properties: { Label: string; Value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{Properties.Label}</p>
      <p className="mt-2 text-2xl font-black text-white">{Properties.Value}</p>
    </div>
  );
}

function BuildMonthlySeries(Value: unknown, Month: string): Array<{ Label: string; Value: number }> {
  const Data = IsRecord(Value) ? Value : {};
  const DaysInMonth = new Date(Number(Month.slice(0, 4)), Number(Month.slice(5, 7)), 0).getDate();

  return Array.from({ length: DaysInMonth }, (_, Index) => {
    const Day = String(Index + 1).padStart(2, "0");
    const Label = `${Month}-${Day}`;
    const RawValue = Data[Label];

    return {
      Label,
      Value: typeof RawValue === "number" ? RawValue : 0
    };
  });
}

function BuildCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function IsRecord(Value: unknown): Value is Record<string, unknown> {
  return typeof Value === "object" && Value !== null && !Array.isArray(Value);
}

function FormatChartValue(Value: number, Unit?: string): string {
  if (Unit === "seconds") {
    const Hours = Math.floor(Value / 3600);
    const Minutes = Math.floor((Value % 3600) / 60);
    return `${Hours}h ${Minutes}m`;
  }

  return `${Math.round(Value * 10) / 10}${Unit ? ` ${Unit}` : ""}`;
}

function PluginHamburgerIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </svg>
  );
}

function BuildGuildHeaders(): HeadersInit {
  return {};
}

function BuildConfigSections(Plugin: DashboardPlugin): PluginConfigSection[] {
  const Sections = new Map<string, PluginConfigSection>();

  for (const Field of Plugin.WebInterface) {
    const Label = Field.Section ?? "General";
    const Id = BuildSectionId(Label);
    const ExistingSection = Sections.get(Id);

    if (ExistingSection) {
      ExistingSection.Fields.push(Field);
      continue;
    }

    Sections.set(Id, {
      Id,
      Label,
      Fields: [Field]
    });
  }

  return Array.from(Sections.values());
}

function BuildSectionId(Label: string): string {
  return Label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "general";
}

function ScrollToPluginSection(SectionId: string): void {
  document.getElementById(SectionId)?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function BuildDraftValues(Plugins: DashboardPlugin[]): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    Plugins.map((Plugin) => [
      Plugin.Metadata.Id,
      Object.fromEntries(Plugin.WebInterface.map((Field) => [Field.Key, Field.Value ?? Field.Default]))
    ])
  );
}

function BuildPersistablePluginValues(Plugin: DashboardPlugin, Values: Record<string, unknown>): Record<string, unknown> {
  const PersistableKeys = new Set(Plugin.WebInterface.filter((Field) => Field.Type !== "Button").map((Field) => Field.Key));

  return Object.fromEntries(Object.entries(Values).filter(([Key]) => PersistableKeys.has(Key)));
}

function RenderField(
  GuildId: string,
  PluginId: string,
  Field: SettingsField & { Value: unknown },
  DraftValues: Record<string, Record<string, unknown>>,
  UpdateDraftValue: (PluginId: string, Key: string, Value: unknown) => void,
  SetStatus: (Status: string) => void
) {
  const Value = DraftValues[PluginId]?.[Field.Key] ?? Field.Default;
  const BaseClassName = "mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500";

  if (Field.Type === "Boolean") {
    return (
      <label className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950 p-4 font-semibold text-slate-100">
        {Field.Label}
        <input checked={Boolean(Value)} className="h-5 w-5 accent-blue-600" onChange={(Event) => UpdateDraftValue(PluginId, Field.Key, Event.target.checked)} type="checkbox" />
      </label>
    );
  }

  if (Field.Type === "Select" || Field.Type === "ChannelPicker") {
    return (
      <label className="block text-sm font-bold text-slate-200">
        {Field.Label}
        <select className={BaseClassName} required={Field.Required} onChange={(Event) => UpdateDraftValue(PluginId, Field.Key, Event.target.value)} value={String(Value ?? "")}>
          <option value="">{Field.Required ? "Select a required value" : "Select"}</option>
          {Field.Options?.map((Option) => (
            <option disabled={Option.Disabled} key={String(Option.Value)} value={String(Option.Value)}>
              {Option.Label}
            </option>
          ))}
        </select>
        {Field.Type === "ChannelPicker" ? <p className="mt-2 text-xs text-slate-500">Only supported writable channels can be selected.</p> : null}
      </label>
    );
  }

  if (Field.Type === "List") {
    return (
      <ListField
        Field={Field}
        PluginId={PluginId}
        UpdateDraftValue={UpdateDraftValue}
        Value={Array.isArray(Value) ? Value : []}
      />
    );
  }

  if (Field.Type === "Button") {
    return <ActionButton Field={Field} GuildId={GuildId} PluginId={PluginId} SetStatus={SetStatus} />;
  }

  return (
    <label className="block text-sm font-bold text-slate-200">
      {Field.Label}
      <input
        className={BaseClassName}
        onChange={(Event) => UpdateDraftValue(PluginId, Field.Key, Field.Type === "Number" ? Number(Event.target.value) : Event.target.value)}
        type={Field.Type === "Number" ? "number" : "text"}
        value={String(Value ?? "")}
      />
    </label>
  );
}

function ActionButton(Properties: {
  Field: SettingsField & { Value: unknown };
  GuildId: string;
  PluginId: string;
  SetStatus: (Status: string) => void;
}) {
  const [IsSending, SetIsSending] = UseState(false);

  async function SendAction(): Promise<void> {
    SetIsSending(true);
    Properties.SetStatus(`Sending ${Properties.Field.Label}...`);

    try {
      const Response = await fetch(`/api/plugins/${Properties.GuildId}/actions`, {
        method: "POST",
        headers: {
          ...BuildGuildHeaders(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          PluginId: Properties.PluginId,
          ActionKey: Properties.Field.ActionKey ?? Properties.Field.Key
        })
      });

      Properties.SetStatus(Response.ok ? `${Properties.Field.Label} queued.` : await Response.text());
    } finally {
      SetIsSending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
      <p className="font-bold text-slate-100">{Properties.Field.Label}</p>
      <p className="mt-1 text-xs text-slate-500">Runs a dashboard action without changing saved settings.</p>
      <button
        className="mt-4 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={IsSending}
        onClick={() => void SendAction()}
        type="button"
      >
        {IsSending ? "Sending..." : Properties.Field.ButtonLabel ?? Properties.Field.Label}
      </button>
    </div>
  );
}

function ListField(Properties: {
  Field: SettingsField & { Value: unknown };
  PluginId: string;
  UpdateDraftValue: (PluginId: string, Key: string, Value: unknown) => void;
  Value: unknown[];
}) {
  const BaseClassName = "w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500";

  function UpdateItem(Index: number, Value: unknown): void {
    const NextValue = [...Properties.Value];
    NextValue[Index] = Value;
    Properties.UpdateDraftValue(Properties.PluginId, Properties.Field.Key, NextValue);
  }

  function AddItem(): void {
    const EmptyValue = Properties.Field.ItemType === "Number" ? 0 : "";
    Properties.UpdateDraftValue(Properties.PluginId, Properties.Field.Key, [...Properties.Value, EmptyValue]);
  }

  function RemoveItem(Index: number): void {
    Properties.UpdateDraftValue(Properties.PluginId, Properties.Field.Key, Properties.Value.filter((_, ItemIndex) => ItemIndex !== Index));
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-bold text-slate-100">{Properties.Field.Label}</p>
          <p className="mt-1 text-xs text-slate-500">Add one value per row.</p>
        </div>
        <button className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-500" onClick={AddItem} type="button">
          Add
        </button>
      </div>
      <div className="mt-4 grid gap-2">
        {Properties.Value.length === 0 ? <p className="rounded-xl border border-dashed border-slate-700 p-3 text-sm text-slate-500">No value configured.</p> : null}
        {Properties.Value.map((ItemValue, Index) => (
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]" key={Index}>
            {Properties.Field.ItemType === "ChannelPicker" ? (
              <select className={BaseClassName} onChange={(Event) => UpdateItem(Index, Event.target.value)} value={String(ItemValue ?? "")}>
                <option value="">Select</option>
                {Properties.Field.Options?.map((Option) => (
                  <option disabled={Option.Disabled} key={String(Option.Value)} value={String(Option.Value)}>
                    {Option.Label}
                  </option>
                ))}
              </select>
            ) : (
              <ValidatedListInput
                BaseClassName={BaseClassName}
                Field={Properties.Field}
                ItemValue={ItemValue}
                OnChange={(Value) => UpdateItem(Index, Value)}
              />
            )}
            <button className="rounded-xl border border-red-500/40 px-3 py-2 text-sm font-bold text-red-200 hover:bg-red-500/10" onClick={() => RemoveItem(Index)} type="button">
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ValidatedListInput(Properties: {
  BaseClassName: string;
  Field: SettingsField & { Value: unknown };
  ItemValue: unknown;
  OnChange: (Value: unknown) => void;
}) {
  const StringValue = String(Properties.ItemValue ?? "");
  const RegexError = Properties.Field.ValidateAs === "Regex" ? GetRegexError(StringValue) : null;

  return (
    <div>
      <input
        className={`${Properties.BaseClassName} ${RegexError ? "border-red-500 text-red-100 focus:border-red-400" : ""}`}
        onChange={(Event) => Properties.OnChange(Properties.Field.ItemType === "Number" ? Number(Event.target.value) : Event.target.value)}
        type={Properties.Field.ItemType === "Number" ? "number" : "text"}
        value={StringValue}
      />
      {RegexError ? <p className="mt-1 text-xs font-semibold text-red-300">{RegexError}</p> : null}
    </div>
  );
}

function GetRegexError(Value: string): string | null {
  if (!Value.trim()) {
    return null;
  }

  try {
    new RegExp(Value, "iu");
    return null;
  } catch (ErrorValue) {
    return ErrorValue instanceof Error ? ErrorValue.message : "Invalid regex";
  }
}
