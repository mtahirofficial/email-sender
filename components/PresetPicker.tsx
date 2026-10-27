"use client";

import type { AiPreset } from "@/content/ai-presets";

/** Preset buttons: picking one hands its prompt to the caller, who puts it in an editable box. */
export default function PresetPicker({ presets, value, onPick }: { presets: AiPreset[]; value: string; onPick: (prompt: string) => void }) {
  if (presets.length === 0) return null;
  return (
    <div className="mb-3">
      <p className="mb-1.5 text-xs font-medium text-ink-soft">Quick start</p>
      <div role="group" aria-label="Email presets" className="flex flex-wrap gap-2">
        {presets.map((preset) => {
          const selected = preset.prompt === value;
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onPick(preset.prompt)}
              className={`min-h-[40px] rounded-full border px-3.5 text-xs transition-colors ${
                selected ? "border-accent bg-accent-soft font-medium text-accent-deep" : "border-line bg-white text-ink-soft hover:border-accent hover:text-ink"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
