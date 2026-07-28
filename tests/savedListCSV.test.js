// Stub the browser globals app.js touches at load time so it can run under Node.
global.document = { addEventListener() {} };

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { isSavedListCSV, parseSavedListCSV } = require("../app.js");

test("isSavedListCSV: 「タイトル,メモ,URL,タグ,コメント」ヘッダーのGoogleマップ カスタムリストCSVを検出する", () => {
  const rows = [["タイトル", "メモ", "URL", "タグ", "コメント"]];
  assert.equal(isSavedListCSV(rows), true);
});

test("isSavedListCSV: 住所・緯度・経度の列があるCSVは（タイトル列があっても）誤検出しない", () => {
  const rows = [["タイトル", "住所", "URL"]];
  assert.equal(isSavedListCSV(rows), false);
  const rowsWithLatLng = [["タイトル", "URL", "緯度", "経度"]];
  assert.equal(isSavedListCSV(rowsWithLatLng), false);
});

test("isSavedListCSV: タイトル列またはURL列が無ければfalse", () => {
  assert.equal(isSavedListCSV([["スポット名", "URL"]]), false);
  assert.equal(isSavedListCSV([["タイトル", "メモ"]]), false);
  assert.equal(isSavedListCSV([]), false);
});

test("parseSavedListCSV: タイトル/URL/メモ/タグ/コメントをそれぞれ対応するフィールドへマッピングする", () => {
  const rows = [
    ["タイトル", "メモ", "URL", "タグ", "コメント"],
    ["わさび", "", "https://www.google.com/maps/place/わさび/data=!4m2!3m1!1s0x1:0x2", "気になる", "友達がおすすめしてた"]
  ];
  const parsed = parseSavedListCSV(rows, "行ってみたい");

  assert.equal(parsed.length, 1);
  const p = parsed[0];
  assert.equal(p.name, "わさび");
  assert.equal(p.url, "https://www.google.com/maps/place/わさび/data=!4m2!3m1!1s0x1:0x2");
  assert.equal(p.wishlistListName, "行ってみたい");
  assert.equal(p.wishlistTags, "気になる");
  assert.equal(p.wishlistComment, "友達がおすすめしてた");
  assert.equal(p.wishlistMemo, "");
  assert.equal(p.source, "行きたいリスト");
  assert.equal(p.prefecture, "その他・海外");
  assert.equal(p.address, "");
  assert.equal(p.lat, null);
  assert.equal(p.lng, null);
  assert.equal(p.rating, null);
  assert.equal(p.comment, "");
});

test("parseSavedListCSV: 名前・URLがどちらも空の行は取り込まない", () => {
  const rows = [
    ["タイトル", "メモ", "URL", "タグ", "コメント"],
    ["", "", "", "", ""]
  ];
  const parsed = parseSavedListCSV(rows, "行ってみたい");
  assert.equal(parsed.length, 0);
});

test("parseSavedListCSV: ヘッダーのみ（データ行なし）は空配列を返す", () => {
  const rows = [["タイトル", "メモ", "URL", "タグ", "コメント"]];
  assert.deepEqual(parseSavedListCSV(rows, "行ってみたい"), []);
});
