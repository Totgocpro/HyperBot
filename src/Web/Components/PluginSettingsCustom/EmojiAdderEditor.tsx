"use client";

import { useEffect as UseEffect, useRef as UseRef, useState as UseState } from "react";
import { decompressFrames, parseGIF, type ParsedFrame } from "gifuct-js";
import { GetGuildEmojiLimits, type GuildEmojiLimits } from "@/src/Core/DiscordLimits";
import type { DashboardPlugin } from "../PluginInterfaceRenderer";
import { BuildGuildHeaders } from "../PluginSettings/PluginSettingsShared";

type EmojiAdderEditorProperties = {
  BotId: string;
  DraftValues: Record<string, Record<string, unknown>>;
  GuildId: string;
  Plugin: DashboardPlugin;
  SetStatus: (Status: string) => void;
};

type ExistingEmoji = {
  Animated: boolean;
  Id: string;
  Name: string;
};

type TenorResult = {
  Description: string;
  Id: string;
  PreviewUrl: string;
  SourceUrl: string;
  SuggestedName: string;
};

type CropMode = "Fit" | "Square";
type OutputMode = "Animated" | "StaticFrame";

type SelectedEmoji = TenorResult & {
  CropMode: CropMode;
  FramePercent: number;
  Name: string;
  OutputMode: OutputMode;
};

type PreparedEmoji = {
  Animated?: boolean;
  DataUrl?: string;
  Error?: string;
  Id: string;
  Name: string;
  SizeBytes?: number;
  SourceUrl: string;
};

type FramePreview = {
  DataUrl?: string;
  Error?: string;
  Key: string;
  Loading: boolean;
};

type DecodedGif = {
  Frames: ParsedFrame[];
  Height: number;
  Width: number;
};

