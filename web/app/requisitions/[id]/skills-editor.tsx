"use client";

import { GripVertical, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveSkillsAction } from "./actions";
import type { SkillInput } from "./types";

// Real reorder (HTML5 drag), reweight (0–100), and CORE/nice toggle. On save, persists the
// confirmed rubric via saveSkillsAction (PUT /api/v1/requisitions/{id}/skills) and refreshes
// so Top matches re-rank against the new weights/order.
export function SkillsEditor({ reqId, initial }: { reqId: string; initial: SkillInput[] }) {
  const [skills, setSkills] = useState<SkillInput[]>(initial);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const update = (next: SkillInput[]) => {
    setSkills(next);
    setDirty(true);
  };
  const reorder = (from: number, to: number) => {
    if (from === to) return;
    const copy = [...skills];
    const [moved] = copy.splice(from, 1);
    copy.splice(to, 0, moved!);
    update(copy);
  };
  const setWeight = (i: number, pct: number) =>
    update(skills.map((s, idx) => (idx === i ? { ...s, weight: Math.max(0, Math.min(100, pct)) / 100 } : s)));
  const toggleTier = (i: number) =>
    update(skills.map((s, idx) => (idx === i ? { ...s, tier: s.tier === "core" ? "nice" : "core" } : s)));

  const save = () =>
    startTransition(async () => {
      await saveSkillsAction(reqId, skills);
      setDirty(false);
      router.refresh();
    });

  if (skills.length === 0) {
    return <p className="text-sm text-muted-foreground">No skills yet — paste a JD on intake to extract them.</p>;
  }

  return (
    <div className="space-y-3">
      {skills.map((s, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: order is the identity here
          key={`${s.name}-${i}`}
          draggable
          onDragStart={() => setDragIdx(i)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (dragIdx !== null) reorder(dragIdx, i);
            setDragIdx(null);
          }}
          className="flex items-center gap-3 rounded-md border border-border bg-card p-2"
        >
          <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground/50" />
          <span className="w-36 shrink-0 truncate text-sm font-medium">{s.name}</span>
          <button
            type="button"
            onClick={() => toggleTier(i)}
            className={`shrink-0 rounded border px-2 py-0.5 text-xs font-medium transition-colors hover:bg-accent ${
              s.tier === "core" ? "border-primary text-primary" : "border-border text-muted-foreground"
            }`}
          >
            {s.tier === "core" ? "CORE" : "nice"}
          </button>
          <Input
            type="number"
            min={0}
            max={100}
            value={Math.round(s.weight * 100)}
            onChange={(e) => setWeight(i, Number(e.target.value))}
            className="h-8 w-20"
            aria-label={`${s.name} weight percent`}
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
      ))}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Drag to reorder · edit weight · click the tier to toggle CORE / nice.
        </p>
        <Button size="sm" onClick={save} disabled={pending || !dirty}>
          <Save className="size-4" />
          {pending ? "Saving…" : dirty ? "Save rubric" : "Saved"}
        </Button>
      </div>
    </div>
  );
}
