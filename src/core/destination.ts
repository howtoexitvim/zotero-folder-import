/**
 * Works out where an import should land from what the user has selected in the
 * collections pane.
 */

/** The parts of a Zotero collection-tree row this module needs. */
export interface SelectedRow {
  /** Zotero's row type, e.g. "library", "collection", "trash". */
  type: string;
  libraryID: number;
  /** Set only for "collection" rows. */
  collectionID?: number;
  /** Human-readable path of a collection row, e.g. "Publishing / CoRL_Conf". */
  collectionPath?: string;
}

/** Where imported files will be filed. */
export interface Destination {
  libraryID: number;
  /** Undefined when importing into the library root. */
  baseCollectionID?: number;
  /** Path shown in the preview dialog. */
  baseLabel: string;
}

/**
 * Row types that can receive an import. Everything else in the pane -- My
 * Publications, Duplicate Items, Unfiled Items, Trash, saved searches, feeds --
 * is a view over existing items rather than a place files can be filed into.
 */
const IMPORTABLE_ROW_TYPES = new Set(["library", "collection"]);

export function canImportInto(row: SelectedRow | undefined, userLibraryID: number): boolean {
  return !!row
    && row.libraryID === userLibraryID
    && IMPORTABLE_ROW_TYPES.has(row.type);
}

/**
 * Resolves the single selected row to an import destination, rejecting
 * selections that cannot receive files.
 */
export function resolveDestination(rows: SelectedRow[], userLibraryID: number): Destination {
  if (rows.length !== 1) {
    throw new Error("Select exactly one My Library row or collection before importing");
  }
  const row = rows[0];
  if (row.libraryID !== userLibraryID) {
    throw new Error("Folder Import supports My Library only");
  }
  if (!IMPORTABLE_ROW_TYPES.has(row.type)) {
    throw new Error("Select My Library or a collection before importing");
  }
  if (row.type === "collection") {
    if (!row.collectionID || !row.collectionPath) {
      throw new Error("The selected collection is unavailable");
    }
    return {
      libraryID: row.libraryID,
      baseCollectionID: row.collectionID,
      baseLabel: `My Library / ${row.collectionPath}`,
    };
  }
  return {
    libraryID: row.libraryID,
    baseCollectionID: undefined,
    baseLabel: "My Library",
  };
}
