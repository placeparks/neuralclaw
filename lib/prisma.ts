import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __neuralclubPrisma: PrismaClient | undefined;
}

export const prisma = global.__neuralclubPrisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.__neuralclubPrisma = prisma;
}
