"use client";

import { useState as UseState } from "react";
import { CustomSelect } from "../../src/Web/Components/CustomSelect";
import { EmojiPicker } from "./EmojiPicker";
import { EmbedInputClassName, CreateClientId } from "../../src/Web/Components/PluginSettings/PluginSettingsShared";
import type { BotPreviewIdentity, DashboardPlugin } from "../../src/Web/Components/PluginInterfaceRenderer";

type RuleCondition = {
  Id: string;
  Type: string;
  ChannelId?: string;
  RoleId?: string;
  Text?: string;
  Weekdays?: number[];
  IsBot?: boolean;
};

type RuleAction = {
  Id: string;
  Type: string;
  ChannelId?: string;
  Message?: string;
  RoleId?: string;
  Emoji?: string;
};

type RuleTrigger = {
  Type: string;
  ChannelIds?: string[];
};

type AutomationRule = {
  Id: string;
  Name: string;
  Enabled: boolean;
  Trigger: RuleTrigger;
  ConditionOperator: "AND" | "OR";
  Conditions: RuleCondition[];
  Actions: RuleAction[];
};

const TRIGGER_OPTIONS = [
  { Label: "On message", Value: "OnMessage" },
  { Label: "On member join", Value: "OnMemberJoin" },
  { Label: "On member leave", Value: "OnMemberLeave" },
  { Label: "On voice state change", Value: "OnVoiceStateChange" }
];

const CONDITION_OPTIONS_BY_TRIGGER: Record<string, { Label: string; Value: string }[]> = {
  OnMessage: [
    { Label: "Channel is", Value: "ChannelIs" },
    { Label: "Channel is not", Value: "ChannelNot" },
    { Label: "Has role", Value: "RoleHas" },
    { Label: "Does not have role", Value: "RoleNot" },
    { Label: "Message contains", Value: "MessageContains" },
    { Label: "Message does not contain", Value: "MessageNotContains" },
    { Label: "User is bot", Value: "UserIsBot" },
    { Label: "User is not bot", Value: "UserIsNotBot" },
    { Label: "On weekday", Value: "OnWeekday" }
  ],
  OnMemberJoin: [
    { Label: "Has role", Value: "RoleHas" },
    { Label: "Does not have role", Value: "RoleNot" },
    { Label: "User is bot", Value: "UserIsBot" },
    { Label: "User is not bot", Value: "UserIsNotBot" },
    { Label: "On weekday", Value: "OnWeekday" }
  ],
  OnMemberLeave: [
    { Label: "Has role", Value: "RoleHas" },
    { Label: "Does not have role", Value: "RoleNot" },
    { Label: "User is bot", Value: "UserIsBot" },
    { Label: "User is not bot", Value: "UserIsNotBot" },
    { Label: "On weekday", Value: "OnWeekday" }
  ],
  OnVoiceStateChange: [
    { Label: "Channel is", Value: "ChannelIs" },
    { Label: "Channel is not", Value: "ChannelNot" },
    { Label: "Has role", Value: "RoleHas" },
    { Label: "Does not have role", Value: "RoleNot" },
    { Label: "User is bot", Value: "UserIsBot" },
    { Label: "User is not bot", Value: "UserIsNotBot" },
    { Label: "On weekday", Value: "OnWeekday" }
  ]
};

const ACTION_OPTIONS_BY_TRIGGER: Record<string, { Label: string; Value: string }[]> = {
  OnMessage: [
    { Label: "Send message to channel", Value: "SendMessage" },
    { Label: "Add role", Value: "AddRole" },
    { Label: "Remove role", Value: "RemoveRole" },
    { Label: "Delete trigger message", Value: "DeleteMessage" },
    { Label: "Add reaction", Value: "AddReaction" },
    { Label: "DM user", Value: "DmUser" }
  ],
  OnMemberJoin: [
    { Label: "Send message to channel", Value: "SendMessage" },
    { Label: "Add role", Value: "AddRole" },
    { Label: "Remove role", Value: "RemoveRole" },
    { Label: "DM user", Value: "DmUser" }
  ],
  OnMemberLeave: [
    { Label: "Send message to channel", Value: "SendMessage" },
    { Label: "DM user", Value: "DmUser" }
  ],
  OnVoiceStateChange: [
    { Label: "Send message to channel", Value: "SendMessage" },
    { Label: "Add role", Value: "AddRole" },
    { Label: "Remove role", Value: "RemoveRole" },
    { Label: "DM user", Value: "DmUser" }
  ]
};

