import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";

const { publicDbRead, publicDbReadResult } = await import("../src/lib/public-db.ts");

test("publicDbReadResult returns available data from successful reads", async () => {
  const originalRuntimeEnv = saveRuntimeDatabaseEnv();
  resetRuntimeDatabaseEnv();
  process.env.DATABASE_URL = "postgresql://flowlink:flowlink@127.0.0.1:5432/flow_link";

  try {
    const result = await publicDbReadResult(async () => 12, 0);

    assert.deepEqual(result, { status: "available", data: 12 });
  } finally {
    restoreRuntimeDatabaseEnv(originalRuntimeEnv);
  }
});

test("publicDbReadResult marks missing database configuration as unavailable", async () => {
  const originalRuntimeEnv = saveRuntimeDatabaseEnv();
  resetRuntimeDatabaseEnv();
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
    restoreRuntimeDatabaseEnv(originalRuntimeEnv);
  }
});

test("publicDbReadResult accepts a pooled runtime database URL without DATABASE_URL", async () => {
  const originalRuntimeEnv = saveRuntimeDatabaseEnv();
  resetRuntimeDatabaseEnv();
  process.env.PRISMA_RUNTIME_DATABASE_URL = "postgresql://flowlink_runtime:flowlink@127.0.0.1:5432/flow_link";

  try {
    const result = await publicDbReadResult(async () => 12, 0);

    assert.deepEqual(result, { status: "available", data: 12 });
  } finally {
    restoreRuntimeDatabaseEnv(originalRuntimeEnv);
  }
});

test("publicDbReadResult falls back for Prisma connection exhaustion", async () => {
  const originalRuntimeEnv = saveRuntimeDatabaseEnv();
  resetRuntimeDatabaseEnv();
  process.env.DATABASE_URL = "postgresql://flowlink:flowlink@127.0.0.1:5432/flow_link";

  try {
    const tooManyConnections = new Prisma.PrismaClientInitializationError(
      'Too many database connections opened: FATAL: too many connections for role "prisma_migration"',
      "6.19.0",
    );

    assert.deepEqual(
      await publicDbReadResult(
        async () => {
          throw tooManyConnections;
        },
        [],
      ),
      { status: "unavailable", data: [] },
    );

    assert.deepEqual(
      await publicDbReadResult(
        async () => {
          const error = new Error("remaining connection slots are reserved for roles with the SUPERUSER attribute");
          error.code = "P2037";
          throw error;
        },
        0,
      ),
      { status: "unavailable", data: 0 },
    );
  } finally {
    restoreRuntimeDatabaseEnv(originalRuntimeEnv);
  }
});

function saveRuntimeDatabaseEnv() {
  return {
    DATABASE_URL: process.env.DATABASE_URL,
    POSTGRES_PRISMA_URL: process.env.POSTGRES_PRISMA_URL,
    POSTGRES_URL: process.env.POSTGRES_URL,
    PRISMA_RUNTIME_DATABASE_URL: process.env.PRISMA_RUNTIME_DATABASE_URL,
  };
}

function resetRuntimeDatabaseEnv() {
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_PRISMA_URL;
  delete process.env.POSTGRES_URL;
  delete process.env.PRISMA_RUNTIME_DATABASE_URL;
}

function restoreRuntimeDatabaseEnv(values) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}
