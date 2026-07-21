// Stub the browser globals app.js touches at load time so it can run under Node.
global.document = { addEventListener() {} };

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  mapRawCategoryToKey,
  buildGeminiCategoryPrompt,
  parseGeminiCategoryResponse,
  applyGeminiCategoryResults,
  places
} = require("../app.js");

test("mapRawCategoryToKey: Geminiが返す業種ラベルをCATEGORIESのkeywordsで12分類へマッピングする", () => {
  assert.equal(mapRawCategoryToKey("ラーメン店"), "gourmet_ramen");
  assert.equal(mapRawCategoryToKey("ビジネスホテル"), "lodging");
  assert.equal(mapRawCategoryToKey("神社"), "temple");
  assert.equal(mapRawCategoryToKey("スーパーマーケット"), "shopping");
});

test("mapRawCategoryToKey: どのキーワードにも一致しない/空の場合はotherにフォールバックする", () => {
  assert.equal(mapRawCategoryToKey("謎の施設"), "other");
  assert.equal(mapRawCategoryToKey(""), "other");
  assert.equal(mapRawCategoryToKey(null), "other");
});

test("buildGeminiCategoryPrompt: 評価・コメントを含めず名前と住所のみを送る", () => {
  const batch = [{ id: "p1", name: "一蘭 天神店", address: "福岡県福岡市中央区天神1-1", comment: "最高", rating: 5 }];
  const prompt = buildGeminiCategoryPrompt(batch);

  assert.ok(prompt.includes("一蘭 天神店"));
  assert.ok(prompt.includes("福岡県福岡市中央区天神1-1"));
  assert.ok(prompt.includes("p1"));
  assert.ok(!prompt.includes("最高"));
  assert.ok(!prompt.includes("rating"));
});

test("parseGeminiCategoryResponse: 素のJSON配列をパースする", () => {
  const text = '[{"id": "p1", "category": "ラーメン店"}, {"id": "p2", "category": "ホテル"}]';
  const results = parseGeminiCategoryResponse(text);
  assert.deepEqual(results, [
    { id: "p1", category: "ラーメン店" },
    { id: "p2", category: "ホテル" }
  ]);
});

test("parseGeminiCategoryResponse: ```json コードフェンス付きの回答も許容する", () => {
  const text = '```json\n[{"id": "p1", "category": "神社"}]\n```';
  const results = parseGeminiCategoryResponse(text);
  assert.deepEqual(results, [{ id: "p1", category: "神社" }]);
});

test("parseGeminiCategoryResponse: 不正なJSON/配列以外はnullを返す", () => {
  assert.equal(parseGeminiCategoryResponse("これはJSONではありません"), null);
  assert.equal(parseGeminiCategoryResponse('{"id": "p1", "category": "神社"}'), null);
  assert.equal(parseGeminiCategoryResponse(""), null);
});

test("parseGeminiCategoryResponse: id/categoryが欠けた要素は除外する", () => {
  const text = '[{"id": "p1", "category": "神社"}, {"id": "p2"}, {"category": "ホテル"}]';
  const results = parseGeminiCategoryResponse(text);
  assert.deepEqual(results, [{ id: "p1", category: "神社" }]);
});

test("applyGeminiCategoryResults: idが一致するplaceにgoogleCategoryRawと再マッピングしたcategoryを反映する", () => {
  places.length = 0;
  places.push({ id: "p1", name: "テスト", category: "other", googleCategoryRaw: null });

  const appliedCount = applyGeminiCategoryResults([{ id: "p1", category: "ラーメン店" }]);

  assert.equal(appliedCount, 1);
  assert.equal(places[0].googleCategoryRaw, "ラーメン店");
  assert.equal(places[0].category, "gourmet_ramen");
});

test("applyGeminiCategoryResults: 一致するidがない場合はスキップし件数に含めない", () => {
  places.length = 0;
  places.push({ id: "p1", name: "テスト", category: "other", googleCategoryRaw: null });

  const appliedCount = applyGeminiCategoryResults([{ id: "not-found", category: "ラーメン店" }]);

  assert.equal(appliedCount, 0);
  assert.equal(places[0].googleCategoryRaw, null);
});
