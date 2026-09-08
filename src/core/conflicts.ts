/**
 * Pure helpers for the conflict step of the preview dialog: recording the
 * user's choices and naming a file when both copies are kept.
 */
import type { ConflictAction, PlannedFile } from "./planner";
import { normalizeName } from "./planner";

/** A choice the user has actually made, as opposed to the pending state. */
type ResolvedAction = Exclude<ConflictAction, "unresolved">;

/**
 * Records the choice for one conflicting file.
 */
export function applyConflictChoice(
  files: PlannedFile[],
  selectedIndex: number,
  action: ResolvedAction,
): PlannedFile[] {
  return files.map((file, index) => {
    if (file.classification !== "conflict" || index !== selectedIndex) return file;
    if (action === "replace" && !file.replaceAllowed) return file;
    return { ...file, conflictAction: action };
  });
}

/**
 * Sets every conflict to one action, including ones already decided.
 *
 * This replaces an earlier "apply my next choice to the remaining conflicts"
 * checkbox, which only ever affected files still marked unresolved: using it a
 * second time silently did nothing, and changing your mind was impossible.
 * Applying to all conflicts unconditionally is idempotent and repeatable.
 *
 * Replace is still refused where it is not allowed (the existing attachment
 * carries annotations, or several share the filename), so a bulk action can
 * never destroy annotated files; those rows keep whatever they had.
 */
export function setAllConflicts(
  files: PlannedFile[],
  action: ResolvedAction,
): PlannedFile[] {
  return files.map((file) => {
    if (file.classification !== "conflict") return file;
    if (action === "replace" && !file.replaceAllowed) return file;
    return { ...file, conflictAction: action };
  });
}

/** True once every conflict has a choice, which gates the Import button. */
export function allConflictsResolved(files: PlannedFile[]): boolean {
  return files.every(
    (file) => file.classification !== "conflict" || file.conflictAction !== "unresolved",
  );
}

/**
 * Picks the first free "name (n).ext" for a Keep Both import. Comparison is
 * case- and Unicode-normalized, matching how the rest of the planner compares
 * filenames.
 */
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
