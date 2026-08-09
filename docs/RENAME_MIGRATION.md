# Spotlog → スポット帖 名称・公開URL移行手順書

このドキュメントは「Spotlog」から「スポット帖」への名称変更、および公開URL
`spotlog.num-ish.com` から `spots.num-ish.com`（候補）への移行作業を、
複数セッション・複数リポジトリにまたがって迷わず継続できるようにするための
進捗管理・手順書である。

**このリポジトリ（`google-maps-dashboard`）はスポット帖の【アプリ本体】を担当する。**
公式サイト（NUM-ISHブランドサイト、`num-ish.com`ルート）は別リポジトリ・別ツール
（Codex）で構築されており、このドキュメントではそちら側の作業は
「依存関係」「完了確認」としてのみ扱う。詳細手順はそちらのリポジトリ側で管理する。

決定事項・変更方針そのもの（何を変えるか）は [`SPEC.md`](../SPEC.md) の
1.1節（特に1.1.7〜1.1.10）が正であり、本書はその実施手順・進捗管理を担う。
矛盾が生じた場合はSPEC.mdの記載を優先し、本書側を修正すること。

---

## 進捗状況（作業再開時は必ずここから確認）

| 項目 | 内容 |
|---|---|
| 現在フェーズ | **アプリ側：M6着手（旧URL関連の削除作業を実施）**／**公式サイト側：M5の実装・push完了、Cloudflare Pages本番反映は未確認のまま**／**Google OAuth同意画面のブランド変更（アプリ名・ホームページURL等）：未着手**／**M6：旧URLのDNS・OAuth生成元削除と新URLでの再確認まで実施、残項目あり** |
| 完了済みフェーズ | M0・M2・M4完了。アプリ側M5（CNAME更新・Cloudflare DNS追加・GitHub Pagesカスタムドメイン変更・HTTPS発行・OAuth承認済みJavaScript生成元追加・Drive連携/読込み/再保存・内部識別子無変更・テスト/コミット/push）完了。公式サイト側は実装・pushまで完了（最新コミット`cc112ac`）だがCloudflare Pages本番反映は未確認のまま。**M6の一部を2026-08-01に実施**：①OAuthクライアントの承認済みJavaScript生成元から`https://spotlog.num-ish.com`を削除、②Cloudflare DNSの`spotlog.num-ish.com`のCNAMEレコードを削除、③`spots.num-ish.com`でGoogle Drive連携・読込み・保存を再確認（成功） |
| 次に行う作業 | ①Google OAuth同意画面のアプリ名・ホームページURL・プライバシーポリシーURL・利用規約URLを新ブランド・新URLへ更新するかの判断・実施（M5残項目、意図的に保留中）、②公式サイト側のCloudflare Pages本番反映状況をユーザーに確認、③本書・SPEC.mdの今回の更新をコミット・push |
| 作業停止理由 | 旧URLのDNS・OAuth生成元は削除済み、コード内の旧名称`Spotlog`残存調査も完了（2026-08-10、該当なし）のため、その点での停止要因はなし。公式サイト側のCloudflare Pages本番反映状況は未確認のまま（前回記録したCloudflare API障害が復旧しているかは未確認。下記「現在保留中の外部要因」参照） |
| 削除・変更してはいけない項目 | 下記「削除・変更してはいけない項目」参照（2026-08-01付記あり） |
| 最終更新日 | 2026-08-10 |
| 最終更新時のコミットSHA | 本書・SPEC.mdの今回の更新（M6残項目消化：コード内旧名称残存調査、SPEC.md 1.1節の記載修正）はこの時点でまだ未コミット。直近コミットは`f89d85c`（一覧の編集アイコンを全行に表示、ページ切り替え時のスクロール不具合を修正） |
| 次回作業開始時の確認事項 | 下記「次回作業開始時の確認事項」参照 |

### 現在保留中の外部要因（Cloudflare障害、2026-07-31）

**アプリ側（このリポジトリ）はM5まで完了済み。旧URL（`spotlog.num-ish.com`）のDNS・OAuth生成元も2026-08-01に削除済み（詳細は下記「2026-08-01付記」参照）。**以下は公式サイト（NUM-ISHブランドサイト、他方のリポジトリ）側の状況記録。

**公式サイト側の実装状況（完了済み）**：
- 表記変更：「Spotlog」→「スポット帖」
- アプリURL変更：`https://spots.num-ish.com`
- 紹介ページを `/projects/spotlog` → `/projects/spots` へ変更
- `/projects/spotlog` → `/projects/spots` の301リダイレクトを追加
- プライバシー関連の表記変更
- テスト・ビルド成功
- GitHub（`main`ブランチ）へのコミット・push完了、最新コミット `cc112ac`（GitHub上で最新コード・push済みを確認済み）

