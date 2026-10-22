const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    include: {
      enrolments: {
        include: {
          batch: true,
          program: true,
          stepProgress: true,
          lessonProgress: true,
          attempts: true
        }
      }
    }
  });

  for (const user of users) {
    if (user.enrolments && user.enrolments.length > 0) {
      console.log('=== USER:', user.id, user.name, user.email, '===');
      for (const e of user.enrolments) {
        console.log('ENROLMENT:', e.id, 'STATUS:', e.status, 'PROGRAM:', e.program.title, e.program.id);
        console.log('STEP PROGRESS:', e.stepProgress.map(sp => ({ stepId: sp.stepId, isCompleted: sp.isCompleted, isUnlocked: sp.isUnlocked })));
        console.log('LESSON PROGRESS:', e.lessonProgress.map(lp => ({ lessonId: lp.lessonId, viewed: lp.viewed, progressPercent: lp.progressPercent })));
        console.log('ATTEMPTS:', e.attempts.map(a => ({ quizId: a.quizId, status: a.status, passed: a.passed, score: a.score })));
        
        const steps = await prisma.step.findMany({
          where: { programId: e.programId },
          include: { lessons: true, quiz: true }
        });
        console.log('STEPS COUNT:', steps.length);
        for (const s of steps) {
          console.log('STEP:', s.id, s.title, 'seq:', s.sequence, 'status:', s.status, 'lessons:', s.lessons.map(l => ({ id: l.id, title: l.title, status: l.status })), 'quiz:', s.quiz?.id);
        }
      }
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
