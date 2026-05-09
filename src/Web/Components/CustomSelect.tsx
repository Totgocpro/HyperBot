"use client";

import { useEffect as UseEffect, useRef as UseRef, useState as UseState } from "react";

export type CustomSelectOption = {
  Label: string;
  Value: string | number | boolean;
  Disabled?: boolean;
  Description?: string;
  Color?: number;
};

type CustomSelectProperties = {
  ClassName?: string;
  CreateButtonLabel?: string;
  CreateColorEnabled?: boolean;
  CreateErrorMessage?: string;
  CreateInputPlaceholder?: string;
  CreateLabel?: string;
  Disabled?: boolean;
  EmptyLabel?: string;
  EmptyCreateError?: string;
  OnChange: (Value: string) => void;
  OnCreate?: (Name: string, Color: string) => Promise<string | null>;
  Options: CustomSelectOption[];
  Required?: boolean;
  Value: string;
};

export function CustomSelect(Properties: CustomSelectProperties) {
  const [IsOpen, SetIsOpen] = UseState(false);
  const [IsCreating, SetIsCreating] = UseState(false);
  const [NewName, SetNewName] = UseState("");
  const [NewColor, SetNewColor] = UseState("#5865f2");
  const [CreateError, SetCreateError] = UseState("");
  const RootRef = UseRef<HTMLDivElement | null>(null);
  const SelectedOption = Properties.Options.find((Option) => String(Option.Value) === Properties.Value);
  const CanCreate = Boolean(Properties.OnCreate);

  UseEffect(() => {
    function CloseOnOutsideClick(Event: MouseEvent): void {
      if (!RootRef.current?.contains(Event.target as Node)) {
        SetIsOpen(false);
        SetIsCreating(false);
      }
    }

    document.addEventListener("mousedown", CloseOnOutsideClick);
    return () => document.removeEventListener("mousedown", CloseOnOutsideClick);
  }, []);

  function SelectValue(Value: string): void {
    Properties.OnChange(Value);
    SetIsOpen(false);
    SetIsCreating(false);
  }

  async function CreateOption(): Promise<void> {
    if (!Properties.OnCreate || IsCreating) {
      return;
    }

    const TrimmedName = NewName.trim();

    if (!TrimmedName) {
      SetCreateError(Properties.EmptyCreateError ?? "Name is required.");
      return;
    }

    SetIsCreating(true);
    SetCreateError("");

    try {
      const CreatedValue = await Properties.OnCreate(TrimmedName, NewColor);

      if (CreatedValue) {
        SelectValue(CreatedValue);
        SetNewName("");
        SetNewColor("#5865f2");
      }
    } catch (ErrorValue) {
      SetCreateError(ErrorValue instanceof Error ? ErrorValue.message : Properties.CreateErrorMessage ?? "Creation failed.");
    } finally {
      SetIsCreating(false);
    }
  }

  return (
    <div className={`relative w-full ${IsOpen ? "z-40" : "z-0"} ${Properties.ClassName ?? ""}`} ref={RootRef}>
      <button
        aria-expanded={IsOpen}
        className="flex min-h-12 min-w-48 w-full items-center justify-between gap-3 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-left text-sm text-white outline-none transition hover:border-slate-500 focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={Properties.Disabled}
        onClick={() => SetIsOpen(!IsOpen)}
        type="button"
      >
        <span className="flex min-w-0 items-center gap-2">
          {SelectedOption ? <OptionColor Option={SelectedOption} /> : null}
          <span className={SelectedOption ? "truncate" : "truncate text-slate-500"}>{SelectedOption?.Label ?? Properties.EmptyLabel ?? "Select"}</span>
        </span>
        <span aria-hidden="true" className={`shrink-0 text-slate-400 transition ${IsOpen ? "rotate-180" : ""}`}>⌄</span>
      </button>

      {IsOpen ? (
        <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl shadow-black/50" tabIndex={-1}>
          <div className="max-h-64 overflow-y-auto p-1" tabIndex={-1}>
            {!Properties.Required ? (
              <button className="flex w-full items-center rounded-xl px-3 py-2 text-left text-sm text-slate-400 hover:bg-slate-800" onClick={() => SelectValue("")} type="button">
                {Properties.EmptyLabel ?? "Select"}
              </button>
            ) : null}
            {Properties.Options.length === 0 ? <p className="px-3 py-2 text-sm text-slate-500">No option available.</p> : null}
            {Properties.Options.map((Option) => {
              const OptionValue = String(Option.Value);
              const IsSelected = OptionValue === Properties.Value;

              return (
                <button
                  className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition ${
                    Option.Disabled ? "cursor-not-allowed text-slate-600" : IsSelected ? "bg-blue-600 text-white" : "text-slate-200 hover:bg-slate-800"
                  }`}
                  disabled={Option.Disabled}
                  key={OptionValue}
                  onClick={() => SelectValue(OptionValue)}
                  type="button"
                >
                  <OptionColor Option={Option} />
                  <span className="min-w-0">
                    <span className="block truncate">{Option.Label}</span>
                    {Option.Description ? <span className={IsSelected ? "block truncate text-xs text-blue-100" : "block truncate text-xs text-slate-500"}>{Option.Description}</span> : null}
                  </span>
                </button>
              );
            })}
          </div>

          {CanCreate ? (
            <div className="border-t border-slate-800 p-3" tabIndex={-1}>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">{Properties.CreateLabel ?? "Create option"}</p>
              <div className={`mt-2 grid gap-2 ${Properties.CreateColorEnabled === false ? "" : "sm:grid-cols-[1fr_auto]"}`}>
                <input
                  className="min-w-0 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                  maxLength={100}
                  onChange={(Event) => SetNewName(Event.target.value)}
                  placeholder={Properties.CreateInputPlaceholder ?? "Name"}
                  value={NewName}
                />
                {Properties.CreateColorEnabled === false ? null : (
                  <input
                    aria-label="Role color"
                    className="h-10 w-full rounded-xl border border-slate-700 bg-slate-900 p-1 sm:w-14"
                    onChange={(Event) => SetNewColor(Event.target.value)}
                    type="color"
                    value={NewColor}
                  />
                )}
              </div>
              {CreateError ? <p className="mt-2 text-xs font-semibold text-red-300">{CreateError}</p> : null}
              <button
                className={`mt-2 w-full rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white transition ${IsCreating ? "cursor-not-allowed opacity-60" : "hover:bg-blue-500"}`}
                onClick={() => !IsCreating && void CreateOption()}
                type="button"
              >
                {IsCreating ? "Creating..." : Properties.CreateButtonLabel ?? "Create"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function OptionColor(Properties: { Option: CustomSelectOption }) {
  if (typeof Properties.Option.Color !== "number") {
    return null;
  }

  return <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full border border-white/20" style={{ backgroundColor: `#${Properties.Option.Color.toString(16).padStart(6, "0")}` }} />;
}
