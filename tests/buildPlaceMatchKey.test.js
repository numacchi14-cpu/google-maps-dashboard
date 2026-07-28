// Stub the browser globals app.js touches at load time so it can run under Node.
global.document = { addEventListener() {} };

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { buildPlaceMatchKey, normalizeAddressForCompare } = require("../app.js");

// buildPlaceMatchKey is shared by deduplicatePlaces (merge-vs-new-record judgement)
// and by handleFiles' trash-suppression filter (a deleted spot's key blocks a
// re-imported Takeout record with the same key from being re-added). These
// tests pin down the same 3-tier fallback (URL -> name+coords -> name+address)
// that the trash-suppression fix relies on.

test("URLが一致すれば同一キーになる（他の項目が違っても）", () => {
  const a = { name: "店A", address: "東京都渋谷区1-1-1", url: "https://maps.google.com/?cid=1" };
  const b = { name: "店A（改名）", address: "東京都渋谷区9-9-9", url: "https://maps.google.com/?cid=1" };
  assert.equal(buildPlaceMatchKey(a), buildPlaceMatchKey(b));
});

test("URLが無ければ名前+緯度経度（小数点4桁）でキーを作る", () => {
  const a = { name: "店B", lat: 35.65860001, lng: 139.74540001, url: "" };
  const b = { name: "店B", lat: 35.6586, lng: 139.7454, url: "" };
  assert.equal(buildPlaceMatchKey(a), buildPlaceMatchKey(b));
});

test("URL・緯度経度のどちらも無ければ名前+住所（大文字小文字を無視）でキーを作る", () => {
  const a = { name: "Circolo Park 鴻巣店", address: "埼玉県鴻巣市1-1-1", url: "", lat: null, lng: null };
  const b = { name: "circolo park 鴻巣店", address: "埼玉県鴻巣市1-1-1", url: "", lat: null, lng: null };
  assert.equal(buildPlaceMatchKey(a), buildPlaceMatchKey(b));
});

test("名前+住所が異なれば別キーになる（削除済みスポットの抑止フィルターが無関係な項目まで巻き込まない）", () => {
  const a = { name: "店C", address: "東京都渋谷区1-1-1", url: "", lat: null, lng: null };
  const b = { name: "店D", address: "東京都渋谷区2-2-2", url: "", lat: null, lng: null };
  assert.notEqual(buildPlaceMatchKey(a), buildPlaceMatchKey(b));
});

test("名前+住所の照合は、全角数字・郵便番号プレフィックス・ハイフンの表記ゆれを無視して一致する（2026-07-28実装）", () => {
  const a = { name: "伊都の宝", address: "日本、〒819-1101 福岡県糸島市板持１９７－１", url: "", lat: null, lng: null };
  const b = { name: "伊都の宝", address: "福岡県糸島市板持197-1", url: "", lat: null, lng: null };
  assert.equal(buildPlaceMatchKey(a), buildPlaceMatchKey(b));
});

test("normalizeAddressForCompare: 全角数字を半角に変換する", () => {
  assert.equal(normalizeAddressForCompare("福岡県糸島市板持１９７−１"), "福岡県糸島市板持197-1");
});

test("normalizeAddressForCompare: 「日本、〒819-1101」のような国名・郵便番号プレフィックスを除去する", () => {
  assert.equal(normalizeAddressForCompare("日本、〒819-1101 福岡県糸島市板持197-1"), "福岡県糸島市板持197-1");
});

test("normalizeAddressForCompare: ハイフン類の表記ゆれ（全角ハイフン・長音記号等）を半角ハイフンに統一する", () => {
  assert.equal(normalizeAddressForCompare("福岡県糸島市板持197－1"), "福岡県糸島市板持197-1");
  assert.equal(normalizeAddressForCompare("福岡県糸島市板持197ー1"), "福岡県糸島市板持197-1");
});

test("normalizeAddressForCompare: 空欄/未指定は空文字を返す", () => {
  assert.equal(normalizeAddressForCompare(""), "");
  assert.equal(normalizeAddressForCompare(null), "");
  assert.equal(normalizeAddressForCompare(undefined), "");
});
