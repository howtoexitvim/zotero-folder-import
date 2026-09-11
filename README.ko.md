<div align="center">

# Zotero Folder Import

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

![Zotero](https://img.shields.io/badge/Zotero-10-CC2936)
![Type](https://img.shields.io/badge/type-Plugin-2563eb)
![Privacy](https://img.shields.io/badge/privacy-no%20network-059669)

</div>

수년간 폴더로 정리해 둔 PDF가 하드디스크에 가득합니다. 그런데 Zotero는 한 번에 하나씩만 받아줍니다.

Zotero Folder Import는 폴더 트리를 통째로 가져옵니다. 폴더 구조는 그대로 중첩 컬렉션이 되고, 파일 이름도 원래대로 유지됩니다. 이름을 바꾸지도, 온라인에서 메타데이터를 찾지도 않습니다. Finder에서 보이는 그대로가 Zotero에 들어갑니다.

무언가 기록되기 전에 먼저 검토 화면이 나옵니다. 개수, 새로 만들어질 컬렉션, 그리고 파일 하나하나의 상태까지. 결정은 당신이 합니다.

## Folder Import를 선택하는 이유

- 📁 **폴더 구조를 그대로**: 디렉터리 트리가 중첩 컬렉션이 되고 파일 이름도 유지됩니다. 메타데이터 조회 없음, 이름 변경 없음.
- 👀 **움직이기 전에 확인**: 검토 대화상자에 전체 개수, 생성될 컬렉션, 파일별 상태가 표시됩니다. 파일이 단 하나도 옮겨지기 전에.
- 🤝 **충돌은 당신의 선택**: 파일마다 Replace(교체) / Keep Both(둘 다 유지) / Ignore(무시)를 고를 수 있습니다. Replace는 새 파일을 먼저 가져오고, 성공한 뒤에야 기존 파일을 휴지통으로 보냅니다.
- ⏹️ **언제든 중단 가능**: 가져오는 도중 취소해도 이미 들어온 파일은 그대로 남습니다.
- 🧩 **사본은 서로 독립적**: 가져오기마다 별도의 첨부 파일이므로, 한 컬렉션에서 삭제하거나 주석을 달아도 다른 컬렉션에는 영향이 없습니다.
- 🔒 **설계부터 비공개**: 네트워크 통신 없음, 텔레메트리 없음, 메타데이터 조회 없음. 파일 내용을 읽거나 해시하지 않으며, 대상 컬렉션 안에서 파일 이름으로만 대조합니다.

## 스크린샷

<div align="center">
  <img src="assets/review-import.png" width="90%" alt="가져오기 검토 대화상자. 원본 경로, 대상 컬렉션, 63개 파일 650.0 MB 중 신규 63개 충돌 0개를 보여주는 통계 타일, 생성될 14개 컬렉션 목록, 파일별 상태가 담긴 표가 표시되어 있음" />
</div>

<br/>

<table>
	<tr>
		<td align="center"><strong>파일 메뉴의 Import Folder…</strong></td>
		<td align="center"><strong>플러그인 관리자에 설치된 모습</strong></td>
	</tr>
	<tr>
		<td align="center"><img src="assets/menu-entry.png" alt="이 플러그인이 추가한 Import Folder 항목이 보이는 Zotero 파일 메뉴" height="260" /></td>
		<td align="center"><img src="assets/plugins-manager.png" alt="Zotero 플러그인 관리자에 표시된 Folder Import, 작성자 Shuqi, 버전 0.1.21" height="260" /></td>
	</tr>
	<tr>
		<td align="center" colspan="2"><strong>가져오기 완료</strong></td>
	</tr>
	<tr>
		<td align="center" colspan="2"><img src="assets/import-complete.png" alt="가져오기 완료 대화상자. 진행 막대가 가득 찬 상태로 5 / 5 파일, 신규 5 · 교체 0 · 둘 다 유지 0 · 무시 0 · 실패 0 집계가 표시되어 있음" /></td>
	</tr>
</table>

## 설치

[릴리스 페이지](https://github.com/howtoexitvim/zotero-folder-import/releases)에서 `.xpi` 파일을 내려받습니다. 현재 릴리스는 **v0.1.21**입니다.

Zotero에서 **도구 → 추가 기능 → 톱니바퀴 아이콘 → 파일에서 추가 기능 설치…**로 이동해 내려받은 파일을 선택하고, 재시작을 묻는다면 재시작합니다.

그다음 **파일 → Import Folder…**를 선택하거나, 아무 컬렉션이나 오른쪽 클릭하세요.

Zotero 10이 필요합니다.

## 소스에서 빌드

```bash
npm install
npm test
npm run build
```

`npm run build`는 `dist/folder-import-<version>.xpi`를 생성합니다.

## 참고

자동 업데이트 채널은 없습니다. 새 버전도 처음과 같은 방법으로 설치하면 됩니다.

## License

[MIT](LICENSE)
