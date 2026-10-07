import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
prisma.lesson.findMany({
  where: { stepId: 'ee42f24d-6217-4d5c-afd9-63327cda9485' }
}).then(lessons => {
  console.log(lessons.map(l => ({ id: l.id, type: l.type, durationSec: l.durationSec, title: l.title })));
  process.exit(0);
});