**保留中の事象**：Cloudflare Pagesが上記の最新コミットを自動デプロイしておらず、`num-ish.com`の本番表示が旧内容のまま。

**Cloudflare公式ステータス上のインシデント（2026-07-31 20:51頃〜）**：
- インシデント名：Cloudflare API Availability Reduced Availability
- 影響範囲：API、Dashboard、Analytics
- ステータス：調査継続中
- 影響内容：Cloudflare APIへのリクエストが失敗する、またはエラーが表示される可能性がある
- 既存のCDN配信・キャッシュ済みサイトの表示自体には影響しない

**実機で確認した症状**：
- GitHubへのpushは成功しているが、Cloudflare Pagesに新しいデプロイが作成されない
- デプロイフック実行時に522・523・525エラーが発生
- Cloudflare GitHub Appのリポジトリアクセスには`num-ish-site`が正しく設定されている
- Cloudflare Pagesの本番ブランチは`main`、自動デプロイは有効
- GitHub側の設定・権限不足ではなく、Cloudflare障害の影響である可能性が高いと判断

**復旧までの方針（ユーザー指示）**：
- 復旧前にCloudflare連携の切断、Pagesプロジェクトの再作成、対処目的の追加の空コミット等は行わない
- Cloudflare復旧後、デプロイフックの再実行または追加pushで再デプロイを確認する
- `num-ish.com`の新表示（スポット帖・新URL）を確認するまで、Google OAuth同意画面のブランド変更・再申請は行わない
- 旧`spotlog.num-ish.com`のDNSレコードは**2026-08-01にユーザーの判断で削除済み**（この方針メモは2026-07-31時点のものであり、この点は下記「2026-08-01付記」の内容で更新されている）

### 削除・変更してはいけない項目（現時点・全フェーズ共通）

- Google Drive上の保存ファイル名 `g-map-dashboard-backup.json`：名称変更を理由に変更しない（SPEC.md 1.1.9）。M4での再保存確認時も同ファイル名のまま動作していることを確認済み
- LocalStorageキー `localCacheEnabled`：変更しない
- IndexedDBのデータベース名 `g-map-dashboard-cache`：変更しない
- Service Workerのキャッシュ名 `spotlog-shell-v1`：変更しない（変更する場合は移行設計が必要、SPEC.md 1.1.9）
- 現行のOAuthクライアント設定（アプリ名・リダイレクトURI・ホームページURL・プライバシーポリシーURL）：アプリ名・ホームページURL・プライバシーポリシーURL・利用規約URLの変更はまだ行っていない（M5残項目、num-ish.comの新表示確認まで意図的に保留中）
- エクスポート・インポート形式（CSV/JSON）、ユーザーIDとの紐付け：変更しない
- Cloudflareとの連携（GitHub App連携、Pagesプロジェクト自体）：障害復旧前に切断・再作成しない（上記「現在保留中の外部要因」参照）
- Google OAuth同意画面のアプリ名・URL群：num-ish.comの新表示確認まで変更しない

### 2026-08-01付記：旧URL関連の削除を実施

以下は従来「M6での削除判断まで維持する」としていた項目だが、ユーザーの判断により2026-08-01に削除を実施した。

- **Cloudflare DNS**：`spotlog.num-ish.com`のCNAMEレコードを削除
- **OAuthクライアント**：承認済みJavaScript生成元から`https://spotlog.num-ish.com`を削除（`https://spots.num-ish.com`のみが残る）
- **削除後の動作確認**：`https://spots.num-ish.com`でGoogle Drive連携・データ読込み・データ保存を再確認し、いずれも成功

上記2点は削除済みのため、以後のセッションでは「維持すべき項目」から外れている。SPEC.md 1.1.8節（公開URLの方針）の「新URLへの移行と動作確認が完了するまでは削除しない」という条件は、この時点で満たされたと判断できる。

### 次回作業開始時の確認事項

