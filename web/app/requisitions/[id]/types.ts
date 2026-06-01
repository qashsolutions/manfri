// Shared types for the requisition-detail skills editor. Kept in a plain module (not the
// "use server" actions file, which may only export async functions).

export interface SkillInput {
  name: string;
  tier: "core" | "nice";
  weight: number;
  sort_order: number;
}