export function EmojiAdderEditor(Properties: EmojiAdderEditorProperties) {
  const Values = Properties.DraftValues[Properties.Plugin.Metadata.Id] ?? {};
  const [ExistingEmojis, SetExistingEmojis] = UseState<ExistingEmoji[]>([]);
  const [EmojiLimits, SetEmojiLimits] = UseState<GuildEmojiLimits>(GetGuildEmojiLimits(0));
  const [SearchOpen, SetSearchOpen] = UseState(false);
  const [Query, SetQuery] = UseState("");
  const [Results, SetResults] = UseState<TenorResult[]>([]);
  const [NextPosition, SetNextPosition] = UseState("");
  const [SelectedEmojis, SetSelectedEmojis] = UseState<SelectedEmoji[]>([]);
  const [PreparedEmojis, SetPreparedEmojis] = UseState<PreparedEmoji[]>([]);
  const [FramePreviews, SetFramePreviews] = UseState<Record<string, FramePreview>>({});
  const [EmojiPendingDeletion, SetEmojiPendingDeletion] = UseState<ExistingEmoji | null>(null);
  const [DeletingEmojiId, SetDeletingEmojiId] = UseState("");
  const [OptimizingCurrent, SetOptimizingCurrent] = UseState(0);
  const [OptimizingTotal, SetOptimizingTotal] = UseState(0);
  const [Busy, SetBusy] = UseState(false);
  const SentinelReference = UseRef<HTMLDivElement | null>(null);
  const DecodedGifCache = UseRef<Map<string, Promise<DecodedGif>>>(new Map());
  const ClientFramePreviewCache = UseRef<Map<string, string>>(new Map());
  const ExistingAnimatedEmojiCount = ExistingEmojis.filter((Emoji) => Emoji.Animated).length;
  const ExistingStaticEmojiCount = ExistingEmojis.length - ExistingAnimatedEmojiCount;
  const RemainingAnimatedEmojiSlots = Math.max(0, EmojiLimits.MaxAnimatedEmojis - ExistingAnimatedEmojiCount);
  const RemainingStaticEmojiSlots = Math.max(0, EmojiLimits.MaxStaticEmojis - ExistingStaticEmojiCount);
  const SelectedAnimatedEmojiCount = SelectedEmojis.filter((Emoji) => Emoji.OutputMode === "Animated").length;
  const SelectedStaticEmojiCount = SelectedEmojis.length - SelectedAnimatedEmojiCount;
  const AvailableAnimatedSelectionSlots = Math.max(0, RemainingAnimatedEmojiSlots - SelectedAnimatedEmojiCount);
  const AvailableStaticSelectionSlots = Math.max(0, RemainingStaticEmojiSlots - SelectedStaticEmojiCount);
  const ValidPreparedEmojis = PreparedEmojis.filter((Emoji) => Emoji.DataUrl);
  const ValidAnimatedPreparedCount = ValidPreparedEmojis.filter((Emoji) => IsAnimatedEmojiDataUrl(Emoji.DataUrl ?? "")).length;
  const ValidStaticPreparedCount = ValidPreparedEmojis.length - ValidAnimatedPreparedCount;
  const SelectionExceedsLimit = SelectedAnimatedEmojiCount > RemainingAnimatedEmojiSlots || SelectedStaticEmojiCount > RemainingStaticEmojiSlots;
  const PreparedExceedsLimit = ValidAnimatedPreparedCount > RemainingAnimatedEmojiSlots || ValidStaticPreparedCount > RemainingStaticEmojiSlots;
  const IsOptimizing = Busy && OptimizingTotal > 0 && OptimizingCurrent < OptimizingTotal;

  UseEffect(() => {
    void LoadExistingEmojis();
  }, [Properties.BotId, Properties.GuildId]);

  UseEffect(() => {
    if (!SearchOpen) {
      return;
    }

    SetResults([]);
    SetNextPosition("");
    const Timeout = window.setTimeout(() => {
      void SearchTenor("", true);
    }, 250);
    return () => window.clearTimeout(Timeout);
  }, [Query, SearchOpen]);

  UseEffect(() => {
    if (!SearchOpen || !SentinelReference.current) {
      return;
    }

    const Observer = new IntersectionObserver((Entries) => {
      if (Entries.some((Entry) => Entry.isIntersecting) && NextPosition && !Busy) {
        void SearchTenor(NextPosition, false);
      }
    });
    Observer.observe(SentinelReference.current);
    return () => Observer.disconnect();
  }, [SearchOpen, NextPosition, Busy, Query]);

  UseEffect(() => {
    const StaticFrameEmojis = SelectedEmojis.filter((Emoji) => Emoji.OutputMode === "StaticFrame");

    if (StaticFrameEmojis.length === 0) {
      SetFramePreviews({});
      return;
    }

    const AbortControllerValue = new AbortController();
    const Timeout = window.setTimeout(() => {
      for (const Emoji of StaticFrameEmojis) {
        const PreviewKey = BuildFramePreviewKey(Emoji);
        SetFramePreviews((PreviousValues) => {
          const ExistingPreview = PreviousValues[Emoji.Id];

          if (ExistingPreview?.Key === PreviewKey && (ExistingPreview.DataUrl || ExistingPreview.Loading)) {
            return PreviousValues;
          }

          return {
            ...PreviousValues,
            [Emoji.Id]: {
              Key: PreviewKey,
              Loading: true
            }
          };
        });
        void LoadFramePreview(Emoji, PreviewKey, AbortControllerValue.signal);
      }

      SetFramePreviews((PreviousValues) => Object.fromEntries(Object.entries(PreviousValues).filter(([EmojiId]) => StaticFrameEmojis.some((Emoji) => Emoji.Id === EmojiId))));
    }, 40);

    return () => {
      AbortControllerValue.abort();
      window.clearTimeout(Timeout);
    };
  }, [SelectedEmojis, Properties.BotId, Properties.GuildId]);

  async function LoadExistingEmojis(): Promise<void> {
    const Response = await fetch(`/api/plugins/${Properties.BotId}/${Properties.GuildId}/mentions`, {
      headers: BuildGuildHeaders()
    });

    if (!Response.ok) {
      return;
    }

    const Payload = await Response.json() as { EmojiLimits?: GuildEmojiLimits; Emojis: ExistingEmoji[] };
    SetExistingEmojis(Payload.Emojis ?? []);
    SetEmojiLimits(Payload.EmojiLimits ?? GetGuildEmojiLimits(0));
  }

  async function SearchTenor(Position: string, Reset: boolean): Promise<void> {
    SetBusy(true);

    try {
      const Response = await fetch(`/api/plugins/${Properties.BotId}/${Properties.GuildId}/emoji-adder/tenor`, {
        method: "POST",
        headers: {
          ...BuildGuildHeaders(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ApiKey: String(Values.TenorApiKey ?? ""),
          ContentFilter: String(Values.TenorContentFilter ?? "medium"),
          Pos: Position,
          Query
        })
      });

      if (!Response.ok) {
        Properties.SetStatus(await Response.text());
        return;
      }

      const Payload = await Response.json() as { Next: string; Results: TenorResult[] };
      SetResults((PreviousResults) => Reset ? MergeUniqueTenorResults([], Payload.Results) : MergeUniqueTenorResults(PreviousResults, Payload.Results));
      SetNextPosition(Payload.Next);
    } finally {
      SetBusy(false);
    }
  }

  function AddCandidate(Result: TenorResult): void {
    if (IsResultSelected(Result)) {
      Properties.SetStatus("Emoji already selected.");
      return;
    }

    if (AvailableAnimatedSelectionSlots <= 0 && AvailableStaticSelectionSlots <= 0) {
      Properties.SetStatus("Discord emoji limits reached.");
      return;
    }

    SetSelectedEmojis((PreviousValues) => {
      const PreviousAnimatedCount = PreviousValues.filter((Value) => Value.OutputMode === "Animated").length;
      const PreviousStaticCount = PreviousValues.length - PreviousAnimatedCount;
      const OutputModeValue: OutputMode = PreviousAnimatedCount < RemainingAnimatedEmojiSlots ? "Animated" : "StaticFrame";

      if (PreviousValues.some((Value) => IsSameTenorResult(Value, Result))) {
        return PreviousValues;
      }

      if ((OutputModeValue === "Animated" && PreviousAnimatedCount >= RemainingAnimatedEmojiSlots) || (OutputModeValue === "StaticFrame" && PreviousStaticCount >= RemainingStaticEmojiSlots)) {
        return PreviousValues;
      }

      return [...PreviousValues, {
        ...Result,
        CropMode: "Fit",
        FramePercent: 0,
        Name: BuildUniqueEmojiName(Result.SuggestedName, [...ExistingEmojis.map((Emoji) => Emoji.Name), ...PreviousValues.map((Emoji) => Emoji.Name)]),
        OutputMode: OutputModeValue
      }];
    });
    SetPreparedEmojis([]);
    ResetOptimizationProgress();
  }

  function UpdateSelectedName(Id: string, Name: string): void {
    SetSelectedEmojis((PreviousValues) => PreviousValues.map((Value) => Value.Id === Id ? { ...Value, Name: NormalizeEmojiNameInput(Name) } : Value));
    SetPreparedEmojis([]);
    ResetOptimizationProgress();
  }

  function UpdateSelectedOutputMode(Id: string, OutputModeValue: OutputMode): void {
    SetSelectedEmojis((PreviousValues) => PreviousValues.map((Value) => Value.Id === Id ? { ...Value, OutputMode: OutputModeValue } : Value));
    SetPreparedEmojis([]);
    ResetOptimizationProgress();
  }

  function UpdateSelectedFramePercent(Id: string, FramePercent: number): void {
    SetSelectedEmojis((PreviousValues) => PreviousValues.map((Value) => Value.Id === Id ? { ...Value, FramePercent } : Value));
    SetPreparedEmojis([]);
    ResetOptimizationProgress();
  }

  function UpdateSelectedCropMode(Id: string, CropModeValue: CropMode): void {
    SetSelectedEmojis((PreviousValues) => PreviousValues.map((Value) => Value.Id === Id ? { ...Value, CropMode: CropModeValue } : Value));
    SetPreparedEmojis([]);
    ResetOptimizationProgress();
  }

  async function LoadFramePreview(Emoji: SelectedEmoji, PreviewKey: string, AbortSignalValue: AbortSignal): Promise<void> {
    try {
      const ClientPreview = await BuildClientFramePreview(Emoji, PreviewKey);

      if (ClientPreview) {
        SetFramePreviews((PreviousValues) => PreviousValues[Emoji.Id]?.Key === PreviewKey ? {
          ...PreviousValues,
          [Emoji.Id]: {
            DataUrl: ClientPreview,
            Key: PreviewKey,
            Loading: false
          }
        } : PreviousValues);
        return;
      }

      const Response = await fetch(`/api/plugins/${Properties.BotId}/${Properties.GuildId}/emoji-adder/frame-preview`, {
        method: "POST",
        headers: {
          ...BuildGuildHeaders(),
          "Content-Type": "application/json"
        },
        signal: AbortSignalValue,
        body: JSON.stringify({
          CropMode: Emoji.CropMode,
          FramePercent: Emoji.FramePercent,
          SourceUrl: Emoji.SourceUrl
        })
      });

      if (!Response.ok) {
        throw new Error(await Response.text());
      }

      const Payload = await Response.json() as { DataUrl: string };
      SetFramePreviews((PreviousValues) => PreviousValues[Emoji.Id]?.Key === PreviewKey ? {
        ...PreviousValues,
        [Emoji.Id]: {
          DataUrl: Payload.DataUrl,
          Key: PreviewKey,
          Loading: false
        }
      } : PreviousValues);
    } catch (ErrorValue) {
      if (AbortSignalValue.aborted) {
        return;
      }

      SetFramePreviews((PreviousValues) => PreviousValues[Emoji.Id]?.Key === PreviewKey ? {
        ...PreviousValues,
        [Emoji.Id]: {
          Error: ErrorValue instanceof Error ? ErrorValue.message : String(ErrorValue),
          Key: PreviewKey,
          Loading: false
        }
      } : PreviousValues);
    }
  }

  async function BuildClientFramePreview(Emoji: SelectedEmoji, PreviewKey: string): Promise<string | null> {
    const CachedPreview = ClientFramePreviewCache.current.get(PreviewKey);

    if (CachedPreview) {
      return CachedPreview;
    }

    try {
      const DecodedGifValue = await GetDecodedGif(Emoji.SourceUrl);
      const FrameCount = Math.max(1, DecodedGifValue.Frames.length);
      const FrameIndex = Math.min(FrameCount - 1, Math.max(0, Math.round((FrameCount - 1) * (Emoji.FramePercent / 100))));
      const DataUrl = DrawGifFrameToDataUrl(DecodedGifValue, FrameIndex, Emoji.CropMode);
      ClientFramePreviewCache.current.set(PreviewKey, DataUrl);
      return DataUrl;
    } catch {
      return null;
    }
  }

  async function GetDecodedGif(SourceUrl: string): Promise<DecodedGif> {
    const ExistingPromise = DecodedGifCache.current.get(SourceUrl);

    if (ExistingPromise) {
      return ExistingPromise;
    }

    const DecodePromise = fetch(SourceUrl).then(async (Response) => {
      if (!Response.ok) {
        throw new Error(`Frame source download failed: ${Response.status}`);
      }

      const ArrayBufferValue = await Response.arrayBuffer();
      const ParsedGifValue = parseGIF(ArrayBufferValue);

      return {
        Frames: decompressFrames(ParsedGifValue, true),
        Height: ParsedGifValue.lsd.height,
        Width: ParsedGifValue.lsd.width
      };
    }).catch((ErrorValue) => {
      DecodedGifCache.current.delete(SourceUrl);
      throw ErrorValue;
    });
    DecodedGifCache.current.set(SourceUrl, DecodePromise);
    return DecodePromise;
  }

  function RemoveSelected(Id: string): void {
    SetSelectedEmojis((PreviousValues) => PreviousValues.filter((Value) => Value.Id !== Id));
    SetPreparedEmojis((PreviousValues) => PreviousValues.filter((Value) => Value.Id !== Id));
    ResetOptimizationProgress();
  }

  function IsResultSelected(Result: TenorResult): boolean {
    return SelectedEmojis.some((Value) => IsSameTenorResult(Value, Result));
  }

  async function PrepareSelected(): Promise<void> {
    if (SelectedEmojis.length === 0) {
      Properties.SetStatus("Select at least one emoji first.");
      return;
    }

    if (SelectionExceedsLimit) {
      Properties.SetStatus("Selected emojis exceed remaining Discord emoji slots.");
      return;
    }

    SetBusy(true);
    SetPreparedEmojis([]);
    SetOptimizingCurrent(0);
    SetOptimizingTotal(SelectedEmojis.length);
    Properties.SetStatus(`Optimizing emojis 0/${SelectedEmojis.length}...`);

    try {
      const Results: PreparedEmoji[] = [];
      let Failed = false;

      for (let Index = 0; Index < SelectedEmojis.length; Index += 1) {
        const Emoji = SelectedEmojis[Index];
        const Response = await fetch(`/api/plugins/${Properties.BotId}/${Properties.GuildId}/emoji-adder/optimize`, {
          method: "POST",
          headers: {
            ...BuildGuildHeaders(),
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            Items: [{
              Id: Emoji.Id,
              Name: Emoji.Name,
              CropMode: Emoji.CropMode,
              FramePercent: Emoji.FramePercent,
              OutputMode: Emoji.OutputMode,
              SourceUrl: Emoji.SourceUrl
            }]
          })
        });

        if (!Response.ok) {
          Properties.SetStatus(await Response.text());
          Failed = true;
          break;
        }

        const Payload = await Response.json() as { Results: PreparedEmoji[] };
        const Result = Payload.Results[0];

        if (Result) {
          Results.push(Result);
          SetPreparedEmojis((PreviousValues) => [...PreviousValues.filter((Value) => Value.Id !== Result.Id), Result]);
        }

        SetOptimizingCurrent(Index + 1);
        Properties.SetStatus(`Optimizing emojis ${Index + 1}/${SelectedEmojis.length}...`);
      }

      if (!Failed) {
        Properties.SetStatus(`${Results.filter((Emoji) => Emoji.DataUrl).length} emoji(s) ready for review.`);
      }
    } finally {
      SetBusy(false);
    }
  }

  async function AddPrepared(): Promise<void> {
    const ValidEmojis = PreparedEmojis.filter((Emoji) => Emoji.DataUrl);

    if (ValidEmojis.length === 0) {
      Properties.SetStatus("Prepare at least one valid emoji first.");
      return;
    }

    if (ValidAnimatedPreparedCount > RemainingAnimatedEmojiSlots) {
      Properties.SetStatus(`Only ${RemainingAnimatedEmojiSlots} animated Discord emoji slot(s) left; remove ${ValidAnimatedPreparedCount - RemainingAnimatedEmojiSlots} ready animated emoji(s) first.`);
      return;
    }

    if (ValidStaticPreparedCount > RemainingStaticEmojiSlots) {
      Properties.SetStatus(`Only ${RemainingStaticEmojiSlots} static Discord emoji slot(s) left; remove ${ValidStaticPreparedCount - RemainingStaticEmojiSlots} ready static emoji(s) first.`);
      return;
    }

    SetBusy(true);

    try {
      const Response = await fetch(`/api/plugins/${Properties.BotId}/${Properties.GuildId}/actions`, {
        method: "POST",
        headers: {
          ...BuildGuildHeaders(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ActionKey: "AddEmojis",
          PluginId: Properties.Plugin.Metadata.Id,
          Payload: {
            Emojis: ValidEmojis.map((Emoji) => ({
              DataUrl: Emoji.DataUrl,
              Name: Emoji.Name
            }))
          }
        })
      });

      Properties.SetStatus(Response.ok ? `${ValidEmojis.length} emoji add request(s) queued.` : await Response.text());
      if (Response.ok) {
        SetPreparedEmojis([]);
        SetSelectedEmojis([]);
        void RefreshExistingEmojisAfterAdd();
      }
    } finally {
      SetBusy(false);
    }
  }

  function ResetOptimizationProgress(): void {
    SetOptimizingCurrent(0);
    SetOptimizingTotal(0);
  }

  async function DeleteExistingEmoji(): Promise<void> {
    if (!EmojiPendingDeletion) {
      return;
    }

    SetDeletingEmojiId(EmojiPendingDeletion.Id);

    try {
      const Response = await fetch(`/api/plugins/${Properties.BotId}/${Properties.GuildId}/actions`, {
        method: "POST",
        headers: {
          ...BuildGuildHeaders(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          ActionKey: "DeleteEmoji",
          PluginId: Properties.Plugin.Metadata.Id,
          Payload: {
            EmojiId: EmojiPendingDeletion.Id,
            Name: EmojiPendingDeletion.Name
          }
        })
      });

      Properties.SetStatus(Response.ok ? `Emoji :${EmojiPendingDeletion.Name}: delete request queued.` : await Response.text());

      if (Response.ok) {
        SetEmojiPendingDeletion(null);
        void RefreshExistingEmojisAfterAdd();
      }
    } finally {
      SetDeletingEmojiId("");
    }
  }

  async function RefreshExistingEmojisAfterAdd(): Promise<void> {
    for (const Delay of [1_500, 3_000, 6_000, 10_000]) {
      await new Promise((Resolve) => window.setTimeout(Resolve, Delay));
      await LoadExistingEmojis();
    }
  }

  return (
    <section className="rounded-[2rem] border border-slate-800 bg-slate-950/40 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-blue-300">Emoji adder</p>
          <h3 className="mt-2 text-2xl font-black text-white">Server emojis</h3>
          <p className="mt-1 text-sm font-semibold text-slate-400">
            Static {ExistingStaticEmojiCount}/{EmojiLimits.MaxStaticEmojis} - Animated {ExistingAnimatedEmojiCount}/{EmojiLimits.MaxAnimatedEmojis} - Boost tier {EmojiLimits.PremiumTier}
          </p>
        </div>
        <button className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300" disabled={RemainingAnimatedEmojiSlots <= 0 && RemainingStaticEmojiSlots <= 0} onClick={() => SetSearchOpen(true)} type="button">
          {RemainingAnimatedEmojiSlots <= 0 && RemainingStaticEmojiSlots <= 0 ? "Limits reached" : "Add emoji"}
        </button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
        {ExistingEmojis.length === 0 ? <p className="col-span-full rounded-2xl border border-dashed border-slate-700 p-4 text-sm text-slate-500">No cached server emoji yet.</p> : null}
        {ExistingEmojis.map((Emoji) => (
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3" key={Emoji.Id}>
            <img alt="" className="mx-auto h-16 w-16 object-contain" src={`https://cdn.discordapp.com/emojis/${Emoji.Id}.${Emoji.Animated ? "gif" : "png"}`} />
            <p className="mt-2 truncate text-center text-sm font-bold text-slate-200">:{Emoji.Name}:</p>
            <button className="mt-3 w-full rounded-xl border border-red-500/40 px-3 py-2 text-xs font-bold text-red-200 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60" disabled={DeletingEmojiId === Emoji.Id} onClick={() => SetEmojiPendingDeletion(Emoji)} type="button">
              {DeletingEmojiId === Emoji.Id ? "Deleting..." : "Delete"}
            </button>
          </div>
        ))}
      </div>

      {SelectedEmojis.length > 0 ? (
        <section className="mt-5 rounded-3xl border border-slate-800 bg-slate-950 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h4 className="text-xl font-black text-white">Selected emojis</h4>
              <p className={`mt-1 text-sm font-semibold ${SelectionExceedsLimit ? "text-red-300" : "text-slate-500"}`}>
                Animated {SelectedAnimatedEmojiCount}/{RemainingAnimatedEmojiSlots} - Static {SelectedStaticEmojiCount}/{RemainingStaticEmojiSlots}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60" disabled={Busy || SelectionExceedsLimit} onClick={() => void PrepareSelected()} type="button">
                {IsOptimizing ? "Optimizing..." : "Optimize and preview"}
              </button>
              <button className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60" disabled={Busy || ValidPreparedEmojis.length === 0 || PreparedExceedsLimit || (RemainingAnimatedEmojiSlots <= 0 && RemainingStaticEmojiSlots <= 0)} onClick={() => void AddPrepared()} type="button">
                Add all ready emojis
              </button>
            </div>
          </div>
          {OptimizingTotal > 0 ? (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                <span>Optimization</span>
                <span>{OptimizingCurrent}/{OptimizingTotal}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${OptimizingTotal > 0 ? Math.round((OptimizingCurrent / OptimizingTotal) * 100) : 0}%` }} />
              </div>
            </div>
          ) : null}
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {SelectedEmojis.map((Emoji) => {
              const Prepared = PreparedEmojis.find((Value) => Value.Id === Emoji.Id);
              const FramePreviewValue = FramePreviews[Emoji.Id];
              const PreviewSource = Prepared?.DataUrl ?? (Emoji.OutputMode === "StaticFrame" ? FramePreviewValue?.DataUrl : Emoji.PreviewUrl);
              const PreviewImageClassName = Emoji.CropMode === "Square"
                ? "mx-auto h-24 w-24 rounded-xl object-cover"
                : "h-24 w-full rounded-xl object-contain";
              return (
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3" key={Emoji.Id}>
                  {PreviewSource ? (
                    <img alt="" className={PreviewImageClassName} src={PreviewSource} />
                  ) : (
                    <div className="flex h-24 w-full items-center justify-center rounded-xl border border-dashed border-slate-700 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                      {FramePreviewValue?.Error ? "Preview failed" : "Loading frame"}
                    </div>
                  )}
                  <input className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-blue-500" maxLength={32} onChange={(Event) => UpdateSelectedName(Emoji.Id, Event.target.value)} value={Emoji.Name} />
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button className={`rounded-xl border px-3 py-2 text-xs font-bold ${Emoji.OutputMode === "Animated" ? "border-blue-500 bg-blue-500/15 text-blue-100" : "border-slate-700 text-slate-300 hover:bg-slate-800"}`} onClick={() => UpdateSelectedOutputMode(Emoji.Id, "Animated")} type="button">
                      Animated GIF
                    </button>
                    <button className={`rounded-xl border px-3 py-2 text-xs font-bold ${Emoji.OutputMode === "StaticFrame" ? "border-blue-500 bg-blue-500/15 text-blue-100" : "border-slate-700 text-slate-300 hover:bg-slate-800"}`} onClick={() => UpdateSelectedOutputMode(Emoji.Id, "StaticFrame")} type="button">
                      Static frame
                    </button>
                  </div>
                  {Emoji.OutputMode === "StaticFrame" ? (
                    <label className="mt-3 block">
                      <span className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                        <span>Frame selector</span>
                        <span>{Emoji.FramePercent}%</span>
                      </span>
                      <input className="mt-2 w-full accent-blue-500" max={100} min={0} onChange={(Event) => UpdateSelectedFramePercent(Emoji.Id, Number(Event.target.value))} step={1} type="range" value={Emoji.FramePercent} />
                    </label>
                  ) : null}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button className={`rounded-xl border px-3 py-2 text-xs font-bold ${Emoji.CropMode === "Fit" ? "border-emerald-500 bg-emerald-500/15 text-emerald-100" : "border-slate-700 text-slate-300 hover:bg-slate-800"}`} onClick={() => UpdateSelectedCropMode(Emoji.Id, "Fit")} type="button">
                      Fit
                    </button>
                    <button className={`rounded-xl border px-3 py-2 text-xs font-bold ${Emoji.CropMode === "Square" ? "border-emerald-500 bg-emerald-500/15 text-emerald-100" : "border-slate-700 text-slate-300 hover:bg-slate-800"}`} onClick={() => UpdateSelectedCropMode(Emoji.Id, "Square")} type="button">
                      Square
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span>{Prepared?.SizeBytes ? `${Math.round(Prepared.SizeBytes / 1024)} KB ${Prepared.Animated === false ? "static" : "animated"}` : "Not optimized"}</span>
                    <button className="rounded-lg border border-red-500/40 px-2 py-1 font-bold text-red-200 hover:bg-red-500/10" onClick={() => RemoveSelected(Emoji.Id)} type="button">Remove</button>
                  </div>
                  {Prepared?.Error ? <p className="mt-2 text-xs font-bold text-red-300">{Prepared.Error}</p> : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {SearchOpen ? (
        <div className="fixed inset-x-0 bottom-0 top-20 z-50 flex items-start justify-center bg-black/70 p-4">
          <section className="flex max-h-full w-full max-w-7xl flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 shadow-2xl">
            <div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h4 className="text-xl font-black text-white">Search Tenor</h4>
                <button className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800" onClick={() => SetSearchOpen(false)} type="button">Close</button>
              </div>
              <p className={`mt-3 text-sm font-semibold ${AvailableAnimatedSelectionSlots <= 0 && AvailableStaticSelectionSlots <= 0 ? "text-red-300" : "text-slate-400"}`}>
                Animated {AvailableAnimatedSelectionSlots} - Static {AvailableStaticSelectionSlots} Discord emoji slot(s) available for this selection.
              </p>
              <input className="mt-4 w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-blue-500" onChange={(Event) => SetQuery(Event.target.value)} placeholder="Search GIFs..." value={Query} />
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="grid min-h-0 grid-cols-2 gap-3 overflow-y-auto p-4 sm:grid-cols-3 xl:grid-cols-4">
                {Results.map((Result) => {
                  const AlreadySelected = IsResultSelected(Result);
                  const SelectDisabled = AlreadySelected || (AvailableAnimatedSelectionSlots <= 0 && AvailableStaticSelectionSlots <= 0);
                  return (
                    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3" key={Result.Id}>
                      <img alt="" className="h-36 w-full rounded-xl object-contain" src={Result.PreviewUrl} />
                      <p className="mt-2 line-clamp-2 min-h-10 text-sm font-bold text-slate-200">{Result.Description}</p>
                      <button className="mt-3 w-full rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300" disabled={SelectDisabled} onClick={() => AddCandidate(Result)} type="button">
                        {AlreadySelected ? "Selected" : AvailableAnimatedSelectionSlots <= 0 && AvailableStaticSelectionSlots <= 0 ? "Limits reached" : "Add"}
                      </button>
                    </div>
                  );
                })}
                <div className="h-8" ref={SentinelReference} />
              </div>

              <aside className="flex min-h-0 flex-col border-t border-slate-800 bg-slate-950 p-4 lg:border-l lg:border-t-0">
                <div className="flex items-center justify-between gap-3">
                  <h5 className="text-sm font-black uppercase tracking-[0.2em] text-slate-200">Selected</h5>
                  <span className="rounded-full border border-slate-700 px-2 py-1 text-xs font-bold text-slate-400">A {SelectedAnimatedEmojiCount}/{RemainingAnimatedEmojiSlots} - S {SelectedStaticEmojiCount}/{RemainingStaticEmojiSlots}</span>
                </div>

                {SelectedEmojis.length === 0 ? (
                  <p className="mt-4 rounded-2xl border border-dashed border-slate-800 p-4 text-sm text-slate-500">No emoji selected yet.</p>
                ) : (
                  <div className="mt-4 grid max-h-72 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:max-h-none lg:grid-cols-1">
                    {SelectedEmojis.map((Emoji) => (
                      <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-3" key={Emoji.Id}>
                        <img alt="" className="h-14 w-14 shrink-0 rounded-xl object-contain" src={Emoji.PreviewUrl} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-slate-100">:{Emoji.Name}:</p>
                          <p className="truncate text-xs text-slate-500">{Emoji.Description || "Tenor emoji"}</p>
                        </div>
                        <button aria-label={`Remove ${Emoji.Name}`} className="rounded-lg border border-red-500/40 px-2 py-1 text-xs font-bold text-red-200 hover:bg-red-500/10" onClick={() => RemoveSelected(Emoji.Id)} type="button">
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </aside>
            </div>
          </section>
        </div>
      ) : null}

      {EmojiPendingDeletion ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
          <section className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-950 p-5 shadow-2xl">
            <h4 className="text-xl font-black text-white">Delete emoji?</h4>
            <p className="mt-3 text-sm font-semibold text-slate-400">
              This will permanently delete :{EmojiPendingDeletion.Name}: from this Discord server.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button className="rounded-xl border border-slate-700 px-4 py-3 text-sm font-bold text-slate-200 hover:bg-slate-800" disabled={DeletingEmojiId.length > 0} onClick={() => SetEmojiPendingDeletion(null)} type="button">
                Cancel
              </button>
              <button className="rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60" disabled={DeletingEmojiId.length > 0} onClick={() => void DeleteExistingEmoji()} type="button">
                {DeletingEmojiId.length > 0 ? "Deleting..." : "Delete emoji"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function NormalizeEmojiName(Value: string): string {
  return (Value.toLowerCase().replace(/[^a-z0-9_]/giu, "_").replace(/_+/gu, "_").replace(/^_|_$/gu, "") || "emoji").slice(0, 32);
}

function NormalizeEmojiNameInput(Value: string): string {
  return Value.toLowerCase().replace(/\s+/gu, "_").replace(/[^a-z0-9_]/giu, "_").replace(/_+/gu, "_").slice(0, 32);
}

function BuildUniqueEmojiName(Value: string, ExistingNames: string[]): string {
  const BaseName = NormalizeEmojiName(Value);
  const Existing = new Set(ExistingNames.map((Name) => Name.toLowerCase()));

  if (!Existing.has(BaseName)) {
    return BaseName;
  }

  for (let Index = 2; Index < 100; Index += 1) {
    const Candidate = `${BaseName.slice(0, 29)}_${Index}`;
    if (!Existing.has(Candidate)) {
      return Candidate;
    }
  }

  return `${BaseName.slice(0, 24)}_${Date.now().toString(36).slice(-6)}`;
}

function IsSameTenorResult(Left: TenorResult, Right: TenorResult): boolean {
  return Left.Id === Right.Id || (Left.SourceUrl.length > 0 && Left.SourceUrl === Right.SourceUrl);
}

function MergeUniqueTenorResults(ExistingResults: TenorResult[], IncomingResults: TenorResult[]): TenorResult[] {
  const Results = [...ExistingResults];

  for (const Result of IncomingResults) {
    if (!Results.some((ExistingResult) => IsSameTenorResult(ExistingResult, Result))) {
      Results.push(Result);
    }
  }

  return Results;
}

function IsAnimatedEmojiDataUrl(Value: string): boolean {
  return Value.toLowerCase().startsWith("data:image/gif;");
}

function BuildFramePreviewKey(Emoji: SelectedEmoji): string {
  return `${Emoji.SourceUrl}:${Emoji.FramePercent}:${Emoji.CropMode}`;
}

function DrawGifFrameToDataUrl(Gif: DecodedGif, FrameIndex: number, CropModeValue: CropMode): string {
  const SourceCanvas = document.createElement("canvas");
  const SourceContext = SourceCanvas.getContext("2d");
  const PatchCanvas = document.createElement("canvas");
  const PatchContext = PatchCanvas.getContext("2d");
  const OutputCanvas = document.createElement("canvas");
  const OutputContext = OutputCanvas.getContext("2d");
  const Size = 128;

  SourceCanvas.width = Gif.Width;
  SourceCanvas.height = Gif.Height;
  OutputCanvas.width = Size;
  OutputCanvas.height = Size;

  if (!SourceContext || !PatchContext || !OutputContext) {
    throw new Error("Canvas is not available.");
  }

  for (let Index = 0; Index <= FrameIndex; Index += 1) {
    DrawGifPatch(SourceContext, PatchCanvas, PatchContext, Gif.Frames[Index], Gif.Width, Gif.Height);
  }

  OutputContext.clearRect(0, 0, Size, Size);

  if (CropModeValue === "Square") {
    const SourceSize = Math.min(Gif.Width, Gif.Height);
    const SourceX = (Gif.Width - SourceSize) / 2;
    const SourceY = (Gif.Height - SourceSize) / 2;
    OutputContext.drawImage(SourceCanvas, SourceX, SourceY, SourceSize, SourceSize, 0, 0, Size, Size);
  } else {
    const Scale = Math.min(Size / Gif.Width, Size / Gif.Height);
    const Width = Gif.Width * Scale;
    const Height = Gif.Height * Scale;
    const X = (Size - Width) / 2;
    const Y = (Size - Height) / 2;
    OutputContext.drawImage(SourceCanvas, X, Y, Width, Height);
  }

  return OutputCanvas.toDataURL("image/png");
}

function DrawGifPatch(SourceContext: CanvasRenderingContext2D, PatchCanvas: HTMLCanvasElement, PatchContext: CanvasRenderingContext2D, Frame: ParsedFrame, GifWidth: number, GifHeight: number): void {
  if (Frame.disposalType === 2) {
    SourceContext.clearRect(0, 0, GifWidth, GifHeight);
  }

  PatchCanvas.width = Frame.dims.width;
  PatchCanvas.height = Frame.dims.height;
  const ImageDataValue = PatchContext.createImageData(Frame.dims.width, Frame.dims.height);
  ImageDataValue.data.set(Frame.patch);
  PatchContext.putImageData(ImageDataValue, 0, 0);
  SourceContext.drawImage(PatchCanvas, Frame.dims.left, Frame.dims.top);
}
