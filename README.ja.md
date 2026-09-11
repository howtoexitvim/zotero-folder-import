<div align="center">

# Zotero Folder Import

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

![Zotero](https://img.shields.io/badge/Zotero-10-CC2936)
![Type](https://img.shields.io/badge/type-Plugin-2563eb)
![Privacy](https://img.shields.io/badge/privacy-no%20network-059669)

</div>

長年フォルダで整理してきた PDF がハードディスクいっぱいにある。けれど Zotero は一つずつしか受け取ってくれません。

Zotero Folder Import はフォルダツリーをまるごと取り込みます。フォルダ構造はそのまま入れ子のコレクションになり、ファイル名も元のまま。リネームもせず、オンラインでメタデータを探しにもいきません。Finder で見えているものが、そのまま Zotero に入ります。

何かが書き込まれる前に、まず確認画面が表示されます。件数、作成されるコレクション、そして一つひとつのファイルの状態。決めるのはあなたです。

## Folder Import を選ぶ理由

- 📁 **フォルダ構造をそのまま**：ディレクトリツリーが入れ子のコレクションになり、ファイル名も保持されます。メタデータ検索なし、リネームなし。
- 👀 **動かす前に見える**：確認ダイアログに合計件数、作成予定のコレクション、ファイルごとの状態が表示されます。1 ファイルも動かす前に。
- 🤝 **競合はあなたが決める**：ファイルごとに Replace（置き換え）／Keep Both（両方残す）／Ignore（無視）を選べます。Replace は新しいファイルを先に取り込み、それが成功してから古いほうをゴミ箱へ移します。
- ⏹️ **いつでも中断できる**：取り込み途中でキャンセルしても、すでに取り込まれた分はそのまま残ります。
- 🧩 **コピーは互いに独立**：各取り込みが独立した添付ファイルなので、あるコレクションでの削除や注釈が別のコレクションに影響することはありません。
- 🔒 **設計からプライベート**：ネットワーク通信なし、テレメトリなし、メタデータ検索なし。ファイルの内容を読むこともハッシュ化することもありません。照合は取り込み先コレクション内のファイル名だけで行われます。

## スクリーンショット

<div align="center">
  <img src="assets/review-import.png" width="90%" alt="取り込み確認ダイアログ。元のパス、取り込み先コレクション、63 ファイル・650.0 MB・新規 63・競合 0 などの統計タイル、作成される 14 個のコレクション一覧、ファイルごとの状態を示す表が表示されている" />
</div>

<br/>

<table>
	<tr>
		<td align="center"><strong>ファイルメニューの Import Folder…</strong></td>
		<td align="center"><strong>プラグインマネージャーでの表示</strong></td>
	</tr>
	<tr>
		<td align="center"><img src="assets/menu-entry.png" alt="本プラグインが追加した Import Folder 項目が表示された Zotero のファイルメニュー" height="260" /></td>
		<td align="center"><img src="assets/plugins-manager.png" alt="Zotero のプラグインマネージャーに表示された Folder Import、作者 Shuqi、バージョン 0.1.21" height="260" /></td>
	</tr>
	<tr>
		<td align="center" colspan="2"><strong>取り込み完了</strong></td>
	</tr>
	<tr>
		<td align="center" colspan="2"><img src="assets/import-complete.png" alt="取り込み完了ダイアログ。プログレスバーが満了し、5 / 5 ファイル、新規 5・置き換え 0・両方残す 0・無視 0・失敗 0 の集計が表示されている" /></td>
	</tr>
</table>

## インストール

[リリースページ](https://github.com/howtoexitvim/zotero-folder-import/releases) から `.xpi` をダウンロードします。現在のリリースは **v0.1.21** です。

Zotero で **ツール → アドオン → 歯車アイコン → ファイルからアドオンをインストール…** を開き、ダウンロードしたファイルを選択します。再起動を求められたら再起動してください。

あとは **ファイル → Import Folder…** を選ぶか、任意のコレクションを右クリックします。

Zotero 10 が必要です。

## ソースからビルド

```bash
npm install
npm test
npm run build
```

`npm run build` は `dist/folder-import-<version>.xpi` を生成します。

## 補足

自動更新チャンネルはありません。新しいバージョンも、最初と同じ手順でインストールします。

## License

[MIT](LICENSE)
