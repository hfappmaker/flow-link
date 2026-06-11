import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const reputationComponent = await readFile("src/components/reputation.tsx", "utf8");

test("reputation card explains completed Flow Link history without interaction jargon", () => {
  assert.doesNotMatch(reputationComponent, /相互作用/);
  assert.match(reputationComponent, /完了した面談・連絡/);
  assert.match(reputationComponent, /面談、メッセージ、選考フォロー/);
  assert.match(reputationComponent, /完了後に参加者が評価を送信したFlow Link内のやりとり/);
});

test("reputation card keeps the trust-history disclaimer limited to reference information", () => {
  assert.match(reputationComponent, /支払い、本人確認、将来の成果を保証するものではありません/);
  assert.match(reputationComponent, /報告された評価や非公開指定の内容、個別メモは公開集計に含めません/);
});