1. `git fetch origin` の上で `git log -3` / `git status` で、このリポジトリの最新コミットと作業ツリーの状態を確認する。**GitHub PagesのCustom domain設定をGitHub側UIで変更すると、GitHubが`CNAME`ファイルを自動更新するコミットをリモートに直接追加することがある**（2026-07-31実績：コミット`94c76c1`「Update CNAME」）ため、ローカルが古い場合は先に取り込む（fast-forwardで問題ないか確認の上マージ）
2. `SPEC.md` の1.1節（特に1.1.7〜1.1.10）を読み、決定事項に変更がないか確認する
3. 本書冒頭の「進捗状況」表を確認し、記載の「現在フェーズ」「最終更新時のコミットSHA」が実際のリポジトリ状態と一致しているか確認する（ズレていれば先に本書を実態に合わせて修正する）
4. **Cloudflareのステータス（`Cloudflare API Availability Reduced Availability`インシデント）が復旧しているかユーザーに確認する**。復旧していれば、公式サイト側でデプロイフックまたは追加pushにより`num-ish.com`の本番反映を再確認してもらう（「現在保留中の外部要因」節参照）
5. Google Cloud Console（Google Auth Platform）のOAuth同意画面・対象・データアクセスの設定が、本書M0/M1に記録した内容から変わっていないか確認する
6. Google Driveのバックアップファイル（`g-map-dashboard-backup.json`）の最終更新日時が古すぎないか確認する（必要なら移行作業前に最新化する）
7. 他方のリポジトリ（NUM-ISHブランドサイト）側の進捗をユーザーに確認する（M3・M5・M6は他方のリポジトリの完了状況に依存する）

---

## 全体像・リポジトリ構成

- **このリポジトリ（`google-maps-dashboard`）**：スポット帖のアプリ本体一式
  （`index.html` / `app.js` / `style.css` / `manifest.json` / `sw.js` /
  `privacy.html` / `terms.html` / `help.html` / `CNAME` 等）。GitHub Pages経由で
  現在 `spotlog.num-ish.com` に公開。`privacy.html`/`terms.html`/`help.html`は
  Google Cloud Consoleに個別URLとして登録済みのため、このリポジトリの担当範囲に含む
- **他方のリポジトリ（NUM-ISHブランドサイト、候補名 `num-ish-site` / `num-ish-web`）**：
  `num-ish.com` ルートドメインのハブサイト。Codexで構築中・このリポジトリとは
  別ツール・別セッションで管理。スポット帖を含む複数の個人アプリ・ブログをまとめる
  構想。現状 `num-ish.com` ルートは中身がなく、Cloudflareページルールで
  `spotlog.num-ish.com` へ暫定的に301リダイレクトしているのみ
- 本書はこのリポジトリ側から見た移行手順書であり、他方のリポジトリの詳細な
  作業内容・進捗はそちらのリポジトリ側のドキュメントで管理される想定。
  本書には依存関係と完了確認のみを記載する

---

## フェーズ一覧

### M0：現在地の確定 【完了】

- **担当リポジトリ**：共通（事実確認であり、記録先はこのリポジトリのSPEC.md/本書）
- **前提条件**：なし
- **作業内容**：
  - Google OAuthブランド確認の承認状況の確認
  - OAuth同意画面の公開ステータス・使用スコープの確認
  - Google Driveへの最新データ保存・JSONバックアップ取得状況の確認
  - 現在の名称・URL・想定利用者範囲の確認
- **完了条件**：上記すべてが確認され、SPEC.md（1.1節・5節）に記録されている
- **チェックボックス**：
  - [x] Google OAuthブランド確認：承認済み（2026-07-30、Cloud Console実機確認、SPEC.md 5節参照）
  - [x] OAuth同意画面の公開ステータスが「本番環境」であることを確認
  - [x] 使用スコープが `drive.file` のみで、Cloud Console上「非機密」スコープに分類されていることを確認
  - [x] Google Driveへの最新データ保存が完了していることを確認
  - [x] JSONバックアップを取得済みであることを確認
  - [x] 現時点で外部利用者を想定していないことを確認（ユーザーとの合意事項）
- **注意事項**：このフェーズでは実装・設定・公開環境への変更は一切行っていない（事実確認と文書化のみ）
- **次に作業するリポジトリ**：このリポジトリ（M1へ）

---

### M1：変更前の基準点作成

- **担当リポジトリ**：このリポジトリ
- **前提条件**：M0完了
- **作業内容**：
  - 本書および関連するSPEC.mdの更新作業を完了させる
  - `git status` をクリーンな状態にする（コミット・push）
  - 現在のOAuthクライアント設定（承認済みJavaScript生成元、リダイレクトURI、
    ホームページURL、プライバシーポリシーURL、利用規約URL）を本書に記録する
  - 現在のGitHub Pagesカスタムドメイン設定（`CNAME`ファイルの中身：
    `spotlog.num-ish.com`）を記録する
  - 現在のCloudflare DNSレコード（`spotlog`サブドメインのCNAME等）を記録する
- **完了条件**：
  - working tree clean（`git status` に変更なし）
  - 上記の設定値がすべて本書に記録されている
