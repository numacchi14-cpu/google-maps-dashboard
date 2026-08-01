// Stub the browser globals app.js touches at load time so it can run under Node.
global.document = { addEventListener() {} };

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildManualPlaceFields, updateManualPlaceFields } = require("../app.js");

test("名前・住所からカテゴリー・都道府県を自動判定する", () => {
  const fields = buildManualPlaceFields({
    name: "博多ラーメン一風堂",
    address: "福岡県福岡市博多区",
    comment: "美味しかった",
    rating: 5,
    url: "https://maps.google.com/?q=test",
    publishTime: "2026/07/20",
    coordinateText: ""
  });

  assert.equal(fields.category, "gourmet_ramen");
  assert.equal(fields.prefecture, "福岡県");
  assert.equal(fields.rating, 5);
  assert.equal(fields.lat, null);
  assert.equal(fields.lng, null);
  assert.equal(fields.updateTime, "2026/07/20");
});

test("緯度経度のコピペを座標として取り込む", () => {
  const fields = buildManualPlaceFields({
    name: "東京タワー",
    address: "",
    coordinateText: "35.6586, 139.7454"
  });

  assert.equal(fields.lat, 35.6586);
  assert.equal(fields.lng, 139.7454);
});

test("評価やコメントが未指定なら null/空文字にフォールバックする", () => {
  const fields = buildManualPlaceFields({ name: "名前のみのスポット" });
  assert.equal(fields.rating, null);
  assert.equal(fields.comment, "");
  assert.equal(fields.address, "");
  assert.equal(fields.url, "");
  assert.equal(fields.publishTime, "");
});

test("「行ってみたい」チェックが入っていればwishlistListNameを立てる（2026-07-28実装）", () => {
  const fields = buildManualPlaceFields({ name: "気になる店", wishlist: true });
  assert.equal(fields.wishlistListName, "行ってみたい");
});

test("「行ってみたい」チェックが無ければwishlistListNameはnullのまま", () => {
  const fields = buildManualPlaceFields({ name: "普通のログ", wishlist: false });
  assert.equal(fields.wishlistListName, null);
});

test("updateManualPlaceFields: 編集フォームが全行対応になったことに伴う回帰確認（2026-08-01）。" +
  "Googleマップのカスタムリスト由来の固有リスト名は、チェックが入ったままの編集では汎用ラベルに" +
  "上書きされず保持される（チェックボックスは常に「行ってみたい」固定文字列にしか対応していないため）", () => {
  const place = {
    name: "今度行きたい店",
    wishlistListName: "今度行きたい店リスト",
    wishlistMemo: "友達に勧められた",
    wishlistTags: null,
    wishlistComment: null
  };

  updateManualPlaceFields(place, { name: "今度行きたい店", wishlist: true });
  assert.equal(place.wishlistListName, "今度行きたい店リスト");
});

test("updateManualPlaceFields: チェックを外して明示的に解除した場合はnullになる", () => {
  const place = { name: "今度行きたい店", wishlistListName: "今度行きたい店リスト" };
  updateManualPlaceFields(place, { name: "今度行きたい店", wishlist: false });
  assert.equal(place.wishlistListName, null);
});
