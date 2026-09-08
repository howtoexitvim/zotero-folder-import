import type { ConflictAction, PlannedFile } from "./planner";
import { normalizeName } from "./planner";

type ResolvedAction = Exclude<ConflictAction, "unresolved">;

export function applyConflictChoice(
  files: PlannedFile[],
  selectedIndex: number,
  action: ResolvedAction,
  applyAll: boolean,
): PlannedFile[] {
  return files.map((file, index) => {
    if (file.classification !== "conflict") return file;
    const selected = index === selectedIndex;
    const remaining = applyAll && file.conflictAction === "unresolved";
    if (!selected && !remaining) return file;
    if (action === "replace" && !file.replaceAllowed) return file;
    return { ...file, conflictAction: action };
  });
}

export function allConflictsResolved(files: PlannedFile[]): boolean {
  return files.every(
    (file) => file.classification !== "conflict" || file.conflictAction !== "unresolved",
  );
}

export function makeUniqueName(sourceName: string, occupiedNames: string[]): string {
  const dot = sourceName.lastIndexOf(".");
  const stem = dot > 0 ? sourceName.slice(0, dot) : sourceName;
  const extension = dot > 0 ? sourceName.slice(dot) : "";
  const occupied = new Set(occupiedNames.map(normalizeName));

  if (!occupied.has(normalizeName(sourceName))) return sourceName;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${stem} (${suffix})${extension}`;
    if (!occupied.has(normalizeName(candidate))) return candidate;
  }
}
