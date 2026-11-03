import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const p = await prisma.program.findUnique({
    where: { id: 'ed6533b7-07c4-46e8-ae1c-b3bf094ac7e4' },
    include: {
      steps: {
        include: {
          quiz: {
            include: {
              questions: {
                include: { options: true }
              }
            }
          }
        }
      }
    }
  });
  console.log('Program found:', p ? p.title : 'Not found');
  if (p) {
    for (const s of p.steps) {
      console.log('Step:', s.id, s.title, 'Quiz:', s.quiz ? { id: s.quiz.id, title: s.quiz.title, questionsCount: s.quiz.questions.length, questions: s.quiz.questions } : 'No quiz');
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());