- **チェックボックス**：
  - [x] 本書（`docs/RENAME_MIGRATION.md`）の更新をコミット・push（2026-07-31、コミットメッセージ「rename Spotlog to スポット帖」。SPEC.mdはこの回では変更なし）
  - [x] `git status` でworking tree cleanを確認（トラッキング対象ファイルはクリーン。`.claude/`は未追跡のままコミット対象外として意図的に残置）
  - [x] OAuthクライアントの現在設定をCloud Consoleで確認し本書に追記（2026-07-31、ユーザーより提示）
  - [x] GitHub Pagesの現在のカスタムドメイン設定（`CNAME`の中身）を確認・記録（`spotlog.num-ish.com`、変更なし）
  - [ ] Cloudflareの現在のDNSレコードを確認・記録（未提示、引き続き必要）
- **現在の設定値（2026-07-31時点）**：
  - OAuthクライアント名：`Spotlog`
  - 承認済みJavaScript生成元：`https://spotlog.num-ish.com`
  - 承認済みリダイレクトURI：登録なし
  - ホームページURL・プライバシーポリシーURL・利用規約URL：個別の値は未提示（プライバシーポリシーURLは過去記録より `https://spotlog.num-ish.com/privacy.html` の可能性が高いが要再確認）
  - 新URL公開後、承認済みJavaScript生成元に `https://spots.num-ish.com` を追加予定（M4で実施、今回は追加していない）
  - 旧URL（`spotlog.num-ish.com`）は新URLでの動作確認完了まで削除しない方針を再確認
  - Cloudflare DNSレコード：未提示（次回セッションで確認が必要）
- **注意事項**：このフェーズでも設定変更は行わない。あくまで「変更前の状態のスナップショット」を残す段階
- **次に作業するリポジトリ**：このリポジトリ（M2へ）

---

### M2：アプリ側の名称変更準備 → 【表示名称変更分は実施済み・コミット済み】

- **担当リポジトリ**：このリポジトリ
- **前提条件**：M1完了
- **2026-07-31付記**：当初の計画では本フェーズは「洗い出しと計画のみ」（本番反映はM5）
  としていたが、ユーザーの明示的な指示により、表示名称・title・meta・manifest・
  案内文の実変更をこのフェーズで先行実施した。コミットメッセージ「rename Spotlog to
  スポット帖」でコミット・push済み。Google Cloud Console（OAuth同意画面・OAuthクライアント）
  ・旧URL削除は引き続き対象外（ユーザーが別途実施）
- **作業内容**：SPEC.md 1.1.7節（変更対象候補）・1.1.9節（データ互換性）を参照し、
  実際の書き換え箇所の洗い出しと影響確認を行う
  - アプリ内表示名称（ヘッダー、`<title>`、meta情報、OGP）の変更箇所洗い出し
  - `manifest.json`（`name`/`short_name`）、アイコン内の文字・ロゴの変更要否確認
  - 新URL（`spots.num-ish.com`候補）対応：`app.js`/`index.html`/`sw.js`内に
    `spotlog.num-ish.com`のハードコードがないか洗い出し
  - データ互換性（SPEC.md 1.1.9節）に該当する項目（LocalStorageキー、IndexedDB
    データベース名・ストア名、Google Drive保存ファイル名、エクスポート/インポート
    形式、キャッシュ名）は変更しないことを再確認する
  - README・テスト内の旧名称箇所の洗い出し
- **完了条件**：SPEC.md 1.1.7節の変更対象候補について、それぞれ「変更する／しない」の
  判断と変更内容の草案が一覧化されている
- **チェックボックス**：
  - [x] `index.html`内の表示名称・title・meta・OGP箇所の洗い出し（洗い出し済み・スポット帖へ変更済み）
  - [x] `manifest.json`の`name`/`short_name`の変更要否確認（変更要と判断、変更済み）
  - [x] アイコン・ロゴ内の文字（該当あれば）の確認（PNGアイコンは地図ピンの図形のみで文字なし、変更不要と確認）
  - [x] `app.js`/`sw.js`/`index.html`内の`spotlog.num-ish.com`ハードコード箇所の洗い出し（該当なしを確認。リンクは相対パス、`mailto:contact@num-ish.com`のみでサブドメイン依存なし）
  - [x] SPEC.md 1.1.9節の「安易に変更しない」項目に該当するものが無変更であることの再確認（`localCacheEnabled`・`g-map-dashboard-cache`・`g-map-dashboard-backup.json`・`spotlog-shell-v1`（Service Worker `CACHE_NAME`）はすべて無変更）
  - [x] README・テスト内の旧名称箇所の洗い出し（READMEファイルは存在しない。`tests/`配下・`app.js`にSpotlog表記なしを確認）
