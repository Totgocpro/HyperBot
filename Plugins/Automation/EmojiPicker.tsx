"use client";

import { useEffect as UseEffect, useRef as UseRef, useState as UseState } from "react";

const EMOJI_CATEGORIES: { Label: string; Emojis: string[] }[] = [
  {
    Label: "Smileys",
    Emojis: ["😀","😃","😄","😁","😅","😂","🤣","😊","😇","🙂","😉","😌","😍","🥰","😘","😗","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🫣","🤫","🤔","😐","😑","😶","😏","😒","🙄","😬","😮","😯","😲","😳","🥺","😢","😭","😤","😠","😡","🤬","😈","👿","💀","☠️","💩","🤡","👹","👺","👻","👽","🤖"]
  },
  {
    Label: "Gestures",
    Emojis: ["👍","👎","👊","✊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","✌️","🤞","🫰","🤟","🤘","🤙","💪","🦵","🦶","👀","👁️","👅","👄","💋","❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝"]
  },
  {
    Label: "Nature",
    Emojis: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🐔","🐧","🐦","🐤","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🐛","🦋","🐌","🐞","🐜","🦟","🦗","🕷️","🦂","🐢","🐍","🦎","🦖","🦕","🐙","🦑","🦐","🦞","🦀","🐡","🐠","🐟","🐬","🐳","🐋","🦈","🌲","🌳","🌴","🌵","🌾","🌿","☘️","🍀","🍁","🍂","🍃"]
  },
  {
    Label: "Symbols",
    Emojis: ["✅","❌","❓","❗","‼️","⁉️","➕","➖","➗","✖️","💲","💱","©️","®️","™️","♻️","✅","❎","🛑","⛔","🚫","📛","🚸","☢️","☣️","⚠️","🚸","🔞","💯","🔅","🔆","🔴","🟠","🟡","🟢","🔵","🟣","🟤","⚫","⚪","🟥","🟧","🟨","🟩","🟦","🟪","🟫","⬛","⬜","🔶","🔷","🔸","🔹","🔺","🔻","💠","🔘","🔳","🔲"]
  },
  {
    Label: "Objects",
    Emojis: ["🎉","🎊","🎈","🎁","🎀","🪄","🪅","🎭","🎨","🎬","🎤","🎧","🎼","🎹","🥁","🎷","🎺","🎸","🪇","🪈","🎻","🎲","♟️","🎯","🎳","🎮","🕹️","🎰","🚀","🛸","🚁","✈️","🚂","🚗","🚕","🚙","🚌","🚎","🏎️","🚑","🚒","🚓","🏍️","🛵","🚲","🛴","🛹","🛼","🚏","⛽","🅿️","🏁","🚦","🚥"]
  }
];

const COMMON_EMOJIS = EMOJI_CATEGORIES.flatMap((C) => C.Emojis);

type ServerEmoji = {
  Id: string;
  Name: string;
  Animated: boolean;
};

