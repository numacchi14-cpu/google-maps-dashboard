// Stub the browser globals app.js touches at load time so it can run under Node.
global.document = { addEventListener() {} };

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { shouldScheduleLocalCacheWrite } = require("../app.js");

test("shouldScheduleLocalCacheWrite: トグルON かつ IndexedDBが使える場合のみtrue", () => {
  assert.equal(shouldScheduleLocalCacheWrite(true, true), true);
});

test("shouldScheduleLocalCacheWrite: トグルOFFならIndexedDBが使えてもfalse", () => {
  assert.equal(shouldScheduleLocalCacheWrite(false, true), false);
});

test("shouldScheduleLocalCacheWrite: IndexedDBが使えなければトグルONでもfalse", () => {
  assert.equal(shouldScheduleLocalCacheWrite(true, false), false);
});

test("shouldScheduleLocalCacheWrite: 両方無効ならfalse", () => {
  assert.equal(shouldScheduleLocalCacheWrite(false, false), false);
});
