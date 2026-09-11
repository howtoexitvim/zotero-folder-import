<div align="center">

# Zotero Folder Import

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

![Zotero](https://img.shields.io/badge/Zotero-10-CC2936)
![Type](https://img.shields.io/badge/type-Plugin-2563eb)
![Privacy](https://img.shields.io/badge/privacy-no%20network-059669)

</div>

You have a hard drive full of PDFs, sorted into folders over the years. Zotero wants them one at a time.

Zotero Folder Import takes the whole tree. Your folders become nested collections, your filenames stay exactly as they are, and nothing is renamed or looked up online. What you see in Finder is what you get in Zotero.

Before anything is written, you get a review screen. You see the counts, the collections that will be created, and the status of every single file. Then you decide.

## Why Folder Import

- 📁 **Your folders, kept**: the directory tree becomes nested collections, filenames preserved. No metadata lookup, no renaming.
- 👀 **Look before you leap**: the review dialog shows totals, the collections about to be created, and per-file status — before a single file moves.
- 🤝 **Conflicts are yours**: Replace, Keep Both, or Ignore, file by file. A Replace imports the new copy first and only trashes the old one after that succeeds.
- ⏹️ **Stop anytime**: cancel mid-import and whatever already landed stays put.
- 🧩 **Independent copies**: each import is its own attachment, so deleting or annotating in one collection never touches another.
- 🔒 **Private by design**: no network calls, no telemetry, no metadata lookup. File contents are never read or hashed — matching is by filename within the destination collection only.

## Screenshots

<div align="center">
  <img src="assets/review-import.png" width="90%" alt="Review import dialog showing source path, destination collection, stat tiles for 63 files and 650.0 MB with 63 new and 0 conflicts, a list of 14 collections to create, and a file table with per-file status" />
</div>

<br/>

<table>
	<tr>
		<td align="center"><strong>Import Folder… in the File Menu</strong></td>
		<td align="center"><strong>Installed in the Plugins Manager</strong></td>
	</tr>
	<tr>
		<td align="center"><img src="assets/menu-entry.png" alt="Zotero File menu open with the Import Folder entry added by the plugin" height="260" /></td>
		<td align="center"><img src="assets/plugins-manager.png" alt="Zotero Plugins Manager showing Folder Import by Shuqi, version 0.1.21" height="260" /></td>
	</tr>
	<tr>
		<td align="center" colspan="2"><strong>Import Complete</strong></td>
	</tr>
	<tr>
		<td align="center" colspan="2"><img src="assets/import-complete.png" alt="Import complete dialog with a full progress bar, 5 of 5 files, and a tally of New 5, Replace 0, Keep Both 0, Ignore 0, Failed 0" /></td>
	</tr>
</table>

## Install

Download the `.xpi` from the [releases page](https://github.com/howtoexitvim/zotero-folder-import/releases). The current release is **v0.1.21**.

In Zotero, go to **Tools → Add-ons → gear icon → Install Add-on From File…**, pick the file you downloaded, and restart if prompted.

Then choose **File → Import Folder…**, or right-click any collection.

Requires Zotero 10.

## Building from source

```bash
npm install
npm test
npm run build
```

`npm run build` writes `dist/folder-import-<version>.xpi`.

## Notes

There is no auto-update channel — new versions are installed the same way as the first one.

## License

[MIT](LICENSE)
