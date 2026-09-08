/**
 * Turns a folder scan plus the current library contents into an import plan:
 * which collections to create, and for each file whether it is new or clashes
 * with a same-named attachment in the destination. Pure -- it reads no Zotero
 * state itself, so the whole preview is testable.
 */
import type { SourceFile } from "./scanner";

/** What will happen to a file. */
export type Classification = "new" | "conflict" | "unsupported" | "error";
/** How the user chose to resolve a same-name clash. */
export type ConflictAction = "replace" | "ignore" | "keep-both" | "unresolved";

/** A collection already present in the library. */
export interface ExistingCollection {
  id: number;
  parentID?: number | false;
  name: string;
}

/** A stored-file attachment already in the library, used to spot duplicates. */
export interface ExistingAttachment {
  id: number;
  parentID?: number | false;
  name: string;
  collectionIDs: number[];
  hasAnnotations: boolean;
}

/** Where one file will be filed, and whether that collection exists yet. */
export interface CollectionTarget {
  segments: string[];
  existingCollectionID?: number;
}

/** A scanned file plus the decision made about it. */
export interface PlannedFile extends SourceFile {
  target: CollectionTarget;
  classification: Exclude<Classification, "unsupported" | "error">;
  existingAttachmentIDs: number[];
  conflictAction?: ConflictAction;
  replaceAllowed?: boolean;
}

/** The complete preview: every file, the collections to create, and totals. */
export interface ImportPlan {
  rootName: string;
  baseCollectionID?: number;
  files: PlannedFile[];
  collectionsToCreate: string[][];
  summary: {
    total: number;
    bytes: number;
    new: number;
    conflict: number;
  };
}

/** Everything buildImportPlan needs; supplied by the controller. */
export interface BuildPlanInput {
  rootName: string;
  baseCollectionID?: number;
  files: SourceFile[];
  collections: ExistingCollection[];
  attachments: ExistingAttachment[];
}

/**
 * Case- and Unicode-folded filename key. macOS stores decomposed filenames
 * while other sources use composed ones, so the same file can differ byte-wise;
 * comparing normalized keys keeps duplicate detection consistent.
 */
export function normalizeName(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase("en-US");
}

/** Directory segments of a relative path, which become nested collections. */
function relativeDirectory(relativePath: string): string[] {
  const parts = relativePath.split("/");
  parts.pop();
  return parts.filter(Boolean);
}

/** Maps a file's folder path to a collection, reusing one where it exists. */
function resolveTarget(
  segments: string[],
  baseCollectionID: number | undefined,
  collections: ExistingCollection[],
): CollectionTarget {
  let parentID = baseCollectionID;
  let currentID: number | undefined;

  for (const segment of segments) {
    const match = collections.find((collection) => {
      const sameParent = parentID === undefined
        ? !collection.parentID
        : collection.parentID === parentID;
      return sameParent && normalizeName(collection.name) === normalizeName(segment);
    });
    if (!match) return { segments };
    currentID = match.id;
    parentID = match.id;
  }

  return { segments, existingCollectionID: currentID };
}

/**
 * Classifies every scanned file by name against the destination collection.
 *
 * This deliberately mirrors a file manager: a clash is a file of the same name
 * in the folder you are importing into, and nothing else. Copies elsewhere in
 * the library are ignored, so each import produces its own attachment and
 * deleting one never affects another. Everything that does not clash is "new".
 */
export function buildImportPlan(input: BuildPlanInput): ImportPlan {
  const files = [...input.files]
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath, "en"))
    .map<PlannedFile>((file) => {
      const segments = [input.rootName, ...relativeDirectory(file.relativePath)];
      const target = resolveTarget(segments, input.baseCollectionID, input.collections);

      // Only the destination collection is examined, and only by filename --
      // the same rule a file manager uses. A copy of this file elsewhere in the
      // library is none of this import's business.
      const conflicts = target.existingCollectionID === undefined
        ? []
        : input.attachments.filter(
          (attachment) => attachment.collectionIDs.includes(target.existingCollectionID!)
            && normalizeName(attachment.name) === normalizeName(file.name),
        );
      if (conflicts.length) {
        return {
          ...file,
          target,
          classification: "conflict",
          existingAttachmentIDs: conflicts.map(({ id }) => id),
          conflictAction: "unresolved",
          replaceAllowed: conflicts.length === 1 && conflicts.every((attachment) => !attachment.hasAnnotations),
        };
      }

      return {
        ...file,
        target,
        classification: "new",
        existingAttachmentIDs: [],
      };
    });

  const collectionPaths = new Map<string, string[]>();
  for (const file of files) {
    if (file.target.existingCollectionID === undefined) {
      collectionPaths.set(file.target.segments.map(normalizeName).join("\u0000"), file.target.segments);
    }
  }

  return {
    rootName: input.rootName,
    baseCollectionID: input.baseCollectionID,
    files,
    collectionsToCreate: [...collectionPaths.values()].sort((a, b) => a.join("/").localeCompare(b.join("/"), "en")),
    summary: {
      total: files.length,
      bytes: files.reduce((total, file) => total + file.size, 0),
      new: files.filter((file) => file.classification === "new").length,
      conflict: files.filter((file) => file.classification === "conflict").length,
    },
  };
}
