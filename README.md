# Folder Import Plugin

Private, clean-room Zotero 10 plugin for importing PDF and EPUB directory trees as managed attachments.

## Commands

```bash
npm install
npm test
npm run typecheck
npm run build
npm run verify
```

`npm run build` creates `dist/folder-import-0.1.1.xpi`. Runtime code has no third-party dependencies, network calls, telemetry, or functional updater. Zotero 10 requires an `update_url` in every installable manifest, so this private build uses a reserved `.invalid` address that cannot host an update service. The build uses TypeScript and esbuild; tests use Vitest.

## Architecture

- `src/core/`: filesystem-independent scanner, destination resolver, import planner, conflict policy, and ordered executor.
- `src/runtime/`: thin Zotero 10 adapters for MenuManager, FilePicker, collections, stored attachments, hashing, annotations, Trash, and full-text indexing.
- `src/dialog.ts`: preview, conflict selection, progress, and completion UI.
- `addon/`: manifest, XHTML/CSS, icon, and Fluent translations copied to the XPI root.
- `tests/`: behavior tests for planning and mutation ordering.

The executor refuses plans with unresolved conflicts. Replace imports first and trashes old attachments only after the new attachment has succeeded. Runtime annotation checks remain active even after preview.

## Compatibility and privacy

- Plugin ID: `folder-import@shuqi.local`
- Version: `0.1.1`
- Zotero: `10.0` through `10.0.*`
- Package license field: `UNLICENSED`
- No working remote repository or release channel is configured; the required update URL uses the reserved `.invalid` top-level domain.

Do not publish the repository or XPI without first making an explicit licensing and distribution decision.
