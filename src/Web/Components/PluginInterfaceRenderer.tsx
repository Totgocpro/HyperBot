"use client";

import { useEffect as UseEffect, useState as UseState, type ReactNode } from "react";
import type { DashboardElement, SettingsField } from "../../Core/Types";
import { CustomSelect } from "./CustomSelect";
import { MentionTextInput } from "./EmbedMentionInput";

export type DashboardPlugin = {
  Metadata: {
    Id: string;
    DisplayName: string;
    Version: string;
    Author: string;
    Icon: string;
  };
  Category?: string;
  Commands: Array<{
    Name: string;
    Description: string;
  }>;
  Dependencies?: string[];
  DependencyErrors?: string[];
  WebInterface: Array<SettingsField & { Value: unknown }>;
  DashboardElements?: Array<DashboardElement & { Value: unknown }>;
};

export type PluginConfigSection = {
  Id: string;
  Label: string;
  Fields: Array<SettingsField & { Value: unknown }>;
  Collapsible: boolean;
  DefaultCollapsed: boolean;
  Group?: string;
};

export type PluginConfigGroup = {
  Label: string;
  Collapsible: boolean;
  DefaultCollapsed: boolean;
  Sections: PluginConfigSection[];
};

export type EditableEmbedField = {
  Name: string;
  Value: string;
  Inline: boolean;
};

export type EditableEmbed = {
  Name: string;
  AuthorName: string;
  AuthorIconUrl: string;
  Title: string;
  Url: string;
  Description: string;
  Color: string;
  ThumbnailUrl: string;
  ImageUrl: string;
  ImageDataUrl: string;
  ImageName: string;
  FooterText: string;
  FooterIconUrl: string;
  Timestamp: boolean;
  Fields: EditableEmbedField[];
};

export type BotPreviewIdentity = {
  Name: string;
  AvatarUrl: string | null;
};

const EmbedInputClassName = "mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500";

export function BuildConfigSections(Plugin: DashboardPlugin, Values: Record<string, unknown> = {}, OnlyVisible = false): PluginConfigSection[] {
  const Sections = new Map<string, PluginConfigSection>();

  for (const Field of Plugin.WebInterface.filter((FieldValue) => !OnlyVisible || IsFieldVisible(FieldValue, Values))) {
    const Label = Field.Section ?? "General";
    const Id = BuildSectionId(Label);
    const ExistingSection = Sections.get(Id);

    if (ExistingSection) {
      ExistingSection.Fields.push(Field);
      if (Field.Collapsible) {
        ExistingSection.Collapsible = true;
      }
      if (Field.DefaultCollapsed && !ExistingSection.DefaultCollapsed) {
        ExistingSection.DefaultCollapsed = true;
      }
      if (Field.Group && !ExistingSection.Group) {
        ExistingSection.Group = Field.Group;
      }
      continue;
    }

    Sections.set(Id, {
      Id,
      Label,
      Fields: [Field],
      Collapsible: Field.Collapsible ?? false,
      DefaultCollapsed: Field.DefaultCollapsed ?? false,
      Group: Field.Group
    });
  }

  return Array.from(Sections.values());
}

export function BuildConfigGroups(Sections: PluginConfigSection[]): Array<PluginConfigSection | PluginConfigGroup> {
  const Groups = new Map<string, PluginConfigSection[]>();
  const Ungrouped: PluginConfigSection[] = [];

  for (const Section of Sections) {
    if (Section.Group) {
      const Existing = Groups.get(Section.Group);
      if (Existing) {
        Existing.push(Section);
      } else {
        Groups.set(Section.Group, [Section]);
      }
    } else {
      Ungrouped.push(Section);
    }
  }

  const Result: Array<PluginConfigSection | PluginConfigGroup> = [...Ungrouped];

  for (const [Label, GroupSections] of Groups) {
    const AnyCollapsible = GroupSections.some((S) => S.Collapsible);
    Result.push({
      Label,
      Collapsible: true,
      DefaultCollapsed: true,
      Sections: GroupSections
    });
  }

  return Result;
}

