"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { AVATARS, supabase } from "@/lib/supabase";

// The character is saved to the profile, so the drill, the room and the dashboard all show the same one.
// The choice shows at once and rolls back if the save fails.
export default function CharacterPicker({
  profileId,
  value,
  onChange,
  cols = "grid-cols-4 sm:grid-cols-7",
}: {
  profileId: string;
  value: number;
  onChange: (i: number) => void;
  cols?: string;
}) {
  const [error, setError] = useState(false);
  const pick = (i: number) => {
    const before = value;
    onChange(i);
    setError(false);
    supabase()
      .from("profiles")
      .update({ avatar: i })
      .eq("id", profileId)
      .then(({ error }) => {
        if (!error) return;
        onChange(before);
        setError(true);
      });
  };
  return (
    <fieldset>
      <legend className="sr-only">Karakter</legend>
      <div className={`grid gap-2 ${cols}`}>
        {AVATARS.map((look, i) => (
          <label key={look} className="relative">
            <input type="radio" name="karakter" checked={value === i} onChange={() => pick(i)} className="peer sr-only" />
            {/* eslint-disable-next-line @next/next/no-img-element -- 128px sprites, nothing to optimise */}
            <img
              src={`/characters/previews/${look}.png`}
              alt={`Karakter ${i + 1}`}
              width={128}
              height={128}
              className="aspect-square w-full rounded-lg border-2 border-malam-3 bg-malam-2 transition-colors hover:border-redup peer-checked:border-laut peer-checked:bg-malam-3 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-langit"
            />
            <Check
              aria-hidden="true"
              strokeWidth={3}
              className="pointer-events-none absolute top-1 right-1 size-5 rounded-full bg-laut p-0.5 text-white opacity-0 peer-checked:opacity-100"
            />
          </label>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-bahaya">
          Karakter belum tersimpan. Coba lagi.
        </p>
      )}
    </fieldset>
  );
}
