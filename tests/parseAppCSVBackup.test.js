// Stub the browser globals app.js touches at load time so it can run under Node.
global.document = { addEventListener() {} };

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseCSVRows, isAppCSVBackup, parseAppCSVBackup } = require("../app.js");

const HEADER = "スポット名,都道府県,マイ都道府県,カテゴリー,マイカテゴリー,住所,評価,レビュー・メモ,初投稿日,最終更新日,緯度,経度,Googleマップリンク,データソース";

test("データソース列がある＝このアプリ自身のCSVフルエクスポートとして検出する", () => {
  const rows = parseCSVRows(HEADER + "\nテスト,東京都,,観光・レジャー,,東京都渋谷区,4,コメント,2024/01/01,2024/01/01,35.6,139.7,https://maps.example,手動入力");
  assert.equal(isAppCSVBackup(rows), true);
});

test("通常のGoogle TakeoutスタイルCSV（データソース列なし）はフルバックアップとして検出しない", () => {
  const rows = parseCSVRows("スポット名,住所,評価,コメント\nテスト,東京都渋谷区,4,コメント");
  assert.equal(isAppCSVBackup(rows), false);
});

test("再エクスポートしたCSVを読み込んでも「データソース」列の値（手動入力等）をそのまま復元する（回帰: 編集アイコンが消える不具合）", () => {
  const rows = parseCSVRows(HEADER + "\n手動追加スポット,東京都,,その他,,東京都渋谷区,,テストコメント,,,35.6586,139.7454,,手動入力");
  const parsed = parseAppCSVBackup(rows);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].source, "手動入力");
  assert.equal(parsed[0].name, "手動追加スポット");
  assert.equal(parsed[0].lat, 35.6586);
});

test("マイ都道府県／マイカテゴリー（表示名）を再インポート時にキーへ変換して復元する", () => {
  const rows = parseCSVRows(HEADER + "\nラーメン店,福岡県,,グルメ（ラーメン・麺類）,宿泊施設,福岡県福岡市,5,,,,,,,CSVインポート");
  const parsed = parseAppCSVBackup(rows);
  assert.equal(parsed[0].category, "gourmet_ramen");
  assert.equal(parsed[0].myCategory, "lodging");
});

test("データソース列が空のレコードは既定でCSVインポート扱いにする", () => {
  const rows = parseCSVRows(HEADER + "\n通常データ,東京都,,その他,,,,,,,,,,");
  const parsed = parseAppCSVBackup(rows);
  assert.equal(parsed[0].source, "CSVインポート");
});
