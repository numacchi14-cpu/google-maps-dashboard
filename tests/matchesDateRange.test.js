// Stub the browser globals app.js touches at load time so it can run under Node.
global.document = { addEventListener() {} };

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { matchesDateRange } = require("../app.js");

test("開始日・終了日ともに未指定なら常に一致する", () => {
  assert.equal(matchesDateRange("2026/03/10", "", ""), true);
  assert.equal(matchesDateRange(null, "", ""), true);
});

test("日付が空でも範囲指定があれば不一致にする", () => {
  assert.equal(matchesDateRange("", "2026-01-01", ""), false);
  assert.equal(matchesDateRange(null, "", "2026-12-31"), false);
});

test("開始日のみ指定した場合、それ以降の日付のみ一致する", () => {
  assert.equal(matchesDateRange("2026/03/10", "2026-03-01", ""), true);
  assert.equal(matchesDateRange("2026/03/10", "2026-03-10", ""), true);
  assert.equal(matchesDateRange("2026/02/28", "2026-03-01", ""), false);
});

test("終了日のみ指定した場合、それ以前の日付のみ一致する", () => {
  assert.equal(matchesDateRange("2026/03/10", "", "2026-03-31"), true);
  assert.equal(matchesDateRange("2026/04/01", "", "2026-03-31"), false);
});

test("月日がゼロ埋めされていない日付（'2026/3/10'等）でも正しく範囲判定する（回帰: ゼロ埋め表記ゆれで前後関係が逆転する不具合）", () => {
  assert.equal(matchesDateRange("2026/3/10", "2026-03-01", "2026-03-31"), true);
  assert.equal(matchesDateRange("2026/3/10", "2026-04-01", ""), false);
  assert.equal(matchesDateRange("2026/9/1", "2026-10-01", ""), false);
});

test("開始日・終了日の両方を指定した範囲内のみ一致する", () => {
  assert.equal(matchesDateRange("2026/06/15", "2026-06-01", "2026-06-30"), true);
  assert.equal(matchesDateRange("2026/07/01", "2026-06-01", "2026-06-30"), false);
  assert.equal(matchesDateRange("2026/05/31", "2026-06-01", "2026-06-30"), false);
});
