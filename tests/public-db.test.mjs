import assert from "node:assert/strict";
import test from "node:test";

const { publicDbRead, publicDbReadResult } = await import("../src/lib/public-db.ts");

test("publicDbReadResult returns available data from successful reads", async () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgresql://flowlink:flowlink@127.0.0.1:5432/flow_link";

  try {
    const result = await publicDbReadResult(async () => 12, 0);

    assert.deepEqual(result, { status: "available", data: 12 });
  } finally {
    restoreDatabaseUrl(originalDatabaseUrl);
  }
});

test("publicDbReadResult marks missing database configuration as unavailable", async () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  let readCalled = false;

  try {
    const result = await publicDbReadResult(
      async () => {
        readCalled = true;
        return 12;
      },
      0,
    );

    assert.deepEqual(result, { status: "unavailable", data: 0 });
    assert.equal(readCalled, false);
    assert.equal(await publicDbRead(async () => 12, 0), 0);
  } finally {
    restoreDatabaseUrl(originalDatabaseUrl);
  }
});

function restoreDatabaseUrl(value) {
  if (value === undefined) {
    delete process.env.DATABASE_URL;
    return;
  }

  process.env.DATABASE_URL = value;
}
