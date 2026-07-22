"use client";

import { useState as UseState } from "react";
import { RenderField, type BotPreviewIdentity, type DashboardPlugin } from "../../src/Web/Components/PluginInterfaceRenderer.js";

type AchievementEditorProperties = {
  BotIdentity: BotPreviewIdentity | null;
  BotId: string;
  DraftValues: Record<string, Record<string, unknown>>;
  GuildId: string;
  OnCreateChannel: (Name: string) => Promise<string | null>;
  Plugin: DashboardPlugin;
  SetStatus: (Status: string) => void;
  UpdateDraftValue: (PluginId: string, Key: string, Value: unknown) => void;
};

type AchievementType = "send_messages" | "send_images" | "daily_streak_messages" | "daily_streak_voice" | "voice_minutes_total";

type AchievementDefinition = {
  id: string;
  name: string;
  description: string;
  type: AchievementType;
  target: number;
};

const AchievementTypeOptions: { Label: string; Value: AchievementType }[] = [
  { Label: "Send Messages", Value: "send_messages" },
  { Label: "Send Images", Value: "send_images" },
  { Label: "Daily Message Streak", Value: "daily_streak_messages" },
  { Label: "Daily Voice Streak", Value: "daily_streak_voice" },
  { Label: "Total Voice Minutes", Value: "voice_minutes_total" }
];

const TypeColors: Record<string, string> = {
  send_messages: "bg-blue-500/20 text-blue-200 border-blue-500/30",
  send_images: "bg-green-500/20 text-green-200 border-green-500/30",
  daily_streak_messages: "bg-amber-500/20 text-amber-200 border-amber-500/30",
  daily_streak_voice: "bg-purple-500/20 text-purple-200 border-purple-500/30",
  voice_minutes_total: "bg-rose-500/20 text-rose-200 border-rose-500/30"
};

const BaseInputClass = "w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-blue-500";
const BaseLabelClass = "text-xs font-bold uppercase tracking-[0.15em] text-slate-400";

function GenerateId(Name: string): string {
  return Name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || `a-${Math.random().toString(36).slice(2, 8)}`;
}

function NoopCreate(): Promise<string | null> {
  return Promise.resolve(null);
}