- **実施した変更（2026-07-31、コミット・push済み。コミットメッセージ「rename Spotlog to スポット帖」）**：
  - `manifest.json`：`name`/`short_name`を「スポット帖」に変更（`description`は元々製品名を含まず変更なし）
  - `index.html`：`<title>`、`application-name`、`description`、`og:site_name`、
    `og:title`、`apple-mobile-web-app-title`、`<h1>`、hero説明文（日本語・英語）、
    詳細説明セクション（日本語見出し・本文、英語見出し・本文）をすべて「スポット帖」表記へ変更
  - `help.html`：`<title>`、Googleアカウント連携解除の案内文中の名称表記を変更
  - `terms.html`：`<title>`、「1. Spotlogの概要」見出し・本文、運営者表記、利用条件本文を変更
  - `privacy.html`：`<title>`、冒頭説明、運営者表記、連携解除の案内文中の名称表記を変更
  - `style.css`：コメント内の製品名表記のみ変更（スタイル定義・セレクタ名は無変更）
  - `sw.js`：ファイル冒頭のコメント内の製品名表記のみ変更。**`CACHE_NAME = "spotlog-shell-v1"`は内部識別子のため無変更**
  - **変更していないもの**：`CNAME`（`spotlog.num-ish.com`のまま）、`localStorage`キー・IndexedDB名・
    Google Drive保存ファイル名・Service Workerキャッシュ名などの内部識別子、
    Google Cloud Console（OAuth同意画面・OAuthクライアント）、Cloudflare設定
  - テスト：`npm test`（`node --test tests/*.test.js`）151件全件成功（ロジック変更なしのため回帰なし）
  - `manifest.json`のJSON妥当性を`node -e "JSON.parse(...)"`で確認済み
- **既知の一時的な不整合（M5で解消予定）**：
  - Google Cloud ConsoleのOAuthクライアント名は現在も`Spotlog`のまま（ユーザー確認、
    2026-07-31）。そのため、Googleアカウントの「サードパーティ製のアプリとサービスとの
    接続」画面には引き続き`Spotlog`と表示される可能性が高いが、`help.html`/`privacy.html`
    の案内文は先行して「スポット帖」表記に変更済み。新URLでの動作確認完了後、M5で
    OAuth同意画面のアプリ名を実際に変更するまでは、この文言と実際の画面表示が一致しない
  - `spotlog.num-ish.com`（CNAME・OAuth承認済みJavaScript生成元）は稼働中のまま。
    アプリ内表示は「スポット帖」だが公開URLはまだ`spotlog`を含む
- **注意事項**：
  - 1.1.9節に該当する項目を変更する必要が生じた場合は、先に「既存データの検出／
    新形式への移行／移行失敗時の復旧／後方互換性／バックアップ方法／テスト項目」の
    設計を用意すること（今回は該当項目の変更なし）
- **次に作業するリポジトリ**：このリポジトリ（コミット・push済み）。
  他方のリポジトリ（NUM-ISHブランドサイト）側の対応状況をユーザーに確認しつつ、
  M1残項目（Cloudflare DNS記録）とM4の未確認項目へ進む

---

### M3：公式サイト側の変更準備

- **担当リポジトリ**：主に他方のリポジトリ（NUM-ISHブランドサイト）。ただし
  `privacy.html` / `terms.html` / `help.html` はこのリポジトリ内に存在し、
  Google Cloud Consoleにも個別URLとして登録済みのため、その範囲のみこのリポジトリが担当する
- **前提条件**：M2完了（アプリ側の変更対象洗い出しが済んでいること）
- **作業内容（このリポジトリの担当分のみ）**：
  - `privacy.html` / `terms.html` / `help.html` 内の名称表記（`Spotlog`→
    `スポット帖`）・URL表記（`spotlog.num-ish.com`→新URL）の変更箇所洗い出し
  - これらのURL自体（例：`https://spotlog.num-ish.com/privacy.html`）は
    Google Cloud Consoleに登録済みのため、変更する場合はConsole側の設定変更と
    セットでM5に計画として反映する
- **依存事項（他方のリポジトリの担当、詳細はそちらのリポジトリ側で管理）**：
  - NUM-ISHブランドサイトにおけるスポット帖の紹介文・リンクの新名称・新URLへの更新
  - `num-ish.com`ルートの暫定リダイレクト（Cloudflareページルール、現状
    `spotlog.num-ish.com`へ301）の要否見直し（NUM-ISHサイト公開後は不要になる想定）
  - OAuth関連の説明文言（ハブサイト側に記載がある場合）の更新
