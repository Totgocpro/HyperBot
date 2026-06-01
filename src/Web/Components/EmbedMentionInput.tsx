"use client";

import { useEffect as UseEffect, useMemo as UseMemo, useRef as UseRef, useState as UseState, type ChangeEvent } from "react";

type MentionChannel = {
  Id: string;
  Name: string;
  Type: string;
};

type MentionRole = {
  Id: string;
  Name: string;
  Color: number;
};

type MentionMember = {
  Id: string;
  DisplayName: string;
  Username: string;
};

type MentionEmoji = {
  Id: string;
  Name: string;
  Animated: boolean;
};

type MentionPayload = {
  Channels: MentionChannel[];
  Emojis: MentionEmoji[];
  Members: MentionMember[];
  Roles: MentionRole[];
};

type MentionOption = {
  Description: string;
  InsertValue: string;
  Key: string;
  Label: string;
  Prefix: "@" | "#" | ":";
};

type MentionTextInputProperties = {
  BotId?: string;
  ClassName: string;
  GuildId?: string;
  MaxLength?: number;
  Multiline?: boolean;
  OnChange: (Value: string) => void;
  Placeholder?: string;
  Value: string;
};

const MentionPayloadCache = new Map<string, Promise<MentionPayload>>();
const CommonEmojiOptions: MentionOption[] = [
  ["grinning", "😀"], ["smile", "😄"], ["joy", "😂"], ["rofl", "🤣"], ["wink", "😉"], ["heart_eyes", "😍"], ["thinking", "🤔"], ["sob", "😭"],
  ["angry", "😠"], ["thumbsup", "👍"], ["thumbsdown", "👎"], ["clap", "👏"], ["pray", "🙏"], ["fire", "🔥"], ["sparkles", "✨"], ["star", "⭐"],
  ["heart", "❤️"], ["blue_heart", "💙"], ["green_heart", "💚"], ["warning", "⚠️"], ["white_check_mark", "✅"], ["x", "❌"], ["eyes", "👀"], ["party", "🥳"],
  ["100", "💯"], ["rocket", "🚀"], ["tada", "🎉"], ["wave", "👋"], ["ok_hand", "👌"], ["musical_note", "🎵"], ["notes", "🎶"], ["skull", "💀"]
].map(([Name, Emoji]) => ({
  Description: "Unicode emoji",
  InsertValue: Emoji,
  Key: `unicode:${Name}`,
  Label: `:${Name}: ${Emoji}`,
  Prefix: ":"
}));

