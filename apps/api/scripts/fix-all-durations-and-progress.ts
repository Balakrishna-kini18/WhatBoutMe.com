import { PrismaClient, ContentType } from '@prisma/client';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const prisma = new PrismaClient();

function getRealDuration(mediaUrl?: string | null): number {
  if (!mediaUrl) return 30;
  if (mediaUrl.includes('dog.mp4')) return 13;
  if (mediaUrl.includes('sea_turtle.mp4')) return 15;
  if (mediaUrl.includes('elephants.mp4')) return 16;
  if (mediaUrl.includes('mov_bbb.mp4')) return 10;
  if (mediaUrl.includes('flower.mp4')) return 5;
  if (mediaUrl.includes('oceans.mp4')) return 46;
  return 30;
}

async function main() {
  console.log('--- 1. Synchronizing accurate durations for ALL lessons in DB ---');
  const allLessons = await prisma.lesson.findMany({
    select: { id: true, mediaUrl: true, durationSec: true, type: true, title: true },
  });

  let updatedLessonsCount = 0;
  for (const lesson of allLessons) {
    if (lesson.type === ContentType.VIDEO || lesson.type === ContentType.AUDIO) {
      const realDur = getRealDuration(lesson.mediaUrl);
      if (lesson.durationSec !== realDur) {
        await prisma.lesson.update({
          where: { id: lesson.id },
          data: { durationSec: realDur },
        });
        updatedLessonsCount++;
      }
    }
  }
  console.log(`Updated ${updatedLessonsCount} lessons with true durations.`);

  console.log('--- 2. Fixing UserLessonProgress records with correct percentages ---');
  const allProgress = await prisma.userLessonProgress.findMany({
    include: { lesson: true },
  });

  let updatedProgressCount = 0;
  for (const p of allProgress) {
    const realDur = getRealDuration(p.lesson.mediaUrl);
    const lastPos = p.lastPositionSec ?? 0;
    const isCompleted = p.viewed || lastPos >= realDur - 2 || (realDur > 0 && lastPos / realDur >= 0.85);

    if (isCompleted && !p.viewed) {
      await prisma.userLessonProgress.update({
        where: { id: p.id },
        data: {
          viewed: true,
          progressPercent: 100,
          completedAt: p.completedAt || new Date(),
        },
      });
      updatedProgressCount++;
      console.log(`Marked lesson "${p.lesson.title}" completed for enrolment ${p.enrolmentId}`);
    } else if (p.viewed && p.progressPercent < 100) {
      await prisma.userLessonProgress.update({
        where: { id: p.id },
        data: { progressPercent: 100 },
      });
      updatedProgressCount++;
    }
  }
  console.log(`Updated ${updatedProgressCount} user lesson progress records.`);

  console.log('--- 3. Re-evaluating step completion for all active enrolments ---');
  const enrolments = await prisma.enrolment.findMany({
    include: {
      program: {
        include: {
          steps: {
            include: {
              lessons: true,
              quiz: true,
            },
          },
        },
      },
    },
  });

  for (const en of enrolments) {
    const lessonProgress = await prisma.userLessonProgress.findMany({
      where: { enrolmentId: en.id },
    });
    const completedLessonIds = new Set(
      lessonProgress.filter((lp) => lp.viewed).map((lp) => lp.lessonId)
    );

    const quizAttempts = await prisma.attempt.findMany({
      where: { enrolmentId: en.id, passed: true },
    });
    const passedQuizIds = new Set(quizAttempts.map((a) => a.quizId));

    for (const step of en.program.steps) {
      const allLessonsDone = step.lessons.length === 0 || step.lessons.every((l) => completedLessonIds.has(l.id));
      const quizDone = !step.quiz || passedQuizIds.has(step.quiz.id);
      const isStepCompleted = allLessonsDone && quizDone;

      if (isStepCompleted) {
        await prisma.stepProgress.upsert({
          where: {
            enrolmentId_stepId: {
              enrolmentId: en.id,
              stepId: step.id,
            },
          },
          create: {
            enrolmentId: en.id,
            stepId: step.id,
            isUnlocked: true,
            unlockedAt: new Date(),
            isCompleted: true,
            completedAt: new Date(),
          },
          update: {
            isCompleted: true,
            completedAt: new Date(),
          },
        });
        console.log(`Step ${step.sequence} ("${step.title}") marked completed for enrolment ${en.id}`);
      }
    }
  }

  console.log('--- ALL DURATIONS AND PROGRESSION RECORDS SYNCHRONIZED SUCCESSFULLY ---');
}

main()
  .catch((err) => {
    console.error('Fatal error in sync script:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
