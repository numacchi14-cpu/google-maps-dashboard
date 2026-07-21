// Stub the browser globals app.js touches at load time so it can run under Node.
global.document = { addEventListener() {} };

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { extractPrefecture } = require("../app.js");

test("回帰: 店名にご当地ラーメン名（他都道府県名）が入っていても住所を優先する（北海道ラーメン誤判定バグ）", () => {
  const pref = extractPrefecture("福岡県福岡市博多区博多駅前1-1-1", "博多 北海道ラーメン誠屋", null, null);
  assert.equal(pref, "福岡県");
});

test("住所に都道府県名が直接含まれていれば、それをそのまま採用する", () => {
  assert.equal(extractPrefecture("東京都渋谷区1-1-1", "適当な店名", null, null), "東京都");
});

test("住所がなく座標のみの場合は、最も近い県庁所在地から推測する", () => {
  // 座標は東京駅付近。店名は無関係な都道府県名を含むが、座標がある場合は座標を優先する。
  const pref = extractPrefecture("", "大阪王将 東京駅前店", 35.681, 139.767);
  assert.equal(pref, "東京都");
});

test("住所も座標もない場合のみ、店名からの推測にフォールバックする", () => {
  const pref = extractPrefecture("", "京都府ご当地ラーメン ○○屋", null, null);
  assert.equal(pref, "京都府");
});

test("住所・座標・店名のいずれからも判定できない場合はその他・海外にする", () => {
  assert.equal(extractPrefecture("", "名称未設定", null, null), "その他・海外");
});

test("英語の都道府県名（住所）にも対応する", () => {
  assert.equal(extractPrefecture("1-1 Shibuya, Tokyo, Japan", "Some Cafe", null, null), "東京都");
});
