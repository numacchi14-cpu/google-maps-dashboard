// Stub the browser globals app.js touches at load time so it can run under Node.
global.document = { addEventListener() {} };

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildManualPlaceFields } = require("../app.js");

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