- **完了条件**：このリポジトリ担当分（`privacy.html`/`terms.html`/`help.html`）の
  変更箇所洗い出しが完了し、かつ他方のリポジトリ側の対応状況をユーザーに確認できている
- **チェックボックス**：
  - [ ] `privacy.html`/`terms.html`/`help.html`の名称・URL変更箇所の洗い出し（このリポジトリ）
  - [ ] Google Cloud Console登録済みのプライバシーポリシー/利用規約URLの変更計画をM5に反映
  - [ ] 他方のリポジトリ（NUM-ISHブランドサイト）側の対応状況をユーザーに確認
- **注意事項**：他方のリポジトリの作業内容・進捗はそちらのセッション・ドキュメントで
  管理されるため、本書では依存関係と完了確認のみを記載し、詳細な作業手順は記載しない
- **次に作業するリポジトリ**：両リポジトリ（M4へ、新URLの公開・動作確認）

---

### M4：新URLの公開・動作確認 【外部設定・主要動作確認 完了、一部項目は未確認】

- **担当リポジトリ**：このリポジトリ（DNS自体はCloudflare側の外部設定だが、
  対象となるデプロイ先はこのリポジトリのGitHub Pages）
- **前提条件**：M2・M3完了（変更内容が確定していること）。このフェーズは新URLを
  **旧URLと並行稼働**させて検証する段階であり、`spotlog.num-ish.com`はまだ削除しない
- **作業内容**：
  - Cloudflareに新サブドメイン（`spots.num-ish.com`想定）のDNSレコードを追加
  - GitHub Pagesのカスタムドメイン設定に新URLを追加（並行運用 or 切替方式を検討）
  - Google Cloud ConsoleのOAuthクライアントに新URLを承認済みJavaScript生成元として
    追加（旧URLは残したまま）
  - 新URLでの動作確認（SPEC.md 1.1.10節の確認項目に準拠）
- **完了条件**：新URLでSPEC.md 1.1.10節の確認項目がすべてクリアである
- **2026-07-31 ユーザー確認結果**：
  - 公開URL `https://spots.num-ish.com` で稼働中、HTTPS有効
  - Google OAuthの承認済みJavaScript生成元に新URLを追加済み
  - Google Drive再連携：成功
  - Driveから既存データの読み込み：成功（総スポット970件を確認）
  - 都道府県・Google連動カテゴリー・マイカテゴリーの表示を確認
  - 新URLからGoogle Driveへの再保存：成功
  - 新URL側の端末保存（ローカルキャッシュ）：有効
  - 旧URL（`spotlog.num-ish.com`）のDNSはユーザーの判断で維持中（削除していない）
- **チェックボックス**：
  - [x] CloudflareのDNSレコード追加（`spots.num-ish.com` CNAME → `numacchi14-cpu.github.io`、DNSのみ、ユーザーが別途実施、2026-07-31）
  - [x] GitHub PagesカスタムドメインをGitHub Pages側で`spots.num-ish.com`へ変更（ユーザーが別途実施。この変更に伴いGitHubが本リポジトリの`CNAME`ファイルを自動更新するコミット`94c76c1`「Update CNAME」を作成、2026-07-31にこのリポジトリへ取り込み済み。DNS check successful・HTTPS証明書発行・Enforce HTTPS有効化・新URLでのHTTPS表示をユーザーが確認済み）
  - [x] OAuthクライアントの承認済みJavaScript生成元に新URLを追加
  - [x] 新URLでアプリが正常に表示される（1.1.10節）
  - [ ] PCとスマートフォンで主要画面が正常に表示される（1.1.10節）※スマートフォンでの確認は未報告
  - [x] Googleログインが正常に動作する（1.1.10節）
  - [x] Google Driveへの保存・読込みが正常に動作する（1.1.10節）
  - [ ] Google Takeoutデータを取り込める（1.1.10節）※未報告
  - [ ] 手入力データを登録・編集できる（1.1.10節）※未報告
  - [ ] 行った場所・行きたい場所を管理できる（1.1.10節）※未報告
  - [x] Googleカテゴリーと独自カテゴリーを管理できる（1.1.10節）※表示確認済み、編集操作は未報告
  - [x] 既存データを引き続き読み込める（1.1.10節）（970件確認）
  - [ ] PWAとしてインストールできる（1.1.10節）※未報告
  - [ ] Service Workerやキャッシュに旧名称・旧URLの問題がない（1.1.10節）※未報告
