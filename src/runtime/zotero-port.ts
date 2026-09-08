/**
 * The Zotero-facing half of the plugin: implements the scanner and importer
 * ports against the real Zotero APIs. Everything that touches Zotero lives
 * here, keeping src/core pure and testable.
 */
import type { ImportPort, ImportStoredRequest } from "../core/importer";
import { normalizeName, type ExistingAttachment, type ExistingCollection } from "../core/planner";
import type { DirectoryEntry, FileStat, FileSystemPort, SourceFile } from "../core/scanner";

const SUPPORTED_MIME_TYPES = new Set(["application/pdf", "application/epub+zip"]);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function fileBaseName(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/** Directory listing and stat, backed by Zotero's file helpers. */
export class ZoteroFileSystemPort implements FileSystemPort {
  async list(path: string): Promise<DirectoryEntry[]> {
    const entries: DirectoryEntry[] = [];
    await Zotero.File.iterateDirectory(path, (entry: any) => {
      entries.push({
        name: entry.name,
        path: entry.path,
        kind: entry.isDir ? "directory" : "file",
        symlink: Boolean(entry.isSymLink),
      });
    });
    return entries;
  }

  async stat(path: string): Promise<FileStat> {
    const stat = await IOUtils.stat(path);
    return { size: stat.size, mtime: stat.lastModified };
  }
}

/** Flattens the library's collections into the shape the planner expects. */
export function getLibraryCollections(libraryID: number): ExistingCollection[] {
  return Zotero.Collections.getByLibrary(libraryID, true, false).map((collection: any) => ({
    id: collection.id,
    libraryID: collection.libraryID,
    parentID: collection.parentID,
    name: collection.name,
  }));
}

/**
 * Collects the library's stored PDF/EPUB attachments and which collections they
 * belong to, so the planner can detect same-name clashes in the destination.
 *
 * No hashing is performed: files are matched by name within the target
 * collection, so content never has to be read.
 */
export async function getExistingAttachments(
  libraryID: number,
): Promise<ExistingAttachment[]> {
  const all = await Zotero.Items.getAll(libraryID, false, false, false);
  // Narrow to stored file attachments before loading data types or touching the
  // disk; loading every item in a large library blocks the UI thread for
  // minutes and looks like a hang.
  const items = all.filter((item: any) => item.isStoredFileAttachment?.());
  const attachments: ExistingAttachment[] = [];
  if (!items.length) return attachments;
  await Zotero.Items.loadDataTypes(items, ["childItems", "collections"]);

  let processed = 0;
  for (const item of items) {
    // Yield periodically so Zotero stays responsive while we stat and hash.
    processed += 1;
    if (processed % 25 === 0) await yieldToEventLoop();
    const path = await item.getFilePathAsync();
    if (!path) continue;
    const name = PathUtils.filename(path);
    const extension = Zotero.File.getExtension(path).toLowerCase();
    if (!SUPPORTED_MIME_TYPES.has(item.attachmentContentType) && extension !== "pdf" && extension !== "epub") {
      continue;
    }

    const container = item.parentID ? await Zotero.Items.getAsync(item.parentID) : item;
    attachments.push({
      id: item.id,
      parentID: item.parentID,
      name,
      collectionIDs: container?.getCollections(false) ?? [],
      hasAnnotations: item.getAnnotations(false).length > 0,
    });
  }
  return attachments;
}

/** Performs the library writes an import needs. */
export class ZoteroImportPort extends ZoteroFileSystemPort implements ImportPort {
  private readonly namesByCollection = new Map<number, Set<string>>();

  constructor(
    private readonly libraryID: number,
    private readonly collections: ExistingCollection[],
    initialAttachments: ExistingAttachment[],
  ) {
    super();
    for (const attachment of initialAttachments) {
      for (const collectionID of attachment.collectionIDs) {
        const names = this.namesByCollection.get(collectionID) ?? new Set<string>();
        names.add(attachment.name);
        this.namesByCollection.set(collectionID, names);
      }
    }
  }

  /** Creates the collection path if needed, returning the leaf collection id. */
  async ensureCollection(baseCollectionID: number | undefined, segments: string[]): Promise<number> {
    let parentID = baseCollectionID;
    for (const segment of segments) {
      let match = this.collections.find((collection) => {
        const sameParent = parentID === undefined ? !collection.parentID : collection.parentID === parentID;
        return sameParent && normalizeName(collection.name) === normalizeName(segment);
      });
      if (!match) {
        const collection = new Zotero.Collection({
          libraryID: this.libraryID,
          name: segment,
          parentID: parentID || false,
        });
        await collection.saveTx();
        match = {
          id: collection.id,
          libraryID: this.libraryID,
          parentID: parentID || false,
          name: segment,
        };
        this.collections.push(match);
      }
      parentID = match.id;
    }
    if (!parentID) throw new Error("Unable to resolve target collection");
    return parentID;
  }

  /** Re-reads an attachment's annotation state just before a Replace. */
  async getAttachmentContext(id: number) {
    const attachment = await Zotero.Items.getAsync(id);
    if (!attachment?.isStoredFileAttachment?.()) throw new Error(`Attachment ${id} is unavailable`);
    await Zotero.Items.loadDataTypes([attachment], ["childItems"]);
    return {
      id,
      parentID: attachment.parentID,
      hasAnnotations: attachment.getAnnotations(false).length > 0,
    };
  }

  /**
   * Copies a file into Zotero storage under its original filename. Zotero may
   * rename on import, so the stored file is renamed back when that happens --
   * this plugin deliberately preserves source filenames.
   */
  async importStored(request: ImportStoredRequest): Promise<number> {
    const attachment = await Zotero.Attachments.importFromFile({
      file: request.path,
      libraryID: this.libraryID,
      parentItemID: request.parentItemID,
      collections: request.parentItemID ? undefined : [request.collectionID],
      title: request.name,
      fileBaseName: fileBaseName(request.name),
    });
    const actualPath = await attachment.getFilePathAsync();
    if (!actualPath) throw new Error(`Zotero did not create a stored file for ${request.name}`);
    if (PathUtils.filename(actualPath) !== request.name) {
      const renamed = await attachment.renameAttachmentFile(request.name, {
        overwrite: false,
        unique: false,
        updateTitle: false,
      });
      if (renamed !== true) throw new Error(`Zotero could not preserve filename ${request.name}`);
    }
    attachment.setField("title", request.name);
    await attachment.saveTx({ skipDateModifiedUpdate: true });
    if (request.collectionID) this.rememberName(request.collectionID, request.name);
    return attachment.id;
  }

  /** Moves replaced attachments to the trash (recoverable, never deleted). */
  async trashAttachments(ids: number[]): Promise<void> {
    await Zotero.Items.trashTx(ids);
  }

  /** Filenames already used in a collection, for Keep Both naming. */
  async occupiedNames(collectionID: number): Promise<string[]> {
    return [...(this.namesByCollection.get(collectionID) ?? new Set<string>())];
  }

  /** Queues newly imported files for full-text indexing. */
  async indexAttachments(ids: number[]): Promise<void> {
    await Zotero.FullText.indexItems(ids, { ignoreErrors: true });
  }

  /** Tracks names added during this run so Keep Both stays unique. */
  private rememberName(collectionID: number, name: string): void {
    const names = this.namesByCollection.get(collectionID) ?? new Set<string>();
    names.add(name);
    this.namesByCollection.set(collectionID, names);
  }
}
