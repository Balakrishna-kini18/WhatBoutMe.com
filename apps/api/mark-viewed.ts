import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const stepId = 'ee42f24d-6217-4d5c-afd9-63327cda9485';
  
  // Get the lessons
  const lessons = await prisma.lesson.findMany({
    where: { stepId, status: 'PUBLISHED' }
  });

  // Get the enrolments for this program
  const step = await prisma.step.findUnique({ where: { id: stepId } });
  const enrolments = await prisma.enrolment.findMany({
    where: { programId: step.programId }
  });

  for (const enrol of enrolments) {
    for (const lesson of lessons) {
      await prisma.userLessonProgress.upsert({
        where: {
          enrolmentId_lessonId: {
            enrolmentId: enrol.id,
            lessonId: lesson.id
          }
        },
        create: {
          enrolmentId: enrol.id,
          lessonId: lesson.id,
          viewed: true
        },
        update: {
          viewed: true
        }
      });
    }
  }
  console.log("Marked lessons as viewed for all enrolments.");
  process.exit(0);
}

run();