- **注意事項**：
  - この段階では旧URL（`spotlog.num-ish.com`）を削除・リダイレクトさせない。
    新旧並行稼働のまま検証する（ユーザー確認済み、旧URLのDNSは維持中）
  - OAuthクライアントへの生成元「追加」のみであれば、スコープ変更を伴わない限り
    再審査は不要な想定だが、Cloud Console側に警告が出ないか念のため確認する
  - 上記チェックボックス未確認項目（スマートフォン表示、Takeout取込み、手入力編集、
    行った/行きたい管理、PWAインストール、Service Worker/キャッシュ）は、M5（旧URL削除の
    判断）に進む前に確認しておくことが望ましい
- **次に作業するリポジトリ**：このリポジトリ。未確認項目の確認、および
  他方のリポジトリ側の対応状況次第でM5本体（SPEC.md表記一括変更・OAuth同意画面変更）へ

---

### M5：ブランドの一括切替 【アプリ側：完了 ／ 公式サイト側：実装・push完了、Cloudflare本番反映待ち】

- **担当リポジトリ**：両リポジトリ（このリポジトリはアプリ本体・GitHub Pages・
  OAuthクライアント設定、他方のリポジトリはNUM-ISHブランドサイトのリンク・文言）
- **前提条件**：M4完了（新URLでの動作確認が完了していること）
- **作業内容（このリポジトリの担当分）**：
  - SPEC.md 1.1.7節の変更対象候補をすべて`スポット帖`表記に一括変更
  - `CNAME`ファイルを新URL（`spots.num-ish.com`想定）に更新
  - Google Cloud ConsoleのOAuth同意画面のアプリ名を`スポット帖`に変更、
    ホームページURL・プライバシーポリシーURL・利用規約URLを新URLへ更新
  - 上記のOAuth同意画面変更に伴い、ブランド確認の再申請が必要か確認し、必要なら申請
- **依存事項（他方のリポジトリ）**：
  - NUM-ISHブランドサイト側のスポット帖への表記・リンクを新名称・新URLに更新
- **完了条件**：アプリ・OAuth同意画面の名称・URL表記が新ブランドに統一されており、
  他方のリポジトリ側の更新完了もユーザーに確認できている。ブランド再確認が
  必要な場合は申請済みである
- **2026-07-31 状況**：
  - **アプリ側（このリポジトリ）**：正式名称を「Spotlog」から「スポット帖」へ変更、
    新URL `https://spots.num-ish.com` を公開、Cloudflare DNS追加・GitHub Pages
    カスタムドメイン変更・HTTPS証明書発行・Enforce HTTPS有効化・OAuth承認済み
    JavaScript生成元への新URL追加・Google Drive連携（読込み970件・再保存・端末保存）
    確認・テスト/コミット/push（`19a0b80`）まで完了。Google Drive保存ファイル名・
    IndexedDB・LocalStorage等の内部識別子は無変更。旧`spotlog.num-ish.com`のDNSは維持中
  - **公式サイト側（他方のリポジトリ）**：表記変更・URL変更（`/projects/spotlog`→
    `/projects/spots`、301リダイレクト追加）・プライバシー表記変更・テスト/ビルド成功・
    `main`ブランチへのコミット・push完了（最新コミット`cc112ac`）。ただし**Cloudflare
    Pagesが最新コミットを自動デプロイしておらず、本番表示は旧内容のまま**（詳細は
    上記「現在保留中の外部要因」参照）
- **チェックボックス**：
  - [x] SPEC.md 1.1.7節の変更対象候補のうち、アプリ内表示名称（title/meta/OGP/
        manifest/案内文）は2026-07-31にM2で先行実施済み
  - [x] `CNAME`ファイルを新URLに更新（2026-07-31、GitHub Pagesのカスタムドメイン
        設定変更に伴うGitHubの自動コミットで先行実施済み。M5として意図的に
        行った変更ではないが、結果として本チェック項目は充足している）
  - [x] Cloudflare DNS・GitHub Pagesカスタムドメイン・HTTPS・OAuth承認済み
        JavaScript生成元など、アプリ側の外部設定一式（2026-07-31完了）
  - [ ] OAuth同意画面のアプリ名・ホームページURL・プライバシーポリシーURL・
        利用規約URLを更新（**num-ish.comの新表示を確認するまで意図的に保留**）
  - [ ] 必要であればブランド確認を再申請
  - [x] 他方のリポジトリ側の名称・リンク更新の**実装・push**完了を確認（済み、`cc112ac`）
  - [ ] 他方のリポジトリ側の**本番反映**（Cloudflare Pagesデプロイ）を確認（**Cloudflare障害により保留中**）
