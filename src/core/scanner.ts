export type SupportedExtension = "pdf" | "epub";

export interface DirectoryEntry {
  name: string;
  path: string;
  kind: "file" | "directory" | "other";
  symlink?: boolean;
}

export interface FileStat {
  size: number;
  mtime: number;
}

export interface FileSystemPort {
  list(path: string): Promise<DirectoryEntry[]>;
  stat(path: string): Promise<FileStat>;
}

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

export interface ScanResult {
  files: SourceFile[];
  unsupportedCount: number;
  errors: ScanError[];
}

const SUPPORTED = new Set<SupportedExtension>(["pdf", "epub"]);

function joinRelative(parent: string, child: string): string {
  return parent ? `${parent}/${child}` : child;
}

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
      if (!SUPPORTED.has(extension as SupportedExtension) || extension === "lnk") {
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
