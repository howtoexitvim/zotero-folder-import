export interface SelectedRow {
  type: string;
  libraryID: number;
  collectionID?: number;
  collectionPath?: string;
}

export interface Destination {
  libraryID: number;
  baseCollectionID?: number;
  baseLabel: string;
}

export function resolveDestination(rows: SelectedRow[], userLibraryID: number): Destination {
  if (rows.length !== 1) {
    throw new Error("Select exactly one My Library row or collection before importing");
  }
  const row = rows[0];
  if (row.libraryID !== userLibraryID) {
    throw new Error("Folder Import supports My Library only");
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
