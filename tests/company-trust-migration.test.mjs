import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationSql = await readFile("prisma/migrations/20260609000000_add_company_trust_fields/migration.sql", "utf8");
const schema = await readFile("prisma/schema.prisma", "utf8");

test("company trust fields migration is additive for existing company profiles", () => {
  assert.match(migrationSql, /ALTER TABLE "company_profiles"/);

  for (const column of ["contact_team", "operating_area", "payment_policy"]) {
    assert.match(migrationSql, new RegExp(`ADD COLUMN "${column}" TEXT`));
  }

  assert.doesNotMatch(migrationSql, /NOT NULL/);
});

test("company trust fields stay optional in the Prisma schema", () => {
  assert.match(schema, /contactTeam\s+String\?\s+@map\("contact_team"\)/);
  assert.match(schema, /operatingArea\s+String\?\s+@map\("operating_area"\)/);
  assert.match(schema, /paymentPolicy\s+String\?\s+@map\("payment_policy"\)/);
});
