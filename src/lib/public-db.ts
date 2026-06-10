import { Prisma } from "@prisma/client";

export type PublicDbReadResult<T> =
  | { status: "available"; data: T }
  | { status: "unavailable"; data: T };

export async function publicDbRead<T>(read: () => Promise<T>, fallback: T) {
  const result = await publicDbReadResult(read, fallback);
  return result.data;
}

export async function publicDbReadResult<T>(read: () => Promise<T>, fallback: T): Promise<PublicDbReadResult<T>> {
  if (!hasRuntimeDatabaseUrl()) return { status: "unavailable", data: fallback };

  try {
    return { status: "available", data: await read() };
  } catch (error) {
    if (isDatabaseUnavailableError(error)) return { status: "unavailable", data: fallback };
    throw error;
  }
}

function hasRuntimeDatabaseUrl() {
  return Boolean(
    process.env.PRISMA_RUNTIME_DATABASE_URL ||
      process.env.POSTGRES_PRISMA_URL ||
      process.env.POSTGRES_URL ||
      process.env.DATABASE_URL,
  );
}

function isDatabaseUnavailableError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? error.code : undefined;
  const message = error instanceof Error ? error.message : "";

  return (
    code === "P2037" ||
    (error instanceof Prisma.PrismaClientInitializationError &&
      [
        "Can't reach database server",
        "Too many database connections opened",
        "too many connections",
        "remaining connection slots are reserved",
      ].some((unavailableMessage) => message.includes(unavailableMessage)))
  );
}
