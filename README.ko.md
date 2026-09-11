<div align="center">

# Zotero Folder Import

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

![Zotero](https://img.shields.io/badge/Zotero-10-CC2936)
![Type](https://img.shields.io/badge/type-Plugin-2563eb)
![Privacy](https://img.shields.io/badge/privacy-no%20network-059669)

</div>

Zotero Folder Import는 PDF와 EPUB 폴더를 관리 첨부파일로 가져오기 위한 Zotero 10 플러그인입니다.

폴더 구조는 그대로 중첩된 컬렉션이 됩니다. 파일 이름은 보존되며 메타데이터 조회나 이름 변경은 전혀 하지 않습니다. Finder에서 보이는 그대로가 Zotero에 들어갑니다.

서드파티 런타임 의존성 없음, 네트워크 요청 없음, 텔레메트리 없음.

## 설치

[releases 페이지](https://github.com/howtoexitvim/zotero-folder-import/releases)에서 `.xpi`를 내려받은 뒤, Zotero에서 **Tools → Add-ons → 톱니바퀴 아이콘 → Install Add-on From File…** 로 이동해 해당 파일을 선택하세요.

그다음 아무 컬렉션이나 오른쪽 클릭하고 폴더 가져오기 항목을 선택하면 가져올 디렉터리 트리를 고를 수 있습니다.

Zotero 10이 필요합니다. 현재 릴리스는 **v0.1.21** 입니다.

자동 업데이트 채널은 없습니다. Zotero 10은 설치 가능한 모든 manifest에 `update_url`을 요구하므로, 빌드는 업데이트 서비스를 둘 수 없는 예약된 `.invalid` 주소를 가리킵니다. 새 버전도 같은 방식으로 설치하면 됩니다.

## 파일을 분류하는 방식

기준은 단 하나입니다. **대상 컬렉션에 같은 이름의 파일이 있는가.** 파일 관리자와 동일한 방식이며, 파일 내용을 읽지도 않고 라이브러리 전체를 훑지도 않습니다.

| 상태 | 기준 | 동작 |
| --- | --- | --- |
| **New** | 대상 컬렉션에 같은 이름의 파일이 없음 | Zotero storage로 복사하고 원래 파일 이름 유지 |
| **Conflict** | 대상 컬렉션에 같은 이름의 파일이 이미 있음 | Replace / Keep Both / Ignore 중에서 사용자가 선택 |

가져오기를 할 때마다 **자체 첨부파일**이 만들어집니다. 같은 PDF를 두 컬렉션에 가져오면 독립된 두 개의 항목과 두 개의 storage 디렉터리가 생기므로, 한쪽에서 삭제하거나 주석을 달거나 제목을 바꿔도 다른 쪽에는 영향을 주지 않습니다. 대신 위치마다 파일 사본을 하나씩 갖게 됩니다. Finder에서 같은 파일을 두 폴더에 복사하는 것과 같은 절충입니다.

삭제 동작은 누르는 키에 따라 달라집니다. 컬렉션 안에서 Delete를 누르면 `removeFromCollection`이 호출되어 해당 컬렉션에서 항목을 떼어낼 뿐입니다. Cmd+Delete 또는 My Library 루트에서의 삭제는 `trashTx`를 호출해 항목 자체를 휴지통으로 보냅니다. 확인 문구는 각각 "Remove from Collection"과 "Move to Trash"입니다.

Replace는 새 첨부 파일을 먼저 가져오고, 그것이 성공한 뒤에야 이전 파일을 휴지통으로 보냅니다. 가져오기가 실패해도 두 사본을 모두 잃지 않습니다.

가져오기는 취소할 수 있습니다. 가져오는 중에는 Cancel이 중지 동작으로 바뀌고 루프가 매 회차마다 플래그를 확인합니다. 이미 가져온 것은 그대로 남고 나머지는 건너뛰며, 결과 화면에 취소됨으로 표시됩니다. 해결되지 않은 충돌이 남아 있는 계획은 실행기가 실행을 거부합니다.

## MD5로 대조하지 않는 이유

한때는 "Zotero가 내부적으로 MD5로 파일을 식별하니 해시를 맞춰야 하고, 그러지 않으면 Cmd+Delete가 다른 사본까지 지운다"고 생각했습니다. 소스를 확인한 결과 이는 사실이 아니었고, 0.1.18에서 판정을 순수한 파일 이름 기준으로 바꿨습니다.

- 첨부파일의 storage 디렉터리는 내용이 아니라 **무작위 항목 키**로 구분됩니다. 내용이 같은 PDF 두 개는 서로 다른 디렉터리에 각각 물리적 사본으로 존재합니다.
- `importFromFile`에는 해시 기반 **중복 제거 로직이 전혀 없습니다.**
- Duplicate Items 보기는 **ISBN / DOI / 제목 + 저자**로 대조하며 MD5를 쓰지 않습니다.
- MD5(`attachmentSyncedHash`)는 **storage sync에만** 쓰이며, 파일을 다시 업로드해야 하는지 판단하기 위한 것입니다. 삭제나 중복 제거와는 무관합니다.

따라서 독립된 사본들은 서로 영향을 주지 않습니다. 이전에 관찰된 "한쪽을 지우면 다른 쪽도 사라지는" 현상은 초기 버전이 `linkExisting()`으로 하나의 항목을 재사용했기 때문이며, 그 경로는 이미 제거되었습니다.

## 알려진 Zotero 10 제약

이는 이 플러그인의 선택이 아니라 플랫폼의 제약입니다. 다른 플러그인 개발자의 시간을 아껴줄 수도 있어 기록해 둡니다.

- 플러그인 대화상자는 등록된 `chrome://` URL에서 열어야 합니다. 설치된 XPI의 `rootURI`는 `jar:` URL이며, 거기서 연 창은 스타일도 스크립트도 불러오지 못해 빈 화면으로 렌더링됩니다.
- 대화상자의 body는 순수 XUL이어야 합니다. HTML 요소가 하나라도 섞이면 파서가 body 전체를 버립니다(`documentElement.children.length === 0`).
- 플러그인이 함께 제공하는 Fluent 파일은 메뉴에서도 대화상자에서도 해석되지 않습니다. 그래서 모든 문구를 스크립트에서 직접 설정합니다.
- Zotero 소스는 `/Applications/Zotero.app/Contents/Resources/app/omni.ja`에 있으며, 압축을 풀면 추측 대신 API를 직접 확인할 수 있습니다.

## 명령어

```bash
npm install
npm test
npm run typecheck
npm run build
npm run verify
```

`npm run build`는 `dist/folder-import-<version>.xpi`를 생성하며 버전은 `addon/manifest.json`에서 가져옵니다. 빌드는 TypeScript와 esbuild를, 테스트는 Vitest를 사용하며 57개의 테스트가 모두 통과합니다.

## 아키텍처

- `src/core/`: 파일시스템에 의존하지 않는 스캐너, 대상 리졸버, 가져오기 플래너, 충돌 정책, 순서 보장 실행기.
- `src/runtime/`: MenuManager, FilePicker, 컬렉션, 저장 첨부파일, 주석, 휴지통, 전문 색인에 대한 Zotero 10 어댑터.
- `src/dialog.ts`: 미리보기, 충돌 선택, 진행 상황, 완료 UI.
- `addon/`: manifest, XUL 대화상자, CSS, 아이콘. XPI 루트로 복사됩니다.
- `tests/`: 계획 수립, 충돌 처리, 변경 순서에 대한 동작 테스트와, 이 빌드가 직접 부딪혀 알아낸 XUL / chrome / 메뉴 연결을 고정하는 소스 텍스트 단언.

## 호환성과 프라이버시

- 플러그인 ID: `folder-import@shuqi.local`
- Zotero: `10.0` 부터 `10.0.*` 까지
- 네트워크 요청 없음, 텔레메트리 없음, 메타데이터 조회 없음. 파일은 대상 컬렉션 안의 이름으로만 대조하며, 내용을 읽거나 해시하지 않습니다.

## 라이선스

[MIT](LICENSE)
