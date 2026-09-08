import type { SourceFile } from "./scanner";

export type Classification = "new" | "reused" | "conflict" | "unsupported" | "error";
export type ConflictAction = "replace" | "ignore" | "keep-both" | "unresolved";

export interface ExistingCollection {
  id: number;
  libraryID: number;
  parentID?: number | false;
  name: string;
}

export interface ExistingAttachment {
  id: number;
  parentID?: number | false;
  name: string;
  size: number;
  md5: string;
  collectionIDs: number[];
  hasAnnotations: boolean;
}

export interface CollectionTarget {
  segments: string[];
  existingCollectionID?: number;
}

export interface PlannedFile extends SourceFile {
  target: CollectionTarget;
  classification: Exclude<Classification, "unsupported" | "error">;
  existingAttachmentIDs: number[];
  conflictAction?: ConflictAction;
  replaceAllowed?: boolean;
  sourceDuplicateOf?: string;
}

export interface ImportPlan {
  rootName: string;
  baseCollectionID?: number;
  files: PlannedFile[];
  collectionsToCreate: string[][];
  summary: {
    total: number;
    bytes: number;
    new: number;
    reused: number;
    conflict: number;
  };
}

export interface BuildPlanInput {
  rootName: string;
  baseCollectionID?: number;
  files: SourceFile[];
  collections: ExistingCollection[];
  attachments: ExistingAttachment[];
}

export function normalizeName(value: string): string {
  return value.normalize("NFC").toLocaleLowerCase("en-US");
}

function relativeDirectory(relativePath: string): string[] {
  const parts = relativePath.split("/");
  parts.pop();
  return parts.filter(Boolean);
}

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

export function buildImportPlan(input: BuildPlanInput): ImportPlan {
  const sourceContent = new Map<string, PlannedFile>();
  const claimedExistingAttachments = new Set<number>();
  const files = [...input.files]
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath, "en"))
    .map<PlannedFile>((file) => {
      if (!file.md5) throw new Error(`Missing MD5 for ${file.absolutePath}`);

      const segments = [input.rootName, ...relativeDirectory(file.relativePath)];
      const target = resolveTarget(segments, input.baseCollectionID, input.collections);
      const contentKey = `${file.size}:${file.md5}`;
      const sourceIdentityKey = `${contentKey}:${normalizeName(file.name)}`;
      const previousSource = sourceContent.get(sourceIdentityKey);
      if (previousSource && previousSource.classification !== "conflict") {
        return {
          ...file,
          target,
          classification: "reused",
          existingAttachmentIDs: previousSource.existingAttachmentIDs,
          sourceDuplicateOf: previousSource.relativePath,
        };
      }

      const sameContent = input.attachments.filter(
        (attachment) => attachment.size === file.size
          && attachment.md5 === file.md5
          && !claimedExistingAttachments.has(attachment.id),
      );
      if (sameContent.length) {
        const planned: PlannedFile = {
          ...file,
          target,
          classification: "reused",
          existingAttachmentIDs: sameContent.map(({ id }) => id),
        };
        sourceContent.set(sourceIdentityKey, planned);
        sameContent.forEach((attachment) => claimedExistingAttachments.add(attachment.id));
        return planned;
      }

      const conflicts = target.existingCollectionID === undefined
        ? []
        : input.attachments.filter(
          (attachment) => attachment.collectionIDs.includes(target.existingCollectionID!)
            && normalizeName(attachment.name) === normalizeName(file.name),
        );
      if (conflicts.length) {
        const planned: PlannedFile = {
          ...file,
          target,
          classification: "conflict",
          existingAttachmentIDs: conflicts.map(({ id }) => id),
          conflictAction: "unresolved",
          replaceAllowed: conflicts.length === 1 && conflicts.every((attachment) => !attachment.hasAnnotations),
        };
        sourceContent.set(sourceIdentityKey, planned);
        return planned;
      }

      const planned: PlannedFile = {
        ...file,
        target,
        classification: "new",
        existingAttachmentIDs: [],
      };
      sourceContent.set(sourceIdentityKey, planned);
      return planned;
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
      reused: files.filter((file) => file.classification === "reused").length,
      conflict: files.filter((file) => file.classification === "conflict").length,
    },
  };
}