export function AchievementEditor(Properties: AchievementEditorProperties) {
  const PluginId = Properties.Plugin.Metadata.Id;

  const ChannelField = Properties.Plugin.WebInterface.find((F) => F.Key === "AnnouncementChannel");
  const RawAchievements = Array.isArray(Properties.DraftValues[PluginId]?.Achievements) ? (Properties.DraftValues[PluginId]!.Achievements as string[]) : [];
  const ParsedAchievements: AchievementDefinition[] = RawAchievements.map((Raw) => {
    try { return JSON.parse(Raw) as AchievementDefinition; } catch { return null; }
  }).filter((A): A is AchievementDefinition => A !== null && !!A.name && !!A.type && A.target > 0);

  const [ShowForm, SetShowForm] = UseState(false);
  const [EditingId, SetEditingId] = UseState<string | null>(null);
  const [FormName, SetFormName] = UseState("");
  const [FormDescription, SetFormDescription] = UseState("");
  const [FormType, SetFormType] = UseState<AchievementType>("send_messages");
  const [FormTarget, SetFormTarget] = UseState(1);

  function OpenAddForm(): void {
    SetEditingId(null);
    SetFormName("");
    SetFormDescription("");
    SetFormType("send_messages");
    SetFormTarget(1);
    SetShowForm(true);
  }

  function OpenEditForm(Achievement: AchievementDefinition): void {
    SetEditingId(Achievement.id);
    SetFormName(Achievement.name);
    SetFormDescription(Achievement.description ?? "");
    SetFormType(Achievement.type);
    SetFormTarget(Achievement.target);
    SetShowForm(true);
  }

  function SaveForm(): void {
    const Name = FormName.trim();
    if (!Name || FormTarget < 1) {
      Properties.SetStatus("Achievement name and a target of at least 1 are required.");
      return;
    }

    let Updated = [...ParsedAchievements];

    if (EditingId) {
      Updated = Updated.map((A) => A.id === EditingId
        ? { ...A, name: Name, description: FormDescription.trim(), type: FormType, target: FormTarget }
        : A);
    } else {
      Updated.push({ id: GenerateId(Name), name: Name, description: FormDescription.trim(), type: FormType, target: FormTarget });
    }

    Properties.UpdateDraftValue(PluginId, "Achievements", Updated.map((A) => JSON.stringify(A)));
    SetShowForm(false);
    SetEditingId(null);
    Properties.SetStatus(EditingId ? "Achievement updated." : "Achievement added.");
  }

  function DeleteAchievement(Id: string): void {
    const Updated = ParsedAchievements.filter((A) => A.id !== Id);
    Properties.UpdateDraftValue(PluginId, "Achievements", Updated.map((A) => JSON.stringify(A)));
    Properties.SetStatus("Achievement deleted.");
  }

  return (
    <div className="grid min-w-0 gap-5">
      <section className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 lg:rounded-[2rem] lg:p-5">
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-blue-300">General</p>
          <h3 className="mt-2 text-xl font-black text-white lg:text-2xl">Achievement settings</h3>
        </div>

        {ChannelField ? RenderField(
          Properties.BotId,
          Properties.GuildId,
          PluginId,
          ChannelField,
          Properties.DraftValues,
          Properties.UpdateDraftValue,
          Properties.SetStatus,
          NoopCreate,
          Properties.OnCreateChannel,
          Properties.BotIdentity
        ) : (
          <label className="block">
            <span className={BaseLabelClass}>Announcement channel</span>
            <input
              className={`${BaseInputClass} mt-2`}
              onChange={(Event) => Properties.UpdateDraftValue(PluginId, "AnnouncementChannel", Event.target.value)}
              placeholder="Channel ID"
              value={String(Properties.DraftValues[PluginId]?.AnnouncementChannel ?? "")}
            />
          </label>
        )}

        <label className="mt-4 flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950 p-4 font-semibold text-slate-100">
          DM on completion
          <input
            checked={Boolean(Properties.DraftValues[PluginId]?.DmOnCompletion ?? true)}
            className="h-5 w-5 accent-blue-600"
            onChange={(Event) => Properties.UpdateDraftValue(PluginId, "DmOnCompletion", Event.target.checked)}
            type="checkbox"
          />
        </label>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 lg:rounded-[2rem] lg:p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-blue-300">Achievements</p>
            <h3 className="mt-2 text-xl font-black text-white lg:text-2xl">Achievement definitions</h3>
            <p className="mt-1 text-sm font-semibold text-slate-400">{ParsedAchievements.length} achievement(s) configured</p>
          </div>
          <button
            className="shrink-0 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-500"
            onClick={OpenAddForm}
            type="button"
          >
            Add achievement
          </button>
        </div>

        {ParsedAchievements.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">
            No achievements configured. Click &quot;Add achievement&quot; to create one.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {ParsedAchievements.map((Achievement) => (
              <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4" key={Achievement.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="truncate text-base font-bold text-white">{Achievement.name}</h4>
                    {Achievement.description ? (
                      <p className="mt-1 text-sm text-slate-400 line-clamp-2">{Achievement.description}</p>
                    ) : null}
                    <span className={`mt-2 inline-block rounded-lg border px-2.5 py-1 text-xs font-bold ${TypeColors[Achievement.type] ?? "bg-slate-500/20 text-slate-200"}`}>
                      {AchievementTypeOptions.find((O) => O.Value === Achievement.type)?.Label ?? Achievement.type}
                    </span>
                  </div>
                </div>
                <div className="mt-3 space-y-1 text-sm text-slate-400">
                  <p>Goal: <span className="font-bold text-slate-200">{Achievement.target}</span></p>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    className="flex-1 rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-800"
                    onClick={() => OpenEditForm(Achievement)}
                    type="button"
                  >
                    Edit
                  </button>
                  <button
                    className="flex-1 rounded-xl border border-red-500/40 px-3 py-2 text-xs font-bold text-red-200 transition hover:bg-red-500/10"
                    onClick={() => DeleteAchievement(Achievement.id)}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {ShowForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <section className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-950 p-5 shadow-2xl">
            <h4 className="text-xl font-black text-white">{EditingId ? "Edit achievement" : "Add achievement"}</h4>

            <label className="mt-4 block">
              <span className={BaseLabelClass}>Name</span>
              <input
                className={`${BaseInputClass} mt-1`}
                onChange={(Event) => SetFormName(Event.target.value)}
                placeholder="Server-themed name"
                value={FormName}
              />
              <span className="mt-1 block text-xs font-medium text-slate-500">Display name shown in the server.</span>
            </label>

            <label className="mt-4 block">
              <span className={BaseLabelClass}>Description</span>
              <textarea
                className={`${BaseInputClass} mt-1 min-h-[5rem] resize-y`}
                onChange={(Event) => SetFormDescription(Event.target.value)}
                placeholder="Send 4 images in any channel"
                value={FormDescription}
              />
              <span className="mt-1 block text-xs font-medium text-slate-500">Describes the action required to complete this achievement.</span>
            </label>

            <label className="mt-4 block">
              <span className={BaseLabelClass}>Type</span>
              <select
                className={`${BaseInputClass} mt-1 cursor-pointer`}
                onChange={(Event) => SetFormType(Event.target.value as AchievementType)}
                value={FormType}
              >
                {AchievementTypeOptions.map((Option) => (
                  <option key={Option.Value} value={Option.Value}>{Option.Label}</option>
                ))}
              </select>
            </label>

            <label className="mt-4 block">
              <span className={BaseLabelClass}>Goal</span>
              <input
                className={`${BaseInputClass} mt-1`}
                min={1}
                onChange={(Event) => SetFormTarget(Math.max(1, Number(Event.target.value) || 1))}
                type="number"
                value={FormTarget}
              />
            </label>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-bold text-slate-200 transition hover:bg-slate-800"
                onClick={() => SetShowForm(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-500"
                onClick={SaveForm}
                type="button"
              >
                {EditingId ? "Save changes" : "Add achievement"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
