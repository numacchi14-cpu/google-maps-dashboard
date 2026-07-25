// Stub the browser globals app.js touches at load time so it can run under Node.
global.document = { addEventListener() {} };

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  getGeminiLocationIncompletePlaces,
  buildGeminiLocationPrompt,
  parseGeminiLocationResponse,
  applyGeminiLocationResults,
  places
} = require("../app.js");

test("getGeminiLocationIncompletePlaces: urlまたは緯度経度のどちらかが欠けている行のみを対象にする", () => {
  places.length = 0;
  places.push({ id: "p1", name: "完備", url: "https://maps.example/1", lat: 35, lng: 139 });
  places.push({ id: "p2", name: "urlのみ欠", url: "", lat: 35, lng: 139 });
  places.push({ id: "p3", name: "座標のみ欠", url: "https://maps.example/3", lat: null, lng: null });
  places.push({ id: "p4", name: "両方欠", url: "", lat: null, lng: null });

  const targets = getGeminiLocationIncompletePlaces().map(p => p.id);
  assert.deepEqual(targets, ["p2", "p3", "p4"]);
});

test("buildGeminiLocationPrompt: 評価・コメントを含めず名前と住所のみを送る", () => {
  const batch = [{ id: "p1", name: "一蘭 天神店", address: "福岡県福岡市中央区天神1-1", comment: "最高", rating: 5 }];
  const prompt = buildGeminiLocationPrompt(batch);

  assert.ok(prompt.includes("一蘭 天神店"));
  assert.ok(prompt.includes("福岡県福岡市中央区天神1-1"));
  assert.ok(prompt.includes("p1"));
  assert.ok(!prompt.includes("最高"));
  assert.ok(!prompt.includes("rating"));
});

test("parseGeminiLocationResponse: 素のJSON配列をパースする", () => {
  const text = '[{"id": "p1", "url": "https://maps.google.com/?q=1", "lat": 35.6586, "lng": 139.7454}]';
  const results = parseGeminiLocationResponse(text);
  assert.deepEqual(results, [{ id: "p1", url: "https://maps.google.com/?q=1", lat: 35.6586, lng: 139.7454 }]);
});

test("parseGeminiLocationResponse: ```json コードフェンス付きの回答も許容する", () => {
  const text = '```json\n[{"id": "p1", "url": "https://maps.google.com/?q=1"}]\n```';
  const results = parseGeminiLocationResponse(text);
  assert.deepEqual(results, [{ id: "p1", url: "https://maps.google.com/?q=1" }]);
});

test("parseGeminiLocationResponse: url/lat/lngは任意項目で、無ければ省略されたものとして扱う", () => {
  const text = '[{"id": "p1"}, {"id": "p2", "lat": 35.6, "lng": 139.7}]';
  const results = parseGeminiLocationResponse(text);
  assert.deepEqual(results, [{ id: "p1" }, { id: "p2", lat: 35.6, lng: 139.7 }]);
});

test("parseGeminiLocationResponse: 緯度経度が数値でない/範囲外の場合はlat/lngを採用しない", () => {
  const text = '[{"id": "p1", "lat": "35.6", "lng": 139.7}, {"id": "p2", "lat": 999, "lng": 139.7}]';
  const results = parseGeminiLocationResponse(text);
  assert.deepEqual(results, [{ id: "p1" }, { id: "p2" }]);
});

test("parseGeminiLocationResponse: 不正なJSON/配列以外はnullを返す", () => {
  assert.equal(parseGeminiLocationResponse("これはJSONではありません"), null);
  assert.equal(parseGeminiLocationResponse('{"id": "p1"}'), null);
  assert.equal(parseGeminiLocationResponse(""), null);
});

test("applyGeminiLocationResults: urlも緯度経度も未設定なら両方反映する", () => {
  places.length = 0;
  places.push({ id: "p1", name: "テスト", address: "東京都渋谷区1-1", url: "", lat: null, lng: null });

  const applied = applyGeminiLocationResults([{ id: "p1", url: "https://maps.example/1", lat: 35.66, lng: 139.7 }]);

  assert.equal(applied.length, 1);
  assert.equal(applied[0].urlApplied, true);
  assert.equal(applied[0].coordsApplied, true);
  assert.equal(places[0].url, "https://maps.example/1");
  assert.equal(places[0].lat, 35.66);
  assert.equal(places[0].lng, 139.7);
});

test("applyGeminiLocationResults: 既に値がある項目は上書きしない（空欄埋めのみ）", () => {
  places.length = 0;
  places.push({ id: "p1", name: "テスト", address: "東京都渋谷区1-1", url: "https://maps.example/existing", lat: 35.1, lng: 139.1 });

  const applied = applyGeminiLocationResults([{ id: "p1", url: "https://maps.example/new", lat: 40, lng: 140 }]);

  assert.equal(applied[0].urlApplied, false);
  assert.equal(applied[0].coordsApplied, false);
  assert.equal(places[0].url, "https://maps.example/existing");
  assert.equal(places[0].lat, 35.1);
  assert.equal(places[0].lng, 139.1);
});

test("applyGeminiLocationResults: 住所と座標の都道府県が食い違う場合は緯度経度を反映せず理由を返す（ハルシネーション対策）", () => {
  places.length = 0;
  places.push({ id: "p1", name: "テスト", address: "福岡県福岡市中央区天神1-1", url: "", lat: null, lng: null });

  // 東京付近の座標を返してしまったケース
  const applied = applyGeminiLocationResults([{ id: "p1", url: "https://maps.example/1", lat: 35.6586, lng: 139.7454 }]);

  assert.equal(applied[0].urlApplied, true);
  assert.equal(applied[0].coordsApplied, false);
  assert.ok(applied[0].coordsSkippedReason);
  assert.equal(places[0].lat, null);
  assert.equal(places[0].lng, null);
});

test("applyGeminiLocationResults: 一致するidがない場合はスキップし結果に含めない", () => {
  places.length = 0;
  places.push({ id: "p1", name: "テスト", url: "", lat: null, lng: null });

  const applied = applyGeminiLocationResults([{ id: "not-found", url: "https://maps.example/1" }]);

  assert.equal(applied.length, 0);
  assert.equal(places[0].url, "");
});
