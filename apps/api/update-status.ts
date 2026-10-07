import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
prisma.$transaction([
  prisma.step.updateMany({
    where: { status: 'DRAFT' },
    data: { status: 'PUBLISHED' }
  }),
  prisma.lesson.updateMany({
    where: { status: 'DRAFT' },
    data: { status: 'PUBLISHED' }
  })
]).then(() => {
  console.log("Updated steps and lessons to PUBLISHED");
  process.exit(0);
});
