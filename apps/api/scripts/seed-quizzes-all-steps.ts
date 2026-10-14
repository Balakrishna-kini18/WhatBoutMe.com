import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Redis } from '@upstash/redis';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const prisma = new PrismaClient();

const QUESTIONS_DATA = [
  {
    text: "What is the foundational principle for applying this step's core concepts effectively?",
    points: 1,
    explanation: 'Consistent self-reflection and actionable daily practice form the bedrock of lasting personal development.',
    options: [
      {
        text: 'Consistent self-reflection and actionable application in daily practice.',
        isCorrect: true,
      },
      {
        text: 'Relying strictly on passive reading without personal reflection or application.',
        isCorrect: false,
      },
      {
        text: 'Postponing action until all external conditions are completely free of obstacles.',
        isCorrect: false,
      },
      {
        text: 'Disregarding constructive feedback and avoiding personal accountability.',
        isCorrect: false,
      },
    ],
  },
  {
    text: 'How does developing self-awareness and emotional regulation impact decision-making?',
    points: 1,
    explanation: 'Self-awareness and emotional regulation provide clarity, reduce impulsivity, and support grounded leadership.',
    options: [
      {
        text: 'It enhances clarity, reduces reactive responses, and fosters thoughtful leadership.',
        isCorrect: true,
      },
      {
        text: 'It causes automatic impulsive reactions to unexpected challenges.',
        isCorrect: false,
      },
      {
        text: 'It eliminates the need to consider diverse viewpoints or stakeholder input.',
        isCorrect: false,
      },
      {
        text: 'It prioritizes temporary comfort over meaningful long-term progress.',
        isCorrect: false,
      },
    ],
  },
  {
    text: 'What is the primary indicator of successful progression and mastery in this module?',
    points: 1,
    explanation: 'True mastery is reflected in sustained behavioral growth and purposeful daily engagement with the concepts.',
    options: [
      {
        text: 'Demonstrating sustained behavioral growth and meaningful engagement with the material.',
        isCorrect: true,
      },
      {
        text: 'Rushing through lessons without retaining or applying the material.',
        isCorrect: false,
      },
      {
        text: 'Memorizing concepts without translating them into practical actions.',
        isCorrect: false,
      },
      {
        text: 'Keeping thoughts and insights entirely passive without practical implementation.',
        isCorrect: false,
      },
    ],
  },
];

async function main() {
  console.log('--- Starting Seed: Quizzes for All Steps across All Programs ---');

  const programs = await prisma.program.findMany({
    include: {
      steps: {
        orderBy: { sequence: 'asc' },
      },
    },
  });

  console.log(`Found ${programs.length} programs to process.`);
  let totalQuizzesConfigured = 0;
  let totalQuestionsCreated = 0;

  for (const prog of programs) {
    console.log(`\nProcessing Program "${prog.title}" (ID: ${prog.id}) with ${prog.steps.length} steps...`);

    for (const step of prog.steps) {
      // 1. Upsert Quiz record for step
      const quiz = await prisma.quiz.upsert({
        where: { stepId: step.id },
        create: {
          stepId: step.id,
          title: `${step.title} Knowledge Check`,
          passMark: 60,
          maxAttempts: 5,
          cooldownHours: 0,
          questionCount: 3,
        },
        update: {
          title: `${step.title} Knowledge Check`,
          passMark: 60,
          maxAttempts: 5,
          cooldownHours: 0,
          questionCount: 3,
        },
      });

      // 2. Clean up any existing attempts and questions for this quiz to ensure fresh, clean 3 uniform questions
      await prisma.attempt.deleteMany({
        where: { quizId: quiz.id },
      });

      await prisma.question.deleteMany({
        where: {
          OR: [
            { quizId: quiz.id },
            { stepId: step.id },
          ],
        },
      });

      // 3. Create the 3 uniform questions for this quiz
      for (let qIdx = 0; qIdx < QUESTIONS_DATA.length; qIdx++) {
        const qDef = QUESTIONS_DATA[qIdx];
        await prisma.question.create({
          data: {
            quizId: quiz.id,
            stepId: step.id,
            type: 'MULTIPLE_CHOICE',
            points: qDef.points,
            text: qDef.text,
            explanation: qDef.explanation,
            options: {
              create: qDef.options.map((opt, optIdx) => ({
                text: opt.text,
                isCorrect: opt.isCorrect,
                order: optIdx + 1,
              })),
            },
          },
        });
        totalQuestionsCreated++;
      }

      totalQuizzesConfigured++;
      console.log(`  -> Configured Quiz for Step #${step.sequence} "${step.title}" (${quiz.id}) with 3 questions.`);
    }
  }

  console.log(`\nSuccessfully configured ${totalQuizzesConfigured} quizzes and ${totalQuestionsCreated} questions across all steps!`);

  // Invalidate Redis cache if available
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    try {
      const redis = new Redis({ url, token });
      await redis.incr('ns_version:programs');
      await redis.incr('ns_version:quizzes');
      console.log('Successfully invalidated Redis cache namespaces: programs, quizzes');
    } catch (err: any) {
      console.warn('Could not invalidate Redis cache:', err.message);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