export function IsFieldVisible(Field: SettingsField, Values: Record<string, unknown>): boolean {
  const AllRules = Array.isArray(Field.VisibleWhen) ? Field.VisibleWhen : Field.VisibleWhen ? [Field.VisibleWhen] : [];

  if (AllRules.length > 0 && !AllRules.every((Rule) => MatchesVisibilityRule(Rule, Values))) {
    return false;
  }

  if (Field.VisibleWhenAny?.length && !Field.VisibleWhenAny.some((Rule) => MatchesVisibilityRule(Rule, Values))) {
    return false;
  }

  return true;
}

function MatchesVisibilityRule(Rule: NonNullable<SettingsField["VisibleWhenAny"]>[number], Values: Record<string, unknown>): boolean {
  const CurrentValue = Values[Rule.Key];
  const Matches = String(CurrentValue) === String(Rule.Value);

  return Rule.Operator === "NotEquals" ? !Matches : Matches;
}

function BuildSectionId(Label: string): string {
  return Label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "general";
}

export function AnimatedVisibility(Properties: {
  ClassName?: string;
  Id?: string;
  IsVisible: boolean;
  children?: ReactNode;
}) {
  const [ShouldRender, SetShouldRender] = UseState(Properties.IsVisible);
  const [IsTransitioning, SetIsTransitioning] = UseState(false);

  UseEffect(() => {
    if (Properties.IsVisible) {
      SetShouldRender(true);
      SetIsTransitioning(true);
      const Timeout = window.setTimeout(() => SetIsTransitioning(false), 300);
      return () => window.clearTimeout(Timeout);
    }

    SetIsTransitioning(true);
    const Timeout = window.setTimeout(() => {
      SetShouldRender(false);
      SetIsTransitioning(false);
    }, 300);
    return () => window.clearTimeout(Timeout);
  }, [Properties.IsVisible]);

  if (!ShouldRender) {
    return null;
  }

  return (
    <div
      aria-hidden={!Properties.IsVisible}
      className={`${Properties.ClassName ?? ""} relative focus-within:z-50 transition-[max-height,opacity,transform,margin] duration-300 ease-out ${Properties.IsVisible ? "max-h-[6000px] translate-y-0 opacity-100" : "pointer-events-none max-h-0 -translate-y-2 opacity-0"} ${IsTransitioning ? "overflow-hidden" : ""}`}
      id={Properties.Id}
    >
      {Properties.children}
    </div>
  );
}