- **注意事項**：
  - OAuth同意画面のアプリ名等の変更は、新しい検証リクエストが必要になる場合が
    ある（Google側の通知メールの注意書き：「同意画面の設定を変更した場合は
    新しい検証リクエストの提出が必要」）ため、変更前に影響範囲を確認する
  - SPEC.md 1.1.9節のデータ互換性方針（LocalStorage/IndexedDB/Drive保存ファイル名
    等は変更しない）は本フェーズでも維持する
  - Cloudflare障害の復旧前に、連携切断・Pagesプロジェクト再作成・対処目的の追加の
    空コミット等は行わない（「現在保留中の外部要因」節参照）
- **次に作業するリポジトリ**：他方のリポジトリ（Cloudflare復旧後、デプロイフックまたは
  追加pushで本番反映を再確認）。反映確認後、このリポジトリ側でOAuth同意画面の
  ブランド変更着手を判断し、M6（承認待ち・最終処理）へ

---

### M6：承認後の最終処理 【一部実施：旧URL削除・新URL再確認 完了、残項目あり】

- **担当リポジトリ**：このリポジトリ（+他方のリポジトリ側の最終確認）
- **前提条件**：M5完了。ブランド再確認が必要だった場合はその承認を受領していること
  - **注記**：M5のうち「OAuth同意画面のアプリ名・ホームページURL・プライバシーポリシーURL・
    利用規約URLの更新」「他方のリポジトリの本番反映確認」は未完了のままだが、
    ユーザーの判断により本フェーズの一部（旧URLのDNS・OAuth生成元の削除、新URLでの
    再確認）を2026-08-01に先行実施した
- **作業内容**：
  - 新ブランド（アプリ名・URL）での動作を再確認
  - コード・設定・文書内に旧名称（`Spotlog`）・旧URL（`spotlog.num-ish.com`）への
    不要な参照が残っていないか調査（SPEC.md 1.1.10節の該当項目）
  - 問題がなければ`spotlog.num-ish.com`を削除（またはリダイレクト維持を判断、
    SPEC.md 1.1.8節参照）
  - 移行完了を本書・SPEC.mdに記録
- **完了条件**：SPEC.md 1.1.10節の確認項目がすべて完了し、旧URLの扱い
  （削除／転送維持）が決定・実施されている
- **2026-08-01 実施内容（ユーザー報告）**：
  - OAuthクライアントの承認済みJavaScript生成元から`https://spotlog.num-ish.com`を削除
  - Cloudflare DNSの`spotlog.num-ish.com`のCNAMEレコードを削除
  - `https://spots.num-ish.com`でGoogle Drive連携・データ読込み・データ保存を再確認し、
    いずれも成功したことを確認（削除後に新URL側の主要機能が問題なく動作することの裏付け）
- **チェックボックス**：
  - [ ] 新ブランドでのブランド確認承認を確認（再申請した場合）※今回はOAuth同意画面の
        アプリ名・URL変更自体を行っていないため再申請は発生していない
  - [x] コード、設定、文書内に不要な`Spotlog`表記が残っていないか調査（1.1.10節）：
        2026-08-10、`index.html`/`app.js`/`style.css`/`manifest.json`/`sw.js`/
        `privacy.html`/`terms.html`/`help.html`（拡張子`.html`/`.js`/`.json`/`.css`
        全体）を`Spotlog`でgrepし該当なしを確認。リポジトリ全体では本書（進捗記録として
        意図的に残す旧称）とSPEC.md（本更新で「スポット帖」表記へ修正済み）のみに残存
  - [x] `spotlog.num-ish.com`を削除しても問題がないことを確認（1.1.10節）：削除後に
        `spots.num-ish.com`でDrive連携・読込み・保存が成功することを確認（2026-08-01）
  - [x] 削除または転送維持を決定・実施：削除を実施（Cloudflare DNSのCNAME削除、
        OAuthクライアントの承認済みJavaScript生成元からの削除、2026-08-01）
  - [x] 移行完了を本書に記録（本更新）。SPEC.mdへの反映も2026-08-10に実施済み（1.1節を
        「現在の名称はスポット帖」「表示名変更は実施済み、OAuth同意画面のみ未完了」へ修正）
- **注意事項**：
  - 旧URLの削除は元に戻しにくい操作のため、実施前に必ずユーザーの明示的な承認を得ること
    （今回はユーザー自身が実施・報告した内容を記録）
  - 上記チェックボックスのうち、OAuth同意画面のアプリ名・URL群の更新（M5残項目）は
    まだ未実施（意図的に保留中、着手判断は別途行う）
- **次に作業するリポジトリ**：このリポジトリ（残項目の消化、SPEC.mdへの反映）。
  公式サイト側のCloudflare Pages本番反映状況次第で他方のリポジトリ側の最終確認も行う

---

<!-- 作業を進めるたびに、本書冒頭の「進捗状況」表とチェックボックスを更新すること -->