export function EmojiPicker(Properties: {
  BotId: string;
  GuildId: string;
  Value: string;
  OnChange: (Value: string) => void;
  OnClose: () => void;
}) {
  const [ServerEmojis, SetServerEmojis] = UseState<ServerEmoji[]>([]);
  const [ActiveCategory, SetActiveCategory] = UseState(EMOJI_CATEGORIES[0]?.Label ?? "");
  const [Search, SetSearch] = UseState("");
  const ContainerRef = UseRef<HTMLDivElement>(null);

  UseEffect(() => {
    async function LoadServerEmojis() {
      try {
        const Response = await fetch(`/api/plugins/${Properties.BotId}/${Properties.GuildId}/mentions`);
        if (Response.ok) {
          const Data = await Response.json() as { Emojis?: ServerEmoji[] };
          SetServerEmojis(Data.Emojis ?? []);
        }
      } catch {
        // ignore
      }
    }
    void LoadServerEmojis();
  }, [Properties.BotId, Properties.GuildId]);

  UseEffect(() => {
    function HandleClickOutside(Event: MouseEvent) {
      if (ContainerRef.current && !ContainerRef.current.contains(Event.target as Node)) {
        Properties.OnClose();
      }
    }
    document.addEventListener("mousedown", HandleClickOutside);
    return () => document.removeEventListener("mousedown", HandleClickOutside);
  }, [Properties]);

  function SelectEmoji(Emoji: string): void {
    Properties.OnChange(Emoji);
    Properties.OnClose();
  }

  function SelectCustomEmoji(Emoji: ServerEmoji): void {
    Properties.OnChange(Emoji.Id);
    Properties.OnClose();
  }

  const SearchLower = Search.toLowerCase();
  const FilteredStandard = Search
    ? COMMON_EMOJIS.filter((E) => E.includes(SearchLower))
    : [];
  const FilteredCustom = Search
    ? ServerEmojis.filter((E) => E.Name.toLowerCase().includes(SearchLower))
    : ServerEmojis;

  return (
    <div className="absolute z-50 mt-1 rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl shadow-black/50" ref={ContainerRef} style={{ width: "340px", maxHeight: "400px" }}>
      <div className="border-b border-slate-700 p-2">
        <input
          className="w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
          onChange={(Event) => SetSearch(Event.target.value)}
          placeholder="Search emoji..."
          value={Search}
        />
      </div>

      {!Search ? (
        <div className="flex gap-1 overflow-x-auto border-b border-slate-700 px-2 py-2">
          {EMOJI_CATEGORIES.map((Cat) => (
            <button
              className={`shrink-0 rounded-lg px-2 py-1 text-sm ${ActiveCategory === Cat.Label ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800"}`}
              key={Cat.Label}
              onClick={() => SetActiveCategory(Cat.Label)}
              type="button"
            >
              {Cat.Label}
            </button>
          ))}
          {ServerEmojis.length > 0 ? (
            <button
              className={`shrink-0 rounded-lg px-2 py-1 text-sm ${ActiveCategory === "Server" ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800"}`}
              onClick={() => SetActiveCategory("Server")}
              type="button"
            >
              Server
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="grid max-h-60 gap-1 overflow-y-auto p-2" style={{ gridTemplateColumns: "repeat(8, 1fr)" }}>
        {Search ? (
          <>
            {FilteredStandard.map((Emoji) => (
              <button
                className={`flex items-center justify-center rounded-lg p-1.5 text-xl hover:bg-slate-800 ${Properties.Value === Emoji ? "bg-blue-600/20 ring-1 ring-blue-500" : ""}`}
                key={Emoji}
                onClick={() => SelectEmoji(Emoji)}
                title={Emoji}
                type="button"
              >
                {Emoji}
              </button>
            ))}
            {FilteredCustom.map((Emoji) => (
              <button
                className={`flex items-center justify-center rounded-lg p-1.5 hover:bg-slate-800 ${Properties.Value === Emoji.Id ? "bg-blue-600/20 ring-1 ring-blue-500" : ""}`}
                key={Emoji.Id}
                onClick={() => SelectCustomEmoji(Emoji)}
                title={`:${Emoji.Name}:`}
                type="button"
              >
                <img
                  alt={`:${Emoji.Name}:`}
                  className="h-7 w-7 object-contain"
                  src={`https://cdn.discordapp.com/emojis/${Emoji.Id}.${Emoji.Animated ? "gif" : "png"}`}
                />
              </button>
            ))}
            {!FilteredStandard.length && !FilteredCustom.length ? (
              <p className="col-span-full py-4 text-center text-sm text-slate-500">No emoji found.</p>
            ) : null}
          </>
        ) : ActiveCategory === "Server" ? (
          <>
            {FilteredCustom.map((Emoji) => (
              <button
                className={`flex items-center justify-center rounded-lg p-1.5 hover:bg-slate-800 ${Properties.Value === Emoji.Id ? "bg-blue-600/20 ring-1 ring-blue-500" : ""}`}
                key={Emoji.Id}
                onClick={() => SelectCustomEmoji(Emoji)}
                title={`:${Emoji.Name}:`}
                type="button"
              >
                <img
                  alt={`:${Emoji.Name}:`}
                  className="h-7 w-7 object-contain"
                  src={`https://cdn.discordapp.com/emojis/${Emoji.Id}.${Emoji.Animated ? "gif" : "png"}`}
                />
              </button>
            ))}
            {!FilteredCustom.length ? (
              <p className="col-span-full py-4 text-center text-sm text-slate-500">No server emoji.</p>
            ) : null}
          </>
        ) : (
          <>
            {EMOJI_CATEGORIES.find((C) => C.Label === ActiveCategory)?.Emojis.map((Emoji) => (
              <button
                className={`flex items-center justify-center rounded-lg p-1.5 text-xl hover:bg-slate-800 ${Properties.Value === Emoji ? "bg-blue-600/20 ring-1 ring-blue-500" : ""}`}
                key={Emoji}
                onClick={() => SelectEmoji(Emoji)}
                title={Emoji}
                type="button"
              >
                {Emoji}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}