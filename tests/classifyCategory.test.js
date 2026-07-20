// Stub the browser globals app.js touches at load time so it can run under Node.
global.document = { addEventListener() {} };

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { classifyCategory } = require("../app.js");

test("ラーメン店をgourmet_ramenに分類する", () => {
  assert.equal(classifyCategory("博多とんこつラーメン一風堂", ""), "gourmet_ramen");
});

test("チェーンホテル名をlodgingに分類する（東横イン）", () => {
  assert.equal(classifyCategory("東横イン博多駅前", ""), "lodging");
});

test("「〜イン」で終わる一般的な宿をlodgingに分類する", () => {
  assert.equal(classifyCategory("旅の宿 やまだイン", ""), "lodging");
});

test("「ワイン」を含む店名をlodgingと誤判定しない", () => {
  assert.notEqual(classifyCategory("ワインバー グラスハウス", ""), "lodging");
});

test("「デザイン」を含む店名をlodgingと誤判定しない", () => {
  assert.notEqual(classifyCategory("デザイン雑貨店", ""), "lodging");
});

test("神社をtempleに分類する", () => {
  assert.equal(classifyCategory("住吉神社", ""), "temple");
});

test("「宇都宮」のような地名をtempleと誤判定しない", () => {
  assert.notEqual(classifyCategory("宇都宮餃子スタジアム", ""), "temple");
});

test("駅をtransportに分類する", () => {
  assert.equal(classifyCategory("博多駅", ""), "transport");
});

test("キーワードに該当しない場合はotherに分類する", () => {
  assert.equal(classifyCategory("よくわからない場所123", ""), "other");
});
