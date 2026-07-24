// Stub the browser globals app.js touches at load time so it can run under Node.
global.document = { addEventListener() {} };

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { deduplicatePlaces } = require("../app.js");

function basePlace(overrides) {
  return {
    id: "id1",
    name: "テスト店",
    address: "東京都渋谷区1-1-1",
    lat: 35.6586,
    lng: 139.7454,
    prefecture: "東京都",
    category: "cat_gourmet",
    googleCategoryRaw: null,
    myPrefecture: null,
    myCategory: null,
    rating: 4,
    comment: "美味しかった",
    url: "https://maps.google.com/?cid=1",
    source: "保存済みの場所",
    publishTime: "2026/01/01",
    updateTime: "2026/01/01",
    ...overrides
  };
}

test("更新日が新しい再取り込みは、レビュー本文・評価・住所・更新日を追従上書きする", () => {
  const existing = basePlace({});
  const incoming = basePlace({
    comment: "リニューアルして更に美味しくなった",
    rating: 5,
    address: "東京都渋谷区1-1-2",
    updateTime: "2026/06/01"
  });

  const result = deduplicatePlaces([existing, incoming]);

  assert.equal(result.length, 1);
  assert.equal(result[0].comment, "リニューアルして更に美味しくなった");
  assert.equal(result[0].rating, 5);
  assert.equal(result[0].address, "東京都渋谷区1-1-2");
  assert.equal(result[0].updateTime, "2026/06/01");
});

test("更新日が同じか古い再取り込みは、既存の値を上書きしない（空欄埋めのみ）", () => {
  const existing = basePlace({});
  const incoming = basePlace({
    comment: "古い評判",
    rating: 1,
    updateTime: "2025/12/01"
  });

  const result = deduplicatePlaces([existing, incoming]);

  assert.equal(result[0].comment, "美味しかった");
  assert.equal(result[0].rating, 4);
  assert.equal(result[0].updateTime, "2026/01/01");
});

test("手動入力レコードは、更新日が新しい取り込みがあっても上書きされない", () => {
  const existing = basePlace({ source: "手動入力", comment: "自分の感想", rating: 3 });
  const incoming = basePlace({
    comment: "Googleのクチコミ",
    rating: 5,
    updateTime: "2026/06/01"
  });

  const result = deduplicatePlaces([existing, incoming]);

  assert.equal(result[0].comment, "自分の感想");
  assert.equal(result[0].rating, 3);
  assert.equal(result[0].source, "手動入力");
});

test("手動入力レコードでも、初投稿日・最終更新日が未設定なら取り込みデータで埋め合わせる（評価・レビュー同様の空欄埋め）", () => {
  const existing = basePlace({
    source: "手動入力",
    rating: null,
    comment: "",
    publishTime: "",
    updateTime: ""
  });
  const incoming = basePlace({
    rating: 4,
    comment: "後から書き足したクチコミ",
    publishTime: "2026/03/01",
    updateTime: "2026/03/01"
  });

  const result = deduplicatePlaces([existing, incoming]);

  assert.equal(result[0].rating, 4);
  assert.equal(result[0].comment, "後から書き足したクチコミ");
  assert.equal(result[0].publishTime, "2026/03/01");
  assert.equal(result[0].updateTime, "2026/03/01");
});

test("マイ都道府県・マイカテゴリーは、更新日に関わらずユーザー設定済みなら保護される", () => {
  const existing = basePlace({ myPrefecture: "大阪府", myCategory: "よく行く店" });
  const incoming = basePlace({
    myPrefecture: "京都府",
    myCategory: "ラーメン店",
    updateTime: "2026/06/01"
  });

  const result = deduplicatePlaces([existing, incoming]);

  assert.equal(result[0].myPrefecture, "大阪府");
  assert.equal(result[0].myCategory, "よく行く店");
});

test("マイ都道府県・マイカテゴリーが未設定の場合は、取り込みデータで埋め合わせる", () => {
  const existing = basePlace({ myPrefecture: null, myCategory: null });
  const incoming = basePlace({
    myPrefecture: "京都府",
    myCategory: "ラーメン店",
    updateTime: "2025/12/01"
  });

  const result = deduplicatePlaces([existing, incoming]);

  assert.equal(result[0].myPrefecture, "京都府");
  assert.equal(result[0].myCategory, "ラーメン店");
});

test("URL・緯度経度のどちらも無い（名前＋住所のみ一致の）重複でも、埋め合わせマージが効く（回帰: circolo park 鴻巣店のようなGemini追加スポットで最終更新日が一切反映されなかった不具合）", () => {
  const existing = basePlace({
    url: "",
    lat: null,
    lng: null,
    rating: null,
    comment: "",
    publishTime: "",
    updateTime: "",
    source: "手動入力"
  });
  const incoming = basePlace({
    url: "",
    lat: null,
    lng: null,
    rating: 4,
    comment: "後から書き足したクチコミ",
    publishTime: "2026/03/01",
    updateTime: "2026/03/01"
  });

  const result = deduplicatePlaces([existing, incoming]);

  assert.equal(result.length, 1);
  assert.equal(result[0].rating, 4);
  assert.equal(result[0].comment, "後から書き足したクチコミ");
  assert.equal(result[0].updateTime, "2026/03/01");
});

test("URLが一致しない場合は別レコードとして扱う（重複排除しない）", () => {
  const a = basePlace({ url: "https://maps.google.com/?cid=1" });
  const b = basePlace({ id: "id2", url: "https://maps.google.com/?cid=2" });

  const result = deduplicatePlaces([a, b]);

  assert.equal(result.length, 2);
});