export function RenderField(
  BotId: string,
  GuildId: string,
  PluginId: string,
  Field: SettingsField & { Value: unknown },
  DraftValues: Record<string, Record<string, unknown>>,
  UpdateDraftValue: (PluginId: string, Key: string, Value: unknown) => void,
  SetStatus: (Status: string) => void,
  OnCreateRole: (Name: string, Color: string) => Promise<string | null>,
  OnCreateChannel: (Name: string) => Promise<string | null>,
  BotIdentity?: BotPreviewIdentity | null
) {
  const Value = DraftValues[PluginId]?.[Field.Key] ?? Field.Default;
  const BaseClassName = "mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500";
  const IsReadOnly = Field.ReadOnly === true;

  if (Field.Type === "Boolean") {
    return (
      <label className="block rounded-2xl border border-slate-800 bg-slate-950 p-4 font-semibold text-slate-100">
        <span className="flex items-center justify-between">
          {Field.Label}
          <input checked={Boolean(Value)} className="h-5 w-5 accent-blue-600" disabled={IsReadOnly} onChange={(Event) => UpdateDraftValue(PluginId, Field.Key, Event.target.checked)} type="checkbox" />
        </span>
        {Field.Description ? <span className="mt-2 block text-xs font-medium text-slate-500">{Field.Description}</span> : null}
      </label>
    );
  }

  if (Field.Type === "Select" || Field.Type === "ChannelPicker" || Field.Type === "RolePicker") {
    const ReadOnlyOption = IsReadOnly ? Field.Options?.find((Option) => String(Option.Value) === String(Value)) : undefined;
    return (
      <div className="relative block text-sm font-bold text-slate-200 focus-within:z-10">
        {Field.Label}
        {IsReadOnly ? (
          <div className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-400">
            {ReadOnlyOption?.Label ?? String(Value ?? "")}
          </div>
        ) : (
          <CustomSelect
            ClassName="mt-2"
            CreateButtonLabel={Field.Type === "ChannelPicker" ? "Create channel" : "Create role"}
            CreateColorEnabled={Field.Type !== "ChannelPicker"}
            CreateErrorMessage={Field.Type === "ChannelPicker" ? "Channel creation failed." : "Role creation failed."}
            CreateInputPlaceholder={Field.Type === "ChannelPicker" ? "channel-name" : "Role name"}
            CreateLabel={Field.Type === "ChannelPicker" ? "Create channel" : "Create role"}
            EmptyCreateError={Field.Type === "ChannelPicker" ? "Channel name is required." : "Role name is required."}
            EmptyLabel={Field.Required ? "Select a required value" : "Select"}
            OnChange={(NextValue) => UpdateDraftValue(PluginId, Field.Key, NextValue)}
            OnCreate={Field.Type === "RolePicker" ? OnCreateRole : Field.Type === "ChannelPicker" ? OnCreateChannel : undefined}
            Options={Field.Options ?? []}
            Required={Field.Required}
            Value={String(Value ?? "")}
          />
        )}
        {Field.Description ? <p className="mt-2 text-xs font-medium text-slate-500">{Field.Description}</p> : null}
        {Field.Type === "ChannelPicker" ? <p className="mt-2 text-xs text-slate-500">Only supported writable channels can be selected.</p> : null}
        {Field.Type === "RolePicker" ? <p className="mt-2 text-xs text-slate-500">Only selectable server roles are listed.</p> : null}
      </div>
    );
  }

  if (Field.Type === "List") {
    return (
      <ListField
        Field={Field}
        OnCreateChannel={OnCreateChannel}
        OnCreateRole={OnCreateRole}
        PluginId={PluginId}
        ReadOnly={IsReadOnly}
        UpdateDraftValue={UpdateDraftValue}
        Value={Array.isArray(Value) ? Value : []}
      />
    );
  }

  if (Field.Type === "EmbedEditor") {
    return (
      <div>
        <p className="mb-2 text-sm font-bold text-slate-200">{Field.Label}</p>
        <AdvancedEmbedEditor
          BotId={BotId}
          BotIdentity={BotIdentity}
          EmbedValue={ParseEditableEmbed(Value)}
          GuildId={GuildId}
          ReadOnly={IsReadOnly}
          OnChange={(NextEmbed) => UpdateDraftValue(PluginId, Field.Key, NextEmbed)}
          PlaceholderText={Field.Description}
        />
      </div>
    );
  }

  if (Field.Type === "Button") {
    return <ActionButton BotId={BotId} Field={Field} GuildId={GuildId} PluginId={PluginId} SetStatus={SetStatus} />;
  }

  if (Field.Type === "Custom") {
    return null;
  }

  return (
    <label className="block text-sm font-bold text-slate-200">
      {Field.Label}
      <input
        className={`${BaseClassName} ${IsReadOnly ? "cursor-not-allowed text-slate-400" : ""}`}
        disabled={IsReadOnly}
        onChange={(Event) => UpdateDraftValue(PluginId, Field.Key, Field.Type === "Number" ? Number(Event.target.value) : Event.target.value)}
        type={Field.Type === "Number" ? "number" : Field.Type === "Password" ? "password" : "text"}
        value={String(Value ?? "")}
      />
      {Field.Description ? <span className="mt-2 block text-xs font-medium text-slate-500">{Field.Description}</span> : null}
    </label>
  );
}

