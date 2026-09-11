<div align="center">

# Zotero Folder Import

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

![Zotero](https://img.shields.io/badge/Zotero-10-CC2936)
![Type](https://img.shields.io/badge/type-Plugin-2563eb)
![Privacy](https://img.shields.io/badge/privacy-no%20network-059669)

</div>

Zotero Folder Import is a Zotero 10 plugin for importing a folder of PDFs and EPUBs as managed attachments.

The folder structure becomes nested collections. Filenames are preserved, and no metadata lookup or renaming is performed — what you see in Finder is what you get in Zotero.

No third-party runtime dependencies, no network calls, no telemetry.

## Install

Download the `.xpi` from the [releases page](https://github.com/howtoexitvim/zotero-folder-import/releases), then in Zotero go to **Tools → Add-ons → gear icon → Install Add-on From File…** and pick the downloaded file.

Then right-click any collection and choose the folder-import entry to pick a directory tree.

Requires Zotero 10. The current release is **v0.1.21**.

There is no auto-update channel. Zotero 10 requires an `update_url` in every installable manifest, so the build points at a reserved `.invalid` address that cannot host an update service. New versions are installed the same way.

## How a file is classified

There is exactly one rule: **does the destination collection already contain a file with the same name?** This matches how a file manager behaves — the content is never read, and the rest of the library is never scanned.

| Status | Rule | Behaviour |
| --- | --- | --- |
| **New** | No file with that name in the destination collection | Copied into Zotero storage, original filename kept |
| **Conflict** | A file with that name already exists there | You choose Replace / Keep Both / Ignore |

Every import creates **its own attachment**. Importing the same PDF into two collections produces two independent items with two independent storage directories, so deleting, annotating, or retitling in one place never affects the other. The cost is one copy of the file per location — the same trade-off as copying a file into two folders in Finder.

Delete behaviour follows the key you press. Inside a collection, Delete calls `removeFromCollection`, which only detaches the item from that collection. Cmd+Delete, or deleting from the My Library root, calls `trashTx` and moves the item itself to the trash. The prompts read "Remove from Collection" and "Move to Trash" respectively.

A Replace imports the new attachment first and only trashes the old one once that has succeeded, so a failed import never leaves you with neither copy.

Imports are cancellable. Cancel during an import turns into a stop action, and the loop checks the flag each round: whatever was already imported stays, the rest is skipped, and the result page marks the run as cancelled. The executor refuses to run any plan that still has unresolved conflicts.

## Why not MD5 matching

An earlier assumption was that Zotero identifies files by MD5 underneath, so the plugin had to match hashes or Cmd+Delete would remove the other copy. Checking the source showed that this is wrong, and 0.1.18 moved matching to plain filenames:

- Attachment storage directories are keyed by a **random item key**, not by content, so two identical PDFs live in two directories with two physical copies.
- `importFromFile` has **no hash deduplication** of any kind.
- The Duplicate Items view matches on **ISBN / DOI / title + author**, not on MD5.
- MD5 (`attachmentSyncedHash`) is used **only for storage sync**, to decide whether a file needs re-uploading. It has nothing to do with deletion or deduplication.

Independent copies therefore do not affect each other. The deletions observed across collections came from an early version of this plugin reusing a single item via `linkExisting()`; that path was removed.

## Known Zotero 10 constraints

These are platform limits rather than choices, noted here in case they save another plugin author some time:

- Plugin dialogs must open from a registered `chrome://` URL. An installed XPI's `rootURI` is a `jar:` URL, and windows opened from there load neither styles nor scripts, rendering blank.
- The dialog body must be pure XUL. A single HTML element makes the parser discard the whole body (`documentElement.children.length === 0`).
- Fluent files shipped by a plugin do not resolve in menus or dialogs, so all strings are set from script instead.
- The Zotero source lives in `/Applications/Zotero.app/Contents/Resources/app/omni.ja` and can be unpacked to verify APIs rather than guessing.

## Commands

```bash
npm install
npm test
npm run typecheck
npm run build
npm run verify
```

`npm run build` writes `dist/folder-import-<version>.xpi`, taking the version from `addon/manifest.json`. The build uses TypeScript and esbuild; tests use Vitest, and 57 tests pass.

## Architecture

- `src/core/`: filesystem-independent scanner, destination resolver, import planner, conflict policy, and ordered executor.
- `src/runtime/`: Zotero 10 adapters for MenuManager, FilePicker, collections, stored attachments, annotations, Trash, and full-text indexing.
- `src/dialog.ts`: preview, conflict selection, progress, and completion UI.
- `addon/`: manifest, XUL dialog, CSS, and icon, copied to the XPI root.
- `tests/`: behaviour tests for planning, conflict handling, and mutation ordering, plus source-text assertions pinning the XUL/chrome/menu wiring this build had to discover empirically.

## Compatibility and privacy

- Plugin ID: `folder-import@shuqi.local`
- Zotero: `10.0` through `10.0.*`
- No network calls, no telemetry, no metadata lookup. Files are matched by name within the destination collection; content is never read or hashed.

## License

[MIT](LICENSE)
