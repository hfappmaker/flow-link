import assert from "node:assert/strict";
import test from "node:test";

const {
  isHighMonthlyRateText,
  normalizeRateText,
  rateFitTone,
} = await import("../src/lib/rates.ts");

test("monthly rate normalization parses common Japanese amount formats", () => {
  assert.deepEqual(rateBounds("月80万円"), [80, 80]);
  assert.deepEqual(rateBounds("80万円以上"), [80, 80]);
  assert.deepEqual(rateBounds("月額120万円"), [120, 120]);
  assert.deepEqual(rateBounds("100〜130万円"), [100, 130]);
  assert.deepEqual(rateBounds("75〜95万円"), [75, 95]);
  assert.deepEqual(rateBounds("¥1,000,000"), [100, 100]);
});

test("high monthly rate filter uses lower-bound policy and excludes non-monthly text", () => {
  assert.equal(isHighMonthlyRateText("月80万円"), true);
  assert.equal(isHighMonthlyRateText("月額120万円"), true);
  assert.equal(isHighMonthlyRateText("100〜130万円"), true);
  assert.equal(isHighMonthlyRateText("75〜95万円"), false);
  assert.equal(isHighMonthlyRateText("70〜100万円"), false);
  assert.equal(isHighMonthlyRateText("¥1,000,000"), true);
  assert.equal(isHighMonthlyRateText("時給8,000円"), false);
  assert.equal(isHighMonthlyRateText("日給5万円"), false);
  assert.equal(isHighMonthlyRateText("高単価"), false);
});

test("rate fit compares normalized monthly bounds for recommendation reasons", () => {
  assert.equal(rateFitTone("月80万円以上", "月額120万円"), "good");
  assert.equal(rateFitTone("月80万円以上", "75〜95万円"), "neutral");
  assert.equal(rateFitTone("月80万円以上", "70万円"), "warn");
  assert.equal(rateFitTone("時給7000円から", "月額120万円"), "neutral");
});

function rateBounds(value) {
  const rate = normalizeRateText(value);
  return [rate.lowerMonthlyManYen, rate.upperMonthlyManYen];
}