export function MentionTextInput(Properties: MentionTextInputProperties) {
  const InputReference = UseRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [MentionPayloadValue, SetMentionPayloadValue] = UseState<MentionPayload>({ Channels: [], Emojis: [], Members: [], Roles: [] });
  const [CursorPosition, SetCursorPosition] = UseState(0);
  const [Open, SetOpen] = UseState(false);
  const ActiveToken = UseMemo(() => FindActiveToken(Properties.Value, CursorPosition), [Properties.Value, CursorPosition]);
  const Options = UseMemo(() => BuildMentionOptions(MentionPayloadValue, ActiveToken), [MentionPayloadValue, ActiveToken]);

  UseEffect(() => {
    if (!Properties.BotId || !Properties.GuildId || Properties.GuildId === "Global") {
      return;
    }

    const CacheKey = `${Properties.BotId}:${Properties.GuildId}`;
    let Request = MentionPayloadCache.get(CacheKey);

    if (!Request) {
      Request = fetch(`/api/plugins/${Properties.BotId}/${Properties.GuildId}/mentions`)
        .then(async (Response) => Response.ok ? await Response.json() as MentionPayload : { Channels: [], Emojis: [], Members: [], Roles: [] })
        .catch(() => ({ Channels: [], Emojis: [], Members: [], Roles: [] }));
      MentionPayloadCache.set(CacheKey, Request);
    }

    void Request.then(SetMentionPayloadValue);
  }, [Properties.BotId, Properties.GuildId]);

  function HandleChange(Event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    SetCursorPosition(Event.target.selectionStart ?? Event.target.value.length);
    SetOpen(true);
    Properties.OnChange(Event.target.value);
  }

  function HandleSelect(Option: MentionOption): void {
    if (!ActiveToken) {
      return;
    }

    const PrefixPadding = Option.Prefix === ":" && !Option.InsertValue.startsWith("<") ? "" : " ";
    const NextValue = `${Properties.Value.slice(0, ActiveToken.Start)}${Option.InsertValue}${PrefixPadding}${Properties.Value.slice(ActiveToken.End)}`;
    const NextCursorPosition = ActiveToken.Start + Option.InsertValue.length + PrefixPadding.length;
    Properties.OnChange(NextValue);
    SetOpen(false);
    window.requestAnimationFrame(() => {
      InputReference.current?.focus();
      InputReference.current?.setSelectionRange(NextCursorPosition, NextCursorPosition);
      SetCursorPosition(NextCursorPosition);
    });
  }

  const SharedProperties = {
    className: Properties.ClassName,
    maxLength: Properties.MaxLength,
    onBlur: () => window.setTimeout(() => SetOpen(false), 150),
    onChange: HandleChange,
    onFocus: () => SetOpen(true),
    onKeyUp: () => SetCursorPosition(InputReference.current?.selectionStart ?? Properties.Value.length),
    placeholder: Properties.Placeholder,
    value: Properties.Value
  };

  return (
    <span className="relative block">
      {Properties.Multiline ? (
        <textarea {...SharedProperties} ref={(Element) => { InputReference.current = Element; }} />
      ) : (
        <input {...SharedProperties} ref={(Element) => { InputReference.current = Element; }} />
      )}
      {Open && ActiveToken && Options.length > 0 ? (
        <span className="absolute left-0 right-0 top-full z-50 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-2 shadow-2xl shadow-black/40">
          {Options.map((Option) => (
            <button className="grid w-full gap-0.5 rounded-xl px-3 py-2 text-left hover:bg-slate-800" key={Option.Key} onMouseDown={(Event) => Event.preventDefault()} onClick={() => HandleSelect(Option)} type="button">
              <span className="truncate text-sm font-bold text-slate-100">{Option.Label}</span>
              <span className="truncate text-xs text-slate-500">{Option.Description}</span>
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
}

function FindActiveToken(Value: string, CursorPosition: number): { Prefix: "@" | "#" | ":"; Query: string; Start: number; End: number } | null {
  const BeforeCursor = Value.slice(0, CursorPosition);
  const Match = /(^|\s)([@#:])([^\s@#:<>]{0,40})$/u.exec(BeforeCursor);

  if (!Match) {
    return null;
  }

  return {
    Prefix: Match[2] as "@" | "#" | ":",
    Query: Match[3].toLowerCase(),
    Start: CursorPosition - Match[2].length - Match[3].length,
    End: CursorPosition
  };
}

function BuildMentionOptions(Payload: MentionPayload, Token: ReturnType<typeof FindActiveToken>): MentionOption[] {
  if (!Token) {
    return [];
  }

  if (Token.Prefix === "@") {
    return [
      ...Payload.Members.map((Member) => ({
        Description: `@${Member.Username}`,
        InsertValue: `<@${Member.Id}>`,
        Key: `member:${Member.Id}`,
        Label: Member.DisplayName,
        Prefix: "@" as const
      })),
      ...Payload.Roles.map((Role) => ({
        Description: "Role",
        InsertValue: `<@&${Role.Id}>`,
        Key: `role:${Role.Id}`,
        Label: `@${Role.Name}`,
        Prefix: "@" as const
      }))
    ].filter((Option) => MatchesQuery(Option.Label, Token.Query) || MatchesQuery(Option.Description, Token.Query)).slice(0, 12);
  }

  if (Token.Prefix === "#") {
    return Payload.Channels.map((Channel) => ({
      Description: Channel.Type,
      InsertValue: `<#${Channel.Id}>`,
      Key: `channel:${Channel.Id}`,
      Label: `#${Channel.Name}`,
      Prefix: "#" as const
    })).filter((Option) => MatchesQuery(Option.Label, Token.Query)).slice(0, 12);
  }

  return [
    ...Payload.Emojis.map((Emoji) => ({
      Description: Emoji.Animated ? "Animated server emoji" : "Server emoji",
      InsertValue: `<${Emoji.Animated ? "a" : ""}:${Emoji.Name}:${Emoji.Id}>`,
      Key: `emoji:${Emoji.Id}`,
      Label: `:${Emoji.Name}:`,
      Prefix: ":" as const
    })),
    ...CommonEmojiOptions
  ].filter((Option) => MatchesQuery(Option.Label, Token.Query)).slice(0, 12);
}

function MatchesQuery(Value: string, Query: string): boolean {
  return Value.toLowerCase().includes(Query);
}
