import { allConflictsResolved, makeUniqueName } from "./conflicts";
import { normalizeName, type ImportPlan, type PlannedFile } from "./planner";
import type { FileStat } from "./scanner";

export interface AttachmentContext {
  id: number;
  parentID?: number | false;
  hasAnnotations: boolean;
}

export interface ImportStoredRequest {
  path: string;
  name: string;
  collectionID?: number;
  parentItemID?: number;
}

export interface ImportPort {
  stat(path: string): Promise<FileStat>;
  ensureCollection(baseCollectionID: number | undefined, segments: string[]): Promise<number>;
  getAttachmentContext(id: number): Promise<AttachmentContext>;
  importStored(request: ImportStoredRequest): Promise<number>;
  linkExisting(
    attachmentID: number,
    collectionID: number,
    sourceName: string,
  ): Promise<void>;
  trashAttachments(ids: number[]): Promise<void>;
  occupiedNames(collectionID: number): Promise<string[]>;
  indexAttachments(ids: number[]): Promise<void>;
}

export interface ImportFailure {
  path: string;
  message: string;
}

export interface ImportResult {
  imported: number;
  reused: number;
  ignored: number;
  replaced: number;
  keptBoth: number;
  failed: number;
  importedAttachmentIDs: number[];
  errors: ImportFailure[];
}

export interface ImportProgress {
  completed: number;
  total: number;
  path: string;
  result: ImportResult;
}

function emptyResult(): ImportResult {
  return {
    imported: 0,
    reused: 0,
    ignored: 0,
    replaced: 0,
    keptBoth: 0,
    failed: 0,
    importedAttachmentIDs: [],
    errors: [],
  };
}

function assertResolved(plan: ImportPlan): void {
  if (!allConflictsResolved(plan.files)) {
    throw new Error("Import plan contains an unresolved conflict");
  }
}

async function ensureUnchanged(file: PlannedFile, port: ImportPort): Promise<void> {
  const current = await port.stat(file.absolutePath);
  if (current.size !== file.size || current.mtime !== file.mtime) {
    throw new Error("File changed after preview; rescan before importing");
  }
}

export async function executeImport(
  plan: ImportPlan,
  port: ImportPort,
  onProgress?: (progress: ImportProgress) => void,
): Promise<ImportResult> {
  assertResolved(plan);
  const result = emptyResult();
  const contentAttachments = new Map<string, number>();

  for (let index = 0; index < plan.files.length; index += 1) {
    const file = plan.files[index];
    try {
      if (file.classification === "conflict" && file.conflictAction === "ignore") {
        result.ignored += 1;
        continue;
      }

      await ensureUnchanged(file, port);
      const collectionID = await port.ensureCollection(plan.baseCollectionID, file.target.segments);
      const contentKey = `${file.size}:${file.md5}:${normalizeName(file.name)}`;
      const importedEarlier = contentAttachments.get(contentKey);
      if (importedEarlier !== undefined) {
        await port.linkExisting(importedEarlier, collectionID, file.name);
        result.reused += 1;
        continue;
      }

      if (file.classification === "reused") {
        if (!file.existingAttachmentIDs.length) {
          const attachmentID = await port.importStored({
            path: file.absolutePath,
            name: file.name,
            collectionID,
          });
          contentAttachments.set(contentKey, attachmentID);
          result.importedAttachmentIDs.push(attachmentID);
          result.imported += 1;
          continue;
        }
        const attachmentID = Math.min(...file.existingAttachmentIDs);
        await port.linkExisting(attachmentID, collectionID, file.name);
        contentAttachments.set(contentKey, attachmentID);
        result.reused += 1;
        continue;
      }

      if (file.classification === "new") {
        const attachmentID = await port.importStored({
          path: file.absolutePath,
          name: file.name,
          collectionID,
        });
        contentAttachments.set(contentKey, attachmentID);
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
        contentAttachments.set(contentKey, attachmentID);
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
        if (parentID) {
          await port.linkExisting(attachmentID, collectionID, file.name);
        }
        await port.trashAttachments(file.existingAttachmentIDs);
        contentAttachments.set(contentKey, attachmentID);
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
