import assert from "node:assert/strict";
import test from "node:test";

const {
  isMonthlyRateAtLeastText,
  monthlyRateBandFromFilter,
  monthlyRateBandLabel,
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

test("monthly rate band filters use lower-bound policy and exclude non-monthly text", () => {
  const cases = [
    { threshold: 60, included: ["月60万円", "月額80万円", "100〜130万円"], excluded: ["55〜75万円", "時給8,000円"] },
    { threshold: 80, included: ["月80万円", "月額120万円", "100〜130万円", "¥1,000,000"], excluded: ["75〜95万円", "70〜100万円"] },
    { threshold: 100, included: ["月100万円", "月額120万円", "100〜130万円"], excluded: ["月80万円", "90〜120万円"] },
    { threshold: 120, included: ["月120万円", "120〜150万円"], excluded: ["月100万円", "100〜130万円"] },
  ];

  for (const { threshold, included, excluded } of cases) {
    for (const value of included) {
      assert.equal(isMonthlyRateAtLeastText(value, threshold), true, `${value} should match ${threshold}万円以上`);
    }
    for (const value of excluded) {
      assert.equal(isMonthlyRateAtLeastText(value, threshold), false, `${value} should not match ${threshold}万円以上`);
    }
  }

  assert.equal(isMonthlyRateAtLeastText("日給5万円", 60), false);
  assert.equal(isMonthlyRateAtLeastText("高単価", 60), false);
});

test("monthly rate filter values map to supported saved-search bands", () => {
  assert.equal(monthlyRateBandFromFilter("60"), 60);
  assert.equal(monthlyRateBandFromFilter("80"), 80);
  assert.equal(monthlyRateBandFromFilter("100"), 100);
  assert.equal(monthlyRateBandFromFilter("120"), 120);
  assert.equal(monthlyRateBandFromFilter("high"), 80);
  assert.equal(monthlyRateBandFromFilter("70"), null);
  assert.equal(monthlyRateBandLabel(100), "月100万円以上");
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
