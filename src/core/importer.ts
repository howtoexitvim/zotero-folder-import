/**
 * Executes a confirmed import plan against the library. All Zotero access goes
 * through ImportPort so the sequencing can be tested with a fake.
 */
import { allConflictsResolved, makeUniqueName } from "./conflicts";
import type { ImportPlan, PlannedFile } from "./planner";
import type { FileStat } from "./scanner";

/** State of an existing attachment, re-checked before a destructive Replace. */
export interface AttachmentContext {
  id: number;
  parentID?: number | false;
  hasAnnotations: boolean;
}

/** One file to copy into Zotero storage. */
export interface ImportStoredRequest {
  path: string;
  name: string;
  collectionID?: number;
  parentItemID?: number;
}

/** Library operations the importer needs; backed by Zotero at runtime. */
export interface ImportPort {
  stat(path: string): Promise<FileStat>;
  ensureCollection(baseCollectionID: number | undefined, segments: string[]): Promise<number>;
  getAttachmentContext(id: number): Promise<AttachmentContext>;
  importStored(request: ImportStoredRequest): Promise<number>;
  trashAttachments(ids: number[]): Promise<void>;
  occupiedNames(collectionID: number): Promise<string[]>;
  indexAttachments(ids: number[]): Promise<void>;
}

/** One file that could not be imported. */
export interface ImportFailure {
  path: string;
  message: string;
}

/** Tally of what happened, shown when the import finishes. */
export interface ImportResult {
  /** True when the user stopped the run before every file was processed. */
  cancelled?: boolean;
  imported: number;
  ignored: number;
  replaced: number;
  keptBoth: number;
  failed: number;
  importedAttachmentIDs: number[];
  errors: ImportFailure[];
}

/** Per-file progress pushed to the dialog. */
export interface ImportProgress {
  completed: number;
  total: number;
  path: string;
  result: ImportResult;
}

/** Zeroed tally to accumulate into. */
function emptyResult(): ImportResult {
  return {
    imported: 0,
    ignored: 0,
    replaced: 0,
    keptBoth: 0,
    failed: 0,
    importedAttachmentIDs: [],
    errors: [],
  };
}

/** Refuses to start while any conflict is still undecided. */
function assertResolved(plan: ImportPlan): void {
  if (!allConflictsResolved(plan.files)) {
    throw new Error("Import plan contains an unresolved conflict");
  }
}

/**
 * Re-stats a file before importing it. The preview may be minutes old, and
 * importing a file that changed since then would store something the user never
 * reviewed.
 */
async function ensureUnchanged(file: PlannedFile, port: ImportPort): Promise<void> {
  const current = await port.stat(file.absolutePath);
  if (current.size !== file.size || current.mtime !== file.mtime) {
    throw new Error("File changed after preview; rescan before importing");
  }
}

/**
 * Imports every file in the plan, continuing past individual failures so one
 * bad file cannot abort the run; failures are collected into the result.
 *
 * Replace is deliberately ordered import-then-trash: the new attachment must
 * exist before the old one is moved to the trash, so a failure never leaves the
 * user with neither copy.
 */
export async function executeImport(
  plan: ImportPlan,
  port: ImportPort,
  onProgress?: (progress: ImportProgress) => void,
  shouldCancel?: () => boolean,
): Promise<ImportResult> {
  assertResolved(plan);
  const result = emptyResult();

  for (let index = 0; index < plan.files.length; index += 1) {
    // Checked between files rather than mid-file, so a cancel never leaves an
    // attachment half-imported: whatever finished is kept, the rest is skipped.
    if (shouldCancel?.()) {
      result.cancelled = true;
      break;
    }
    const file = plan.files[index];
    try {
      if (file.classification === "conflict" && file.conflictAction === "ignore") {
        result.ignored += 1;
        continue;
      }

      await ensureUnchanged(file, port);
      const collectionID = await port.ensureCollection(plan.baseCollectionID, file.target.segments);

      if (file.classification === "new") {
        const attachmentID = await port.importStored({
          path: file.absolutePath,
          name: file.name,
          collectionID,
        });
        result.importedAttachmentIDs.push(attachmentID);
        result.imported += 1;
        continue;
      }

      if (file.conflictAction === "keep-both") {
        const occupied = await port.occupiedNames(collectionID);
        const name = makeUniqueName(file.name, occupied);
        const attachmentID = await port.importStored({
          path: file.absolutePath,
          name,
          collectionID,
        });
        result.importedAttachmentIDs.push(attachmentID);
        result.keptBoth += 1;
        continue;
      }

      if (file.conflictAction === "replace") {
        const contexts = await Promise.all(
          file.existingAttachmentIDs.map((id) => port.getAttachmentContext(id)),
        );
        if (contexts.length !== 1) {
          throw new Error("Replace is disabled when multiple existing attachments share the filename");
        }
        if (!file.replaceAllowed || contexts.some((context) => context.hasAnnotations)) {
          throw new Error("Replace is disabled because the existing attachment has annotations");
        }

        const parentID = contexts.find((context) => context.parentID)?.parentID || undefined;
        const attachmentID = await port.importStored({
          path: file.absolutePath,
          name: file.name,
          collectionID: parentID ? undefined : collectionID,
          parentItemID: parentID || undefined,
        });
        await port.trashAttachments(file.existingAttachmentIDs);
        result.importedAttachmentIDs.push(attachmentID);
        result.replaced += 1;
      }
    } catch (error) {
      result.failed += 1;
      result.errors.push({
        path: file.absolutePath,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      try {
        onProgress?.({ completed: index + 1, total: plan.files.length, path: file.relativePath, result });
      } catch {
        // Progress UI is advisory. Closing or tearing down the dialog must not stop imports.
      }
      // The loop awaits only file I/O, which never returns to the event loop
      // long enough for the dialog to repaint, so the progress bar would sit
      // frozen until the whole import finished. Yield so the UI can paint.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  if (result.importedAttachmentIDs.length) {
    try {
      await port.indexAttachments(result.importedAttachmentIDs);
    } catch (error) {
      result.failed += 1;
      result.errors.push({
        path: "[full-text-index]",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return result;
}
