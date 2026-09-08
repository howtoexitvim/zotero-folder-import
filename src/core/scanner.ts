/**
 * Walks a source folder and collects the files worth importing. Pure apart from
 * the injected FileSystemPort, so it can be tested without Zotero.
 */

/** File types this plugin imports. */
export type SupportedExtension = "pdf" | "epub";

export interface DirectoryEntry {
  name: string;
  path: string;
  kind: "file" | "directory" | "other";
  symlink?: boolean;
}

/** Size in bytes and last-modified time, used to detect changes after preview. */
export interface FileStat {
  size: number;
  mtime: number;
}

/** The filesystem operations the scanner needs; backed by Zotero at runtime. */
export interface FileSystemPort {
  list(path: string): Promise<DirectoryEntry[]>;
  stat(path: string): Promise<FileStat>;
}

/** One file found on disk. md5 is filled in later, only when needed. */
export interface SourceFile extends FileStat {
  absolutePath: string;
  relativePath: string;
  name: string;
  extension: SupportedExtension;
  md5?: string;
}

export interface ScanError {
  path: string;
  message: string;
}

/** Outcome of a scan: importable files, skipped files, and per-path failures. */
export interface ScanResult {
  files: SourceFile[];
  unsupportedCount: number;
  errors: ScanError[];
}

const SUPPORTED = new Set<SupportedExtension>(["pdf", "epub"]);

/** Joins path segments for the display path shown in the preview. */
function joinRelative(parent: string, child: string): string {
  return parent ? `${parent}/${child}` : child;
}

/**
 * Recursively collects PDF and EPUB files under rootPath.
 *
 * Dot-files and symlinks are skipped: symlinks could point outside the chosen
 * folder or form cycles. A directory that cannot be read is recorded as an
 * error and the scan continues, so one unreadable folder does not fail the run.
 * Results are sorted so the preview order is stable.
 */
export async function scanFolder(rootPath: string, fs: FileSystemPort): Promise<ScanResult> {
  const files: SourceFile[] = [];
  const errors: ScanError[] = [];
  let unsupportedCount = 0;

  async function visit(directory: string, relativeDirectory: string): Promise<void> {
    let entries: DirectoryEntry[];
    try {
      entries = await fs.list(directory);
    } catch (error) {
      errors.push({ path: directory, message: error instanceof Error ? error.message : String(error) });
      return;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name, "en"));
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.symlink) continue;

      const relativePath = joinRelative(relativeDirectory, entry.name);
      if (entry.kind === "directory") {
        await visit(entry.path, relativePath);
        continue;
      }
      if (entry.kind !== "file") continue;

      const dot = entry.name.lastIndexOf(".");
      const extension = (dot >= 0 ? entry.name.slice(dot + 1) : "").toLowerCase();
      if (!SUPPORTED.has(extension as SupportedExtension)) {
        unsupportedCount += 1;
        continue;
      }

      try {
        const stat = await fs.stat(entry.path);
        files.push({
          absolutePath: entry.path,
          relativePath,
          name: entry.name,
          extension: extension as SupportedExtension,
          size: stat.size,
          mtime: stat.mtime,
        });
      } catch (error) {
        errors.push({ path: entry.path, message: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  await visit(rootPath, "");
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath, "en"));
  return { files, unsupportedCount, errors };
}
