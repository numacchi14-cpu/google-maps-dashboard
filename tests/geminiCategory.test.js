// Stub the browser globals app.js touches at load time so it can run under Node.
global.document = { addEventListener() {} };

const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  getOrCreateGeminiCategory,
  geminiCategories,
  getAllCategories,
  buildGeminiCategoryPrompt,
  parseGeminiCategoryResponse,
  applyGeminiCategoryResults,
  places
} = require("../app.js");

test("getOrCreateGeminiCategory: Geminiが返した生ラベルをそのまま名前として使う（12分類への丸め込みをしない）", () => {
  Object.keys(geminiCategories).forEach(k => delete geminiCategories[k]);

  const key = getOrCreateGeminiCategory("美容室");
  assert.equal(key, "gemini_美容室");
  assert.equal(geminiCategories[key].name, "美容室");
  assert.equal(getAllCategories()[key].name, "美容室");
});

test("getOrCreateGeminiCategory: 同じラベルは同じキー・同じ色に集約される", () => {
  Object.keys(geminiCategories).forEach(k => delete geminiCategories[k]);

  const key1 = getOrCreateGeminiCategory("ラーメン店");
  const key2 = getOrCreateGeminiCategory("ラーメン店");
  assert.equal(key1, key2);
  assert.equal(Object.keys(geminiCategories).length, 1);
});

test("getOrCreateGeminiCategory: 前後の空白は無視し、空文字/nullはnullを返す", () => {
  Object.keys(geminiCategories).forEach(k => delete geminiCategories[k]);

  assert.equal(getOrCreateGeminiCategory("  ラーメン店  "), getOrCreateGeminiCategory("ラーメン店"));
  assert.equal(getOrCreateGeminiCategory(""), null);
  assert.equal(getOrCreateGeminiCategory(null), null);
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

test("applyGeminiCategoryResults: idが一致するplaceにGeminiの回答をそのままgoogleCategoryRaw/categoryへ反映し、適用結果（UI表示用）を返す", () => {
  places.length = 0;
  places.push({ id: "p1", name: "テスト", category: "other", googleCategoryRaw: null });

  const applied = applyGeminiCategoryResults([{ id: "p1", category: "美容室" }]);

  assert.equal(applied.length, 1);
  assert.deepEqual(applied[0], {
    id: "p1",
    name: "テスト",
    rawCategory: "美容室",
    categoryKey: "gemini_美容室",
    categoryName: "美容室"
  });
  assert.equal(places[0].googleCategoryRaw, "美容室");
  assert.equal(places[0].category, "gemini_美容室");
});

test("applyGeminiCategoryResults: 一致するidがない場合はスキップし結果に含めない", () => {
  places.length = 0;
  places.push({ id: "p1", name: "テスト", category: "other", googleCategoryRaw: null });

  const applied = applyGeminiCategoryResults([{ id: "not-found", category: "ラーメン店" }]);

  assert.equal(applied.length, 0);
  assert.equal(places[0].googleCategoryRaw, null);
});
