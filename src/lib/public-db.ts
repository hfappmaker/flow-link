import { Prisma } from "@prisma/client";

export async function publicDbRead<T>(read: () => Promise<T>, fallback: T) {
  if (!process.env.DATABASE_URL) return fallback;

  try {
    return await read();
  } catch (error) {
    if (isDatabaseUnavailableError(error)) return fallback;
    throw error;
  }
}

function isDatabaseUnavailableError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientInitializationError &&
    error.message.includes("Can't reach database server")
  );
}