const WEEKDAYS = [
  { Label: "Sun", Value: 0 },
  { Label: "Mon", Value: 1 },
  { Label: "Tue", Value: 2 },
  { Label: "Wed", Value: 3 },
  { Label: "Thu", Value: 4 },
  { Label: "Fri", Value: 5 },
  { Label: "Sat", Value: 6 }
];

function ParseRules(Value: unknown): AutomationRule[] {
  if (!Array.isArray(Value)) return [];
  return Value.map((Item) => {
    if (!Item || typeof Item !== "object") return null;
    const Obj = Item as Record<string, unknown>;
    return {
      Id: typeof Obj.Id === "string" ? Obj.Id : CreateClientId(),
      Name: typeof Obj.Name === "string" ? Obj.Name : "New rule",
      Enabled: Obj.Enabled !== false,
      Trigger: Obj.Trigger && typeof Obj.Trigger === "object"
        ? { Type: String((Obj.Trigger as Record<string, unknown>).Type ?? "OnMessage"), ChannelIds: [] }
        : { Type: "OnMessage", ChannelIds: [] },
      ConditionOperator: Obj.ConditionOperator === "OR" ? "OR" : "AND",
      Conditions: Array.isArray(Obj.Conditions) ? Obj.Conditions.map((C: unknown) => ParseCondition(C)).filter(Boolean) as RuleCondition[] : [],
      Actions: Array.isArray(Obj.Actions) ? Obj.Actions.map((A: unknown) => ParseAction(A)).filter(Boolean) as RuleAction[] : []
    };
  }).filter(Boolean) as AutomationRule[];
}

function ParseCondition(Value: unknown): RuleCondition | null {
  if (!Value || typeof Value !== "object") return null;
  const Obj = Value as Record<string, unknown>;
  return {
    Id: typeof Obj.Id === "string" ? Obj.Id : CreateClientId(),
    Type: String(Obj.Type ?? "ChannelIs"),
    ChannelId: typeof Obj.ChannelId === "string" ? Obj.ChannelId : "",
    RoleId: typeof Obj.RoleId === "string" ? Obj.RoleId : "",
    Text: typeof Obj.Text === "string" ? Obj.Text : "",
    Weekdays: Array.isArray(Obj.Weekdays) ? Obj.Weekdays.map(Number) : [],
    IsBot: typeof Obj.IsBot === "boolean" ? Obj.IsBot : false
  };
}

function ParseAction(Value: unknown): RuleAction | null {
  if (!Value || typeof Value !== "object") return null;
  const Obj = Value as Record<string, unknown>;
  return {
    Id: typeof Obj.Id === "string" ? Obj.Id : CreateClientId(),
    Type: String(Obj.Type ?? "SendMessage"),
    ChannelId: typeof Obj.ChannelId === "string" ? Obj.ChannelId : "",
    Message: typeof Obj.Message === "string" ? Obj.Message : "",
    RoleId: typeof Obj.RoleId === "string" ? Obj.RoleId : "",
    Emoji: typeof Obj.Emoji === "string" ? Obj.Emoji : ""
  };
}