function ListField(Properties: {
  Field: SettingsField & { Value: unknown };
  OnCreateChannel: (Name: string) => Promise<string | null>;
  OnCreateRole: (Name: string, Color: string) => Promise<string | null>;
  PluginId: string;
  ReadOnly?: boolean;
  UpdateDraftValue: (PluginId: string, Key: string, Value: unknown) => void;
  Value: unknown[];
}) {
  const IsReadOnly = Properties.ReadOnly === true;
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
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <p className="font-bold text-slate-100">{Properties.Field.Label}</p>
        {IsReadOnly ? null : (
          <button className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-500" onClick={AddItem} type="button">
            Add
          </button>
        )}
      </div>
      <div className="mt-4 grid gap-2">
        {Properties.Value.length === 0 ? <p className="rounded-xl border border-dashed border-slate-700 p-3 text-sm text-slate-500">No value configured.</p> : null}
        {Properties.Value.map((ItemValue, Index) => (
          <div className="relative grid gap-2 sm:grid-cols-[1fr_auto] focus-within:z-10" key={Index}>
            {Properties.Field.ItemType === "ChannelPicker" || Properties.Field.ItemType === "RolePicker" ? (
              <CustomSelect
                CreateButtonLabel={Properties.Field.ItemType === "ChannelPicker" ? "Create channel" : "Create role"}
                CreateColorEnabled={Properties.Field.ItemType !== "ChannelPicker"}
                CreateErrorMessage={Properties.Field.ItemType === "ChannelPicker" ? "Channel creation failed." : "Role creation failed."}
                CreateInputPlaceholder={Properties.Field.ItemType === "ChannelPicker" ? "channel-name" : "Role name"}
                CreateLabel={Properties.Field.ItemType === "ChannelPicker" ? "Create channel" : "Create role"}
                EmptyCreateError={Properties.Field.ItemType === "ChannelPicker" ? "Channel name is required." : "Role name is required."}
                EmptyLabel="Select"
                OnChange={(Value) => UpdateItem(Index, Value)}
                OnCreate={Properties.Field.ItemType === "RolePicker" ? Properties.OnCreateRole : Properties.Field.ItemType === "ChannelPicker" ? Properties.OnCreateChannel : undefined}
                Options={Properties.Field.Options ?? []}
                Value={String(ItemValue ?? "")}
              />
            ) : (
              <input
                className={BaseClassName}
                disabled={IsReadOnly}
                onChange={(Event) => UpdateItem(Index, Properties.Field.ItemType === "Number" ? Number(Event.target.value) : Event.target.value)}
                type={Properties.Field.ItemType === "Number" ? "number" : "text"}
                value={String(ItemValue ?? "")}
              />
            )}
            {IsReadOnly ? null : (
              <button className="rounded-xl border border-red-500/40 px-3 py-2 text-sm font-bold text-red-200 hover:bg-red-500/10" onClick={() => RemoveItem(Index)} type="button">
                Remove
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionButton(Properties: {
  BotId: string;
  Field: SettingsField;
  GuildId: string;
  PluginId: string;
  SetStatus: (Status: string) => void;
}) {
  const [IsSending, SetIsSending] = UseState(false);

  async function SendAction(): Promise<void> {
    SetIsSending(true);
    Properties.SetStatus(`Sending ${Properties.Field.Label}...`);

    try {
      const Response = await fetch(`/api/plugins/${Properties.BotId}/${Properties.GuildId}/actions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          PluginId: Properties.PluginId,
          ActionKey: Properties.Field.ActionKey ?? Properties.Field.Key
        })
      });

      if (!Response.ok) {
        Properties.SetStatus(`Action failed: ${await Response.text()}`);
        return;
      }

      Properties.SetStatus(`${Properties.Field.Label} successful.`);
    } catch (ErrorValue) {
      Properties.SetStatus(`Network error while sending ${Properties.Field.Label.toLowerCase()}.`);
    } finally {
      SetIsSending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
      <p className="font-bold text-slate-100">{Properties.Field.Label}</p>
      {Properties.Field.Description ? <p className="mt-1 text-xs text-slate-500">{Properties.Field.Description}</p> : null}
      <button
        className={`mt-4 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition ${IsSending ? "cursor-not-allowed opacity-60" : "hover:bg-blue-500"}`}
        onClick={() => !IsSending && void SendAction()}
        type="button"
      >
        {IsSending ? "Sending..." : Properties.Field.ButtonLabel ?? Properties.Field.Label}
      </button>
    </div>
  );
}

export function AdvancedEmbedEditor(Properties: {
  BotId?: string;
  BotIdentity?: BotPreviewIdentity | null;
  EmbedValue: EditableEmbed;
  GuildId?: string;
  OnChange: (EmbedValue: EditableEmbed) => void;
  PlaceholderText?: string;
  ReadOnly?: boolean;
}) {
  const CurrentEmbed = Properties.EmbedValue;
  const [SelectedPart, SetSelectedPart] = UseState<"Content" | "Author" | "Media" | "Footer" | "Fields">("Content");

  function UpdateEmbed(Patch: Partial<EditableEmbed>): void {
    Properties.OnChange({ ...CurrentEmbed, ...Patch });
  }

  function UpdateField(Index: number, Patch: Partial<EditableEmbedField>): void {
    UpdateEmbed({
      Fields: CurrentEmbed.Fields.map((Field, FieldIndex) => (FieldIndex === Index ? { ...Field, ...Patch } : Field))
    });
  }

  const IsReadOnly = Properties.ReadOnly === true;

  function AddField(): void {
    if (IsReadOnly) return;
    UpdateEmbed({
      Fields: [...CurrentEmbed.Fields, { Name: "Field title", Value: "Field value", Inline: false }]
    });
  }

  function RemoveField(Index: number): void {
    if (IsReadOnly) return;
    UpdateEmbed({
      Fields: CurrentEmbed.Fields.filter((_, FieldIndex) => FieldIndex !== Index)
    });
  }

  function UploadEmbedImage(FileValue: File | undefined): void {
    if (!FileValue) {
      return;
    }

    if (!FileValue.type.startsWith("image/")) {
      return;
    }

    const Reader = new FileReader();
    Reader.onload = () => UpdateEmbed({ ImageDataUrl: String(Reader.result ?? ""), ImageName: FileValue.name || "embed-image.png", ImageUrl: "" });
    Reader.readAsDataURL(FileValue);
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid content-start gap-3">
        {Properties.PlaceholderText ? <p className="rounded-2xl border border-slate-800 bg-slate-900 p-3 text-xs text-slate-400">{Properties.PlaceholderText}</p> : null}
        <DiscordEmbedPreview BotIdentity={Properties.BotIdentity} Embed={CurrentEmbed} OnSelectPart={SetSelectedPart} SelectedPart={SelectedPart} />
      </div>
      <section className="rounded-3xl border border-slate-800 bg-slate-950 p-4">
        <div className="mb-4 flex flex-wrap gap-2">
          {(["Content", "Author", "Media", "Footer", "Fields"] as const).map((Part) => (
            <button className={SelectedPart === Part ? "rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white" : "rounded-xl border border-slate-700 px-3 py-2 text-sm font-bold text-slate-300 hover:bg-slate-800"} disabled={IsReadOnly} key={Part} onClick={() => SetSelectedPart(Part)} type="button">
              {Part}
            </button>
          ))}
        </div>
        <div className={IsReadOnly ? "pointer-events-none select-none opacity-70" : ""}>

        {SelectedPart === "Content" ? (
          <div className="grid gap-3">
            <label className="block text-sm font-bold text-slate-200">
              Title
              <MentionTextInput BotId={Properties.BotId} ClassName={EmbedInputClassName} GuildId={Properties.GuildId} MaxLength={256} OnChange={(Value) => UpdateEmbed({ Title: Value })} Value={CurrentEmbed.Title} />
            </label>
            <label className="block text-sm font-bold text-slate-200">
              Description
              <MentionTextInput BotId={Properties.BotId} ClassName={`${EmbedInputClassName} min-h-40 resize-y`} GuildId={Properties.GuildId} MaxLength={4096} Multiline={true} OnChange={(Value) => UpdateEmbed({ Description: Value })} Value={CurrentEmbed.Description} />
            </label>
            <label className="block text-sm font-bold text-slate-200">
              Title URL
              <input className={EmbedInputClassName} onChange={(Event) => UpdateEmbed({ Url: Event.target.value })} placeholder="https://example.com" value={CurrentEmbed.Url} />
            </label>
            <label className="block text-sm font-bold text-slate-200">
              Accent color
              <input className={EmbedInputClassName} onChange={(Event) => UpdateEmbed({ Color: Event.target.value })} type="color" value={NormalizeEmbedColor(CurrentEmbed.Color)} />
            </label>
          </div>
        ) : null}

        {SelectedPart === "Author" ? (
          <div className="grid gap-3">
            <label className="block text-sm font-bold text-slate-200">
              Author name
              <MentionTextInput BotId={Properties.BotId} ClassName={EmbedInputClassName} GuildId={Properties.GuildId} MaxLength={256} OnChange={(Value) => UpdateEmbed({ AuthorName: Value })} Value={CurrentEmbed.AuthorName} />
            </label>
            <label className="block text-sm font-bold text-slate-200">
              Author icon URL
              <input className={EmbedInputClassName} onChange={(Event) => UpdateEmbed({ AuthorIconUrl: Event.target.value })} value={CurrentEmbed.AuthorIconUrl} />
            </label>
          </div>
        ) : null}

        {SelectedPart === "Media" ? (
          <div className="grid gap-3">
            <label className="block text-sm font-bold text-slate-200">
              Thumbnail URL
              <input className={EmbedInputClassName} onChange={(Event) => UpdateEmbed({ ThumbnailUrl: Event.target.value })} value={CurrentEmbed.ThumbnailUrl} />
            </label>
            <label className="block text-sm font-bold text-slate-200">
              Image URL
              <input className={EmbedInputClassName} onChange={(Event) => UpdateEmbed({ ImageUrl: Event.target.value, ImageDataUrl: "" })} value={CurrentEmbed.ImageUrl} />
            </label>
            <label className="block text-sm font-bold text-slate-200">
              Upload image
              <span className="mt-2 flex cursor-pointer items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200 hover:bg-slate-800">
                {CurrentEmbed.ImageDataUrl ? CurrentEmbed.ImageName || "Uploaded image" : "Choose image"}
                <input accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(Event) => UploadEmbedImage(Event.target.files?.[0])} type="file" />
              </span>
            </label>
            {CurrentEmbed.ImageDataUrl ? <button className="rounded-xl border border-red-500/40 px-3 py-2 text-sm font-bold text-red-200 hover:bg-red-500/10" onClick={() => UpdateEmbed({ ImageDataUrl: "", ImageName: "" })} type="button">Remove uploaded image</button> : null}
          </div>
        ) : null}

        {SelectedPart === "Footer" ? (
          <div className="grid gap-3">
            <label className="block text-sm font-bold text-slate-200">
              Footer text
              <MentionTextInput BotId={Properties.BotId} ClassName={EmbedInputClassName} GuildId={Properties.GuildId} MaxLength={2048} OnChange={(Value) => UpdateEmbed({ FooterText: Value })} Value={CurrentEmbed.FooterText} />
            </label>
            <label className="block text-sm font-bold text-slate-200">
              Footer icon URL
              <input className={EmbedInputClassName} onChange={(Event) => UpdateEmbed({ FooterIconUrl: Event.target.value })} value={CurrentEmbed.FooterIconUrl} />
            </label>
            <label className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 font-semibold text-slate-100">
              Timestamp
              <input checked={CurrentEmbed.Timestamp} className="h-5 w-5 accent-blue-600" onChange={(Event) => UpdateEmbed({ Timestamp: Event.target.checked })} type="checkbox" />
            </label>
          </div>
        ) : null}

        {SelectedPart === "Fields" ? (
          <div className="grid gap-3">
            <button className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-500" onClick={AddField} type="button">
              Add field
            </button>
            {CurrentEmbed.Fields.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-700 p-4 text-sm text-slate-500">No field configured.</p> : null}
            {CurrentEmbed.Fields.map((Field, Index) => (
              <div className="grid gap-2 rounded-2xl border border-slate-800 bg-slate-900 p-3" key={Index}>
                <MentionTextInput BotId={Properties.BotId} ClassName={EmbedInputClassName} GuildId={Properties.GuildId} MaxLength={256} OnChange={(Value) => UpdateField(Index, { Name: Value })} Placeholder="Field name" Value={Field.Name} />
                <MentionTextInput BotId={Properties.BotId} ClassName={`${EmbedInputClassName} min-h-20 resize-y`} GuildId={Properties.GuildId} MaxLength={1024} Multiline={true} OnChange={(Value) => UpdateField(Index, { Value })} Placeholder="Field value" Value={Field.Value} />
                <div className="flex gap-2">
                  <label className="flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm font-bold text-slate-200">
                    <input checked={Field.Inline} className="h-4 w-4 accent-blue-600" onChange={(Event) => UpdateField(Index, { Inline: Event.target.checked })} type="checkbox" />
                    Inline
                  </label>
                  <button className="rounded-xl border border-red-500/40 px-3 py-2 text-sm font-bold text-red-200 hover:bg-red-500/10" onClick={() => RemoveField(Index)} type="button">
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        </div>
      </section>
    </div>
  );
}

export function DiscordEmbedPreview(Properties: { BotIdentity?: BotPreviewIdentity | null; Embed: EditableEmbed; OnSelectPart?: (Part: "Content" | "Author" | "Media" | "Footer" | "Fields") => void; SelectedPart?: string }) {
  const { Embed } = Properties;
  const ColorStyle = Embed.Color ? { borderLeftColor: Embed.Color } : {};
  const BotName = Properties.BotIdentity?.Name?.trim() || "HyperBot";
  const BotInitials = BuildBotInitials(BotName);

  return (
    <div className="w-full max-w-[520px] rounded-lg bg-[#313338] p-4 text-sm text-[#dbdee1] shadow-lg">
      <div className="flex gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#5865f2]">
          {Properties.BotIdentity?.AvatarUrl ? <img alt="" className="h-10 w-10 rounded-full object-cover" src={Properties.BotIdentity.AvatarUrl} /> : <span className="text-sm font-black text-white">{BotInitials}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="min-w-0 max-w-[240px] truncate font-bold text-white">{BotName}</span>
            <span className="rounded bg-[#5865f2] px-1 py-0.5 text-[10px] font-bold text-white">BOT</span>
          </div>
          <div className={`mt-2 rounded border-l-4 bg-[#2b2d31] p-3 pl-4 ${Embed.Color ? "" : "border-[#1e1f22]"}`} style={ColorStyle}>
            <div className="flex flex-col gap-2">
              {Embed.AuthorName ? (
                <button className={`flex items-center gap-2 text-left hover:opacity-80 ${Properties.SelectedPart === "Author" ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-[#2b2d31]" : ""}`} onClick={() => Properties.OnSelectPart?.("Author")}>
                  {Embed.AuthorIconUrl ? <img alt="" className="h-6 w-6 rounded-full" src={Embed.AuthorIconUrl} /> : null}
                  <span className="font-bold text-white">{Embed.AuthorName}</span>
                </button>
              ) : null}

              <button className={`text-left hover:opacity-80 ${Properties.SelectedPart === "Content" ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-[#2b2d31]" : ""}`} onClick={() => Properties.OnSelectPart?.("Content")}>
                {Embed.Title ? <p className="mb-1 block font-bold text-[#00a8fc] hover:underline">{Embed.Title}</p> : null}
                {Embed.Description ? <p className="whitespace-pre-wrap">{Embed.Description}</p> : null}
              </button>

              {Embed.Fields.length > 0 ? (
                <button className={`mt-2 grid gap-3 text-left hover:opacity-80 sm:grid-cols-2 lg:grid-cols-3 ${Properties.SelectedPart === "Fields" ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-[#2b2d31]" : ""}`} onClick={() => Properties.OnSelectPart?.("Fields")}>
                  {Embed.Fields.map((Field, Index) => (
                    <div className={Field.Inline ? "" : "col-span-full"} key={Index}>
                      <p className="font-bold text-white">{Field.Name}</p>
                      <p className="mt-1 whitespace-pre-wrap">{Field.Value}</p>
                    </div>
                  ))}
                </button>
              ) : null}

              {Embed.ImageDataUrl || Embed.ImageUrl ? (
                <button className={`mt-2 text-left hover:opacity-80 ${Properties.SelectedPart === "Media" ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-[#2b2d31]" : ""}`} onClick={() => Properties.OnSelectPart?.("Media")}>
                  <img alt="" className="max-h-[300px] rounded-lg object-contain" src={Embed.ImageDataUrl || Embed.ImageUrl} />
                </button>
              ) : null}

              {Embed.FooterText ? (
                <button className={`mt-2 flex items-center gap-2 text-left hover:opacity-80 ${Properties.SelectedPart === "Footer" ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-[#2b2d31]" : ""}`} onClick={() => Properties.OnSelectPart?.("Footer")}>
                  {Embed.FooterIconUrl ? <img alt="" className="h-5 w-5 rounded-full" src={Embed.FooterIconUrl} /> : null}
                  <span className="text-xs text-[#949ba4]">
                    {Embed.FooterText}
                    {Embed.Timestamp ? " • Today at preview time" : ""}
                  </span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NormalizeEmbedColor(Value: string): string {
  if (!Value) return "#1e1f22";
  if (Value.startsWith("#")) return Value;
  const Numeric = Number(Value);
  if (isNaN(Numeric)) return "#1e1f22";
  return `#${Numeric.toString(16).padStart(6, "0")}`;
}

function BuildBotInitials(Name: string): string {
  const Words = Name.trim().split(/\s+/u).filter(Boolean);

  if (Words.length >= 2) {
    return `${Words[0][0] ?? ""}${Words[1][0] ?? ""}`.toUpperCase();
  }

  return Name.slice(0, 2).toUpperCase() || "HB";
}

export function ParseEditableEmbed(Value: unknown): EditableEmbed {
  const Data = (typeof Value === "object" && Value !== null ? Value : {}) as Partial<EditableEmbed>;

  return {
    Name: Data.Name || "",
    AuthorName: Data.AuthorName || "",
    AuthorIconUrl: Data.AuthorIconUrl || "",
    Title: Data.Title || "",
    Url: Data.Url || "",
    Description: Data.Description || "",
    Color: NormalizeEmbedColor(Data.Color || ""),
    ThumbnailUrl: Data.ThumbnailUrl || "",
    ImageUrl: Data.ImageUrl || "",
    ImageDataUrl: Data.ImageDataUrl || "",
    ImageName: Data.ImageName || "",
    FooterText: Data.FooterText || "",
    FooterIconUrl: Data.FooterIconUrl || "",
    Timestamp: Boolean(Data.Timestamp),
    Fields: Array.isArray(Data.Fields) ? Data.Fields.map((f: any) => ({ Name: f.Name || "", Value: f.Value || "", Inline: Boolean(f.Inline) })) : []
  };
}
