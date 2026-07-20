// Stub the browser globals app.js touches at load time so it can run under Node.
global.document = { addEventListener() {} };

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseCoordinatePair } = require("../app.js");

test("「緯度, 経度」形式（Googleマップからのコピペを想定）を解釈する", () => {
  assert.deepEqual(parseCoordinatePair("35.6586, 139.7454"), { lat: 35.6586, lng: 139.7454 });
});

test("カンマの前後のスペースの有無やマイナス値も許容する", () => {
  assert.deepEqual(parseCoordinatePair("35.6586,139.7454"), { lat: 35.6586, lng: 139.7454 });
  assert.deepEqual(parseCoordinatePair("-33.8688, 151.2093"), { lat: -33.8688, lng: 151.2093 });
});

test("空欄や不正な形式ではnullを返す", () => {
  assert.equal(parseCoordinatePair(""), null);
  assert.equal(parseCoordinatePair(null), null);
  assert.equal(parseCoordinatePair("東京タワー"), null);
  assert.equal(parseCoordinatePair("35.6586"), null);
});