export function AutomationEditor(Properties: {
  BotIdentity?: BotPreviewIdentity | null;
  BotId: string;
  DraftValues: Record<string, Record<string, unknown>>;
  GuildId: string;
  Plugin: DashboardPlugin;
  SetStatus: (Status: string) => void;
  UpdateDraftValue: (PluginId: string, Key: string, Value: unknown) => void;
}) {
  const PluginId = Properties.Plugin.Metadata.Id;
  const Values = Properties.DraftValues[PluginId] ?? {};
  const Rules = ParseRules(Values.Rules);
  const [ExpandedRuleId, SetExpandedRuleId] = UseState<string | null>(null);
  const [EmojiPickerOpenFor, SetEmojiPickerOpenFor] = UseState<string | null>(null);

  const ChannelOptions = Properties.Plugin.WebInterface.find(
    (F) => F.Key === "ChannelOptions"
  )?.Options ?? [];
  const RoleOptions = Properties.Plugin.WebInterface.find(
    (F) => F.Key === "RoleOptions"
  )?.Options ?? [];

  function GetValidConditionTypes(TriggerType: string): string[] {
    return (CONDITION_OPTIONS_BY_TRIGGER[TriggerType] ?? CONDITION_OPTIONS_BY_TRIGGER.OnMessage).map((O) => O.Value);
  }

  function GetValidActionTypes(TriggerType: string): string[] {
    return (ACTION_OPTIONS_BY_TRIGGER[TriggerType] ?? ACTION_OPTIONS_BY_TRIGGER.OnMessage).map((O) => O.Value);
  }

  function SanitizeConditionsForTrigger(Conditions: RuleCondition[], TriggerType: string): RuleCondition[] {
    const Valid = GetValidConditionTypes(TriggerType);
    return Conditions.filter((C) => Valid.includes(C.Type));
  }

  function SanitizeActionsForTrigger(Actions: RuleAction[], TriggerType: string): RuleAction[] {
    const Valid = GetValidActionTypes(TriggerType);
    return Actions.filter((A) => Valid.includes(A.Type));
  }

  function SetValue(Key: string, Value: unknown): void {
    Properties.UpdateDraftValue(PluginId, Key, Value);
  }

  function SetRules(NextRules: AutomationRule[]): void {
    SetValue("Rules", NextRules);
  }

  function AddRule(): void {
    const NewRule: AutomationRule = {
      Id: CreateClientId(),
      Name: "New rule",
      Enabled: true,
      Trigger: { Type: "OnMessage", ChannelIds: [] },
      ConditionOperator: "AND",
      Conditions: [],
      Actions: [{ Id: CreateClientId(), Type: "SendMessage", ChannelId: "", Message: "Hello from automation!" }]
    };
    SetRules([...Rules, NewRule]);
    SetExpandedRuleId(NewRule.Id);
    Properties.SetStatus("Rule added in draft. Use Save to persist it.");
  }

  function UpdateRule(RuleId: string, Patch: Partial<AutomationRule>): void {
    SetRules(Rules.map((R) => {
      if (R.Id !== RuleId) return R;
      const Next = { ...R, ...Patch };
      if (Patch.Trigger && Patch.Trigger.Type !== R.Trigger.Type) {
        Next.Conditions = SanitizeConditionsForTrigger(Next.Conditions, Next.Trigger.Type);
        Next.Actions = SanitizeActionsForTrigger(Next.Actions, Next.Trigger.Type);
        if (!Next.Conditions.length && GetValidConditionTypes(Next.Trigger.Type).length) {
          const FirstValid = GetValidConditionTypes(Next.Trigger.Type)[0];
          Next.Conditions = [{ Id: CreateClientId(), Type: FirstValid, ChannelId: "", RoleId: "", Text: "", Weekdays: [], IsBot: false }];
        }
        if (!Next.Actions.length) {
          Next.Actions = [{ Id: CreateClientId(), Type: "SendMessage", ChannelId: "", Message: "", RoleId: "", Emoji: "" }];
        }
      }
      return Next;
    }));
  }

  function DeleteRule(RuleId: string): void {
    SetRules(Rules.filter((R) => R.Id !== RuleId));
    if (ExpandedRuleId === RuleId) SetExpandedRuleId(null);
  }

  function AddCondition(RuleId: string): void {
    const Rule = Rules.find((R) => R.Id === RuleId);
    if (!Rule) return;
    const ValidTypes = GetValidConditionTypes(Rule.Trigger.Type);
    const DefaultType = ValidTypes[0] ?? "OnWeekday";
    UpdateRule(RuleId, {
      Conditions: [...Rule.Conditions, { Id: CreateClientId(), Type: DefaultType, ChannelId: "", RoleId: "", Text: "", Weekdays: [], IsBot: false }]
    });
  }

  function UpdateCondition(RuleId: string, ConditionId: string, Patch: Partial<RuleCondition>): void {
    const Rule = Rules.find((R) => R.Id === RuleId);
    if (!Rule) return;
    UpdateRule(RuleId, {
      Conditions: Rule.Conditions.map((C) => C.Id === ConditionId ? { ...C, ...Patch } : C)
    });
  }

  function RemoveCondition(RuleId: string, ConditionId: string): void {
    const Rule = Rules.find((R) => R.Id === RuleId);
    if (!Rule) return;
    UpdateRule(RuleId, {
      Conditions: Rule.Conditions.filter((C) => C.Id !== ConditionId)
    });
  }

  function AddAction(RuleId: string): void {
    const Rule = Rules.find((R) => R.Id === RuleId);
    if (!Rule) return;
    const ValidTypes = GetValidActionTypes(Rule.Trigger.Type);
    const DefaultType = ValidTypes[0] ?? "SendMessage";
    UpdateRule(RuleId, {
      Actions: [...Rule.Actions, { Id: CreateClientId(), Type: DefaultType, ChannelId: "", Message: "", RoleId: "", Emoji: "" }]
    });
  }

  function UpdateAction(RuleId: string, ActionId: string, Patch: Partial<RuleAction>): void {
    const Rule = Rules.find((R) => R.Id === RuleId);
    if (!Rule) return;
    UpdateRule(RuleId, {
      Actions: Rule.Actions.map((A) => A.Id === ActionId ? { ...A, ...Patch } : A)
    });
  }

  function RemoveAction(RuleId: string, ActionId: string): void {
    const Rule = Rules.find((R) => R.Id === RuleId);
    if (!Rule) return;
    UpdateRule(RuleId, {
      Actions: Rule.Actions.filter((A) => A.Id !== ActionId)
    });
  }

  function ConditionNeedsChannel(Type: string): boolean {
    return Type === "ChannelIs" || Type === "ChannelNot";
  }

  function ConditionNeedsRole(Type: string): boolean {
    return Type === "RoleHas" || Type === "RoleNot";
  }

  function ConditionNeedsText(Type: string): boolean {
    return Type === "MessageContains" || Type === "MessageNotContains";
  }

  function ConditionNeedsWeekday(Type: string): boolean {
    return Type === "OnWeekday";
  }

  function ConditionNeedsIsBot(Type: string): boolean {
    return Type === "UserIsBot" || Type === "UserIsNotBot";
  }

  function ActionNeedsChannel(Type: string): boolean {
    return Type === "SendMessage";
  }

  function ActionNeedsMessage(Type: string): boolean {
    return Type === "SendMessage" || Type === "DmUser";
  }

  function ActionNeedsRole(Type: string): boolean {
    return Type === "AddRole" || Type === "RemoveRole";
  }

  function ActionNeedsEmoji(Type: string): boolean {
    return Type === "AddReaction";
  }

  return (
    <section className="scroll-mt-28 rounded-[2rem] border border-slate-800 bg-slate-950/40 p-4 sm:p-5" id="plugin-section-automation">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-blue-300">Rule engine</p>
          <h3 className="mt-2 text-2xl font-black text-white">Automation rules</h3>
          <p className="mt-1 text-sm text-slate-500">If [trigger] {`{conditions}`} do [actions]</p>
        </div>
        <button className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-500" onClick={AddRule} type="button">
          Add rule
        </button>
      </div>

      <div className="grid gap-4">
        {Rules.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-700 p-4 text-sm text-slate-500">No automation rule configured.</p>
        ) : null}

        {Rules.map((Rule) => (
          <section className="rounded-3xl border border-slate-800 bg-slate-950 p-4" key={Rule.Id}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-1 items-center gap-3">
                <input
                  className="min-w-0 flex-1 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-bold text-white outline-none focus:border-blue-500"
                  onChange={(Event) => UpdateRule(Rule.Id, { Name: Event.target.value })}
                  placeholder="Rule name"
                  value={Rule.Name}
                />
                <button
                  className={`shrink-0 rounded-xl px-3 py-2 text-sm font-bold ${Rule.Enabled ? "bg-emerald-600 text-white hover:bg-emerald-500" : "border border-slate-700 text-slate-200 hover:bg-slate-800"}`}
                  onClick={() => UpdateRule(Rule.Id, { Enabled: !Rule.Enabled })}
                  type="button"
                >
                  {Rule.Enabled ? "Enabled" : "Disabled"}
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  className="rounded-xl border border-slate-700 px-3 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800"
                  onClick={() => SetExpandedRuleId(ExpandedRuleId === Rule.Id ? null : Rule.Id)}
                  type="button"
                >
                  {ExpandedRuleId === Rule.Id ? "Collapse" : "Edit"}
                </button>
                <button className="rounded-xl border border-red-500/40 px-3 py-2 text-sm font-bold text-red-200 hover:bg-red-500/10" onClick={() => DeleteRule(Rule.Id)} type="button">
                  Delete
                </button>
              </div>
            </div>

            {ExpandedRuleId === Rule.Id ? (
              <div className="mt-4 grid gap-4">
                <div className="grid gap-3 lg:grid-cols-[1fr_200px]">
                  <div className="relative block text-sm font-bold text-slate-200 focus-within:z-10">
                    Trigger
                    <CustomSelect
                      ClassName="mt-2"
                      OnChange={(Value) => UpdateRule(Rule.Id, { Trigger: { ...Rule.Trigger, Type: Value } })}
                      Options={TRIGGER_OPTIONS}
                      Required={true}
                      Value={Rule.Trigger.Type}
                    />
                  </div>
                  <div className="relative block text-sm font-bold text-slate-200 focus-within:z-10">
                    Condition logic
                    <CustomSelect
                      ClassName="mt-2"
                      OnChange={(Value) => UpdateRule(Rule.Id, { ConditionOperator: Value as "AND" | "OR" })}
                      Options={[
                        { Label: "AND (all must match)", Value: "AND" },
                        { Label: "OR (any must match)", Value: "OR" }
                      ]}
                      Required={true}
                      Value={Rule.ConditionOperator}
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-black text-white">
                      Conditions
                      {Rule.Conditions.length > 0 ? (
                        <span className="ml-2 text-sm font-normal text-slate-400">
                          ({Rule.ConditionOperator})
                        </span>
                      ) : null}
                    </p>
                    <button className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-500" onClick={() => AddCondition(Rule.Id)} type="button">
                      Add condition
                    </button>
                  </div>
                  <div className="mt-3 grid gap-3">
                    {Rule.Conditions.length === 0 ? (
                      <p className="text-sm text-slate-500">No conditions (rule always matches).</p>
                    ) : null}
                    {Rule.Conditions.map((Cond, Index) => (
                      <div className="rounded-2xl border border-slate-700 bg-slate-950 p-3" key={Cond.Id}>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span className="font-bold text-blue-400">IF</span>
                          {Index > 0 ? <span className="font-bold uppercase text-slate-400">{Rule.ConditionOperator}</span> : null}
                        </div>
                        <div className="mt-2 grid gap-3 lg:grid-cols-[1fr_auto]">
                          <div className="relative block text-sm font-bold text-slate-200 focus-within:z-10">
                            <CustomSelect
                              ClassName="mt-2"
                              OnChange={(Value) => UpdateCondition(Rule.Id, Cond.Id, { Type: Value, ChannelId: "", RoleId: "", Text: "", Weekdays: [], IsBot: false })}
                              Options={CONDITION_OPTIONS_BY_TRIGGER[Rule.Trigger.Type] ?? CONDITION_OPTIONS_BY_TRIGGER.OnMessage}
                              Required={true}
                              Value={Cond.Type}
                            />
                          </div>
                          <button className="rounded-xl border border-red-500/40 px-3 py-2 text-sm font-bold text-red-200 hover:bg-red-500/10" onClick={() => RemoveCondition(Rule.Id, Cond.Id)} type="button">
                            Remove
                          </button>
                        </div>
                        {ConditionNeedsChannel(Cond.Type) ? (
                          <div className="relative mt-2 block text-sm font-bold text-slate-200 focus-within:z-10">
                            <CustomSelect
                              ClassName="mt-0"
                              EmptyLabel="Select a channel"
                              OnChange={(Value) => UpdateCondition(Rule.Id, Cond.Id, { ChannelId: Value })}
                              Options={ChannelOptions}
                              Value={Cond.ChannelId ?? ""}
                            />
                          </div>
                        ) : null}
                        {ConditionNeedsRole(Cond.Type) ? (
                          <div className="relative mt-2 block text-sm font-bold text-slate-200 focus-within:z-10">
                            <CustomSelect
                              ClassName="mt-0"
                              EmptyLabel="Select a role"
                              OnChange={(Value) => UpdateCondition(Rule.Id, Cond.Id, { RoleId: Value })}
                              Options={RoleOptions}
                              Value={Cond.RoleId ?? ""}
                            />
                          </div>
                        ) : null}
                        {ConditionNeedsText(Cond.Type) ? (
                          <input className={`${EmbedInputClassName} mt-2`} onChange={(Event) => UpdateCondition(Rule.Id, Cond.Id, { Text: Event.target.value })} placeholder="Text to match" value={Cond.Text ?? ""} />
                        ) : null}
                        {ConditionNeedsWeekday(Cond.Type) ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {WEEKDAYS.map((Day) => (
                              <label
                                className={`rounded-xl px-3 py-2 text-sm font-bold cursor-pointer ${(Cond.Weekdays ?? []).includes(Day.Value) ? "bg-blue-600 text-white" : "bg-slate-900 text-slate-300"}`}
                                key={Day.Value}
                              >
                                <input
                                  className="sr-only"
                                  checked={(Cond.Weekdays ?? []).includes(Day.Value)}
                                  onChange={() => {
                                    const Current = Cond.Weekdays ?? [];
                                    const Next = Current.includes(Day.Value) ? Current.filter((V) => V !== Day.Value) : [...Current, Day.Value].sort();
                                    UpdateCondition(Rule.Id, Cond.Id, { Weekdays: Next.length ? Next : [Day.Value] });
                                  }}
                                  type="checkbox"
                                />
                                {Day.Label}
                              </label>
                            ))}
                          </div>
                        ) : null}
                        {ConditionNeedsIsBot(Cond.Type) ? (
                          <label className="mt-2 flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-100">
                            <input checked={Cond.IsBot ?? false} className="h-5 w-5 accent-blue-600" onChange={(Event) => UpdateCondition(Rule.Id, Cond.Id, { IsBot: Event.target.checked })} type="checkbox" />
                            Is bot
                          </label>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-black text-white">Actions</p>
                    <button className="rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-500" onClick={() => AddAction(Rule.Id)} type="button">
                      Add action
                    </button>
                  </div>
                  <div className="mt-3 grid gap-3">
                    {Rule.Actions.length === 0 ? (
                      <p className="text-sm text-slate-500">No action configured.</p>
                    ) : null}
                    {Rule.Actions.map((Act) => (
                      <div className="rounded-2xl border border-slate-700 bg-slate-900 p-3" key={Act.Id}>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span className="font-bold text-emerald-400">DO</span>
                        </div>
                        <div className="mt-2 grid gap-3 lg:grid-cols-[1fr_auto]">
                          <div className="relative block text-sm font-bold text-slate-200 focus-within:z-10">
                            <CustomSelect
                              ClassName="mt-2"
                              OnChange={(Value) => UpdateAction(Rule.Id, Act.Id, { Type: Value, ChannelId: "", Message: "", RoleId: "", Emoji: "" })}
                              Options={ACTION_OPTIONS_BY_TRIGGER[Rule.Trigger.Type] ?? ACTION_OPTIONS_BY_TRIGGER.OnMessage}
                              Required={true}
                              Value={Act.Type}
                            />
                          </div>
                          <button className="rounded-xl border border-red-500/40 px-3 py-2 text-sm font-bold text-red-200 hover:bg-red-500/10" onClick={() => RemoveAction(Rule.Id, Act.Id)} type="button">
                            Remove
                          </button>
                        </div>
                        {ActionNeedsChannel(Act.Type) ? (
                          <div className="relative mt-2 block text-sm font-bold text-slate-200 focus-within:z-10">
                            <CustomSelect
                              ClassName="mt-0"
                              EmptyLabel="Select a channel"
                              OnChange={(Value) => UpdateAction(Rule.Id, Act.Id, { ChannelId: Value })}
                              Options={ChannelOptions}
                              Value={Act.ChannelId ?? ""}
                            />
                          </div>
                        ) : null}
                        {ActionNeedsMessage(Act.Type) ? (
                          <textarea className={`${EmbedInputClassName} mt-2 min-h-24 resize-y`} onChange={(Event) => UpdateAction(Rule.Id, Act.Id, { Message: Event.target.value })} placeholder="Message text" value={Act.Message ?? ""} />
                        ) : null}
                        {ActionNeedsRole(Act.Type) ? (
                          <div className="relative mt-2 block text-sm font-bold text-slate-200 focus-within:z-10">
                            <CustomSelect
                              ClassName="mt-0"
                              EmptyLabel="Select a role"
                              OnChange={(Value) => UpdateAction(Rule.Id, Act.Id, { RoleId: Value })}
                              Options={RoleOptions}
                              Value={Act.RoleId ?? ""}
                            />
                          </div>
                        ) : null}
                        {ActionNeedsEmoji(Act.Type) ? (
                          <div className="relative mt-2">
                            <div className="flex gap-2">
                              <input
                                className={`${EmbedInputClassName} flex-1`}
                                onChange={(Event) => UpdateAction(Rule.Id, Act.Id, { Emoji: Event.target.value })}
                                placeholder="Emoji or ID"
                                value={Act.Emoji ?? ""}
                              />
                              <button
                                className="shrink-0 rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-xl hover:bg-slate-800"
                                onClick={() => SetEmojiPickerOpenFor(EmojiPickerOpenFor === Act.Id ? null : Act.Id)}
                                title="Pick emoji"
                                type="button"
                              >
                                {Act.Emoji && !/^\d+$/u.test(Act.Emoji) ? Act.Emoji : "😀"}
                              </button>
                            </div>
                            {EmojiPickerOpenFor === Act.Id ? (
                              <EmojiPicker
                                BotId={Properties.BotId}
                                GuildId={Properties.GuildId}
                                Value={Act.Emoji ?? ""}
                                OnChange={(Value) => UpdateAction(Rule.Id, Act.Id, { Emoji: Value })}
                                OnClose={() => SetEmojiPickerOpenFor(null)}
                              />
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        ))}
      </div>
    </section>
  );
}