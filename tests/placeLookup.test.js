// Stub the browser globals app.js touches at load time so it can run under Node.
global.document = { addEventListener() {} };

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  parsePlaceLookupQueries,
  buildPlaceLookupPrompt,
  parsePlaceLookupResponse,
  checkPlaceLookupCoordinateMismatch,
  buildManualPlaceFieldsFromLookupCandidate,
  geminiCategories
} = require("../app.js");

test("parsePlaceLookupQueries: 1行1件をid付きでパースし、空行は無視する", () => {
  const text = "福岡県 ラーメン二郎目黒店\n\n  京都府 〇〇カフェ  \n";
  const queries = parsePlaceLookupQueries(text);
  assert.deepEqual(queries, [
    { id: "q1", query: "福岡県 ラーメン二郎目黒店" },
    { id: "q2", query: "京都府 〇〇カフェ" }
  ]);
});

test("parsePlaceLookupQueries: 空文字/未指定は空配列を返す", () => {
  assert.deepEqual(parsePlaceLookupQueries(""), []);
  assert.deepEqual(parsePlaceLookupQueries(undefined), []);
});

test("parsePlaceLookupQueries: 上限件数（30件）を超えた分は切り捨てる", () => {
  const lines = Array.from({ length: 35 }, (_, i) => `スポット${i + 1}`).join("\n");
  const queries = parsePlaceLookupQueries(lines);
  assert.equal(queries.length, 30);
  assert.equal(queries[29].query, "スポット30");
});

test("buildPlaceLookupPrompt: クエリの文言とidの両方を含める", () => {
  const prompt = buildPlaceLookupPrompt([{ id: "q1", query: "福岡県 ラーメン二郎目黒店" }]);
  assert.ok(prompt.includes("福岡県 ラーメン二郎目黒店"));
  assert.ok(prompt.includes("q1"));
  assert.ok(prompt.includes("candidates"));
});

test("parsePlaceLookupResponse: 素のJSON配列をパースする", () => {
  const text = '[{"id":"q1","candidates":[{"name":"一蘭 天神店","address":"福岡県福岡市中央区天神1-1","lat":33.59,"lng":130.4,"category":"ラーメン店"}]}]';
  const results = parsePlaceLookupResponse(text);
  assert.deepEqual(results, [{
    id: "q1",
    candidates: [{ name: "一蘭 天神店", address: "福岡県福岡市中央区天神1-1", lat: 33.59, lng: 130.4, category: "ラーメン店" }]
  }]);
});

test("parsePlaceLookupResponse: ```json コードフェンス付きの回答も許容する", () => {
  const text = '```json\n[{"id":"q1","candidates":[]}]\n```';
  const results = parsePlaceLookupResponse(text);
  assert.deepEqual(results, [{ id: "q1", candidates: [] }]);
});

test("parsePlaceLookupResponse: 不正なJSON/配列以外はnullを返す", () => {
  assert.equal(parsePlaceLookupResponse("これはJSONではありません"), null);
  assert.equal(parsePlaceLookupResponse('{"id":"q1"}'), null);
  assert.equal(parsePlaceLookupResponse(""), null);
});

test("parsePlaceLookupResponse: 緯度経度が数値でない/範囲外の候補は除外する", () => {
  const text = JSON.stringify([{
    id: "q1",
    candidates: [
      { name: "候補A", address: "住所A", lat: "35.6", lng: 139.7, category: "カフェ" }, // latが文字列
      { name: "候補B", address: "住所B", lat: 999, lng: 139.7, category: "カフェ" },   // 範囲外
      { name: "候補C", address: "住所C", lat: 35.6, lng: 139.7, category: "カフェ" }    // 正常
    ]
  }]);
  const results = parsePlaceLookupResponse(text);
  assert.equal(results[0].candidates.length, 1);
  assert.equal(results[0].candidates[0].name, "候補C");
});

test("parsePlaceLookupResponse: idが無い/candidatesが配列でない要素は除外する", () => {
  const text = '[{"id":"q1","candidates":[]},{"candidates":[]},{"id":"q2","candidates":"not-array"}]';
  const results = parsePlaceLookupResponse(text);
  assert.deepEqual(results, [{ id: "q1", candidates: [] }]);
});

test("checkPlaceLookupCoordinateMismatch: 住所と座標の都道府県が一致すればnull", () => {
  const candidate = { name: "テスト", address: "福岡県福岡市中央区天神1-1", lat: 33.6064, lng: 130.4181 };
  assert.equal(checkPlaceLookupCoordinateMismatch(candidate), null);
});

test("checkPlaceLookupCoordinateMismatch: 住所は福岡なのに座標が東京付近ならハルシネーション警告を返す", () => {
  const candidate = { name: "テスト", address: "福岡県福岡市中央区天神1-1", lat: 35.6894, lng: 139.6917 };
  const warning = checkPlaceLookupCoordinateMismatch(candidate);
  assert.ok(warning);
  assert.ok(warning.includes("福岡県"));
  assert.ok(warning.includes("東京都"));
});

test("checkPlaceLookupCoordinateMismatch: 住所から都道府県が判定できない場合はチェックせずnullを返す", () => {
  const candidate = { name: "テスト", address: "", lat: 35.6894, lng: 139.6917 };
  assert.equal(checkPlaceLookupCoordinateMismatch(candidate), null);
});

test("buildManualPlaceFieldsFromLookupCandidate: 候補の住所・座標をそのまま使い、業種はGemini取得カテゴリーとして登録する", () => {
  Object.keys(geminiCategories).forEach(k => delete geminiCategories[k]);

  const candidate = { name: "一蘭 天神店", address: "福岡県福岡市中央区天神1-1", lat: 33.59, lng: 130.4, category: "ラーメン店" };
  const fields = buildManualPlaceFieldsFromLookupCandidate(candidate);

  assert.equal(fields.name, "一蘭 天神店");
  assert.equal(fields.address, "福岡県福岡市中央区天神1-1");
  assert.equal(fields.lat, 33.59);
  assert.equal(fields.lng, 130.4);
  assert.equal(fields.prefecture, "福岡県");
  assert.equal(fields.googleCategoryRaw, "ラーメン店");
  assert.equal(fields.category, "gemini_ラーメン店");
  assert.equal(fields.rating, null);
  assert.equal(fields.comment, "");
});

test("buildManualPlaceFieldsFromLookupCandidate: 業種が空文字の候補はclassifyCategoryへフォールバックする", () => {
  const candidate = { name: "テスト神社", address: "東京都渋谷区1-1", lat: 35.6, lng: 139.7, category: "" };
  const fields = buildManualPlaceFieldsFromLookupCandidate(candidate);
  assert.equal(fields.googleCategoryRaw, null);
  assert.notEqual(fields.category, null);
});

test("buildManualPlaceFieldsFromLookupCandidate: 第2引数で評価を指定すればそのまま採用される", () => {
  const candidate = { name: "テスト神社", address: "東京都渋谷区1-1", lat: 35.6, lng: 139.7, category: "" };
  const fields = buildManualPlaceFieldsFromLookupCandidate(candidate, 4);
  assert.equal(fields.rating, 4);
});

test("buildManualPlaceFieldsFromLookupCandidate: 評価未指定はnullのまま（従来通り）", () => {
  const candidate = { name: "テスト神社", address: "東京都渋谷区1-1", lat: 35.6, lng: 139.7, category: "" };
  const fields = buildManualPlaceFieldsFromLookupCandidate(candidate, null);
  assert.equal(fields.rating, null);
});
