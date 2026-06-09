import { Prisma } from "@prisma/client";

export type PublicDbReadResult<T> =
  | { status: "available"; data: T }
  | { status: "unavailable"; data: T };

export async function publicDbRead<T>(read: () => Promise<T>, fallback: T) {
  const result = await publicDbReadResult(read, fallback);
  return result.data;
}

export async function publicDbReadResult<T>(read: () => Promise<T>, fallback: T): Promise<PublicDbReadResult<T>> {
  if (!process.env.DATABASE_URL) return { status: "unavailable", data: fallback };

  try {
    return { status: "available", data: await read() };
  } catch (error) {
    if (isDatabaseUnavailableError(error)) return { status: "unavailable", data: fallback };
    throw error;
  }
}

function isDatabaseUnavailableError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientInitializationError &&
    error.message.includes("Can't reach database server")
  );
}
