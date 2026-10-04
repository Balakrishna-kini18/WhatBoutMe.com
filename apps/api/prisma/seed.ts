import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database with dummy data...');

  // Create Users
  const passwordHash = await bcrypt.hash('Learner@2026', 12);

  const superAdmin = await prisma.user.upsert({
    where: { email: 'super@whatboutme.com' },
    update: {},
    create: {
      email: 'super@whatboutme.com',
      name: 'Super Admin',
      passwordHash,
      role: 'SUPER_ADMIN',
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@whatboutme.com' },
    update: {},
    create: {
      email: 'admin@whatboutme.com',
      name: 'System Admin',
      passwordHash,
      role: 'ADMIN',
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: 'manager@whatboutme.com' },
    update: {},
    create: {
      email: 'manager@whatboutme.com',
      name: 'Batch Manager',
      passwordHash,
      role: 'MANAGER',
    },
  });

  const learner1 = await prisma.user.upsert({
    where: { email: 'learner1@whatboutme.com' },
    update: {},
    create: {
      email: 'learner1@whatboutme.com',
      name: 'Alice Learner',
      passwordHash,
      role: 'USER',
    },
  });

  const learner2 = await prisma.user.upsert({
    where: { email: 'learner2@whatboutme.com' },
    update: {},
    create: {
      email: 'learner2@whatboutme.com',
      name: 'Bob Learner',
      passwordHash,
      role: 'USER',
    },
  });

  // Create Programs
  const program1 = await prisma.program.upsert({
    where: { slug: 'resilience-masterclass' },
    update: {},
    create: {
      title: 'Resilience Masterclass',
      slug: 'resilience-masterclass',
      description: 'Learn how to bounce back from adversity and build inner strength.',
      price: 299.99,
      steps: {
        create: [
          {
            title: 'Week 1: Foundations of Resilience',
            sequence: 1,
            lessons: {
              create: [
                { title: 'Understanding Stress', type: 'VIDEO', mediaUrl: 'https://stream.mux.com/test1.m3u8', durationSec: 900 },
                { title: 'Mindfulness Basics', type: 'VIDEO', mediaUrl: 'https://stream.mux.com/test2.m3u8', durationSec: 1200 },
              ]
            }
          }
        ]
      }
    },
  });

  const program2 = await prisma.program.upsert({
    where: { slug: 'leadership-skills' },
    update: {},
    create: {
      title: 'Leadership Skills for the Future',
      slug: 'leadership-skills',
      description: 'Master the soft skills required for modern leadership roles.',
      price: 499.99,
    },
  });

  // Create Batches
  const batch1 = await prisma.batch.create({
    data: {
      name: 'Resilience Cohort Alpha',
      programId: program1.id,
      managerId: manager.id,
      startDate: new Date(),
      capacity: 50,
      sessions: {
        create: [
          {
            title: 'Kickoff Call',
            startTime: new Date(Date.now() + 86400000), // Tomorrow
            endTime: new Date(Date.now() + 86400000 + 3600000), // +1 hour
            joinUrl: 'https://zoom.us/j/123456789',
          },
          {
            title: 'Q&A Session',
            startTime: new Date(Date.now() + 86400000 * 3), // +3 days
            endTime: new Date(Date.now() + 86400000 * 3 + 3600000),
          }
        ]
      }
    }
  });

  const batch2 = await prisma.batch.create({
    data: {
      name: 'Leadership Cohort Beta',
      programId: program2.id,
      managerId: admin.id,
      startDate: new Date(Date.now() + 86400000 * 14), // +14 days
      capacity: 30,
    }
  });

  const enrolment1 = await prisma.enrolment.upsert({
    where: {
      userId_programId: {
        userId: learner1.id,
        programId: program1.id,
      }
    },
    update: {},
    create: {
      userId: learner1.id,
      programId: program1.id,
      batchId: batch1.id,
      status: 'ACTIVE',
    }
  });

  const enrolment2 = await prisma.enrolment.upsert({
    where: {
      userId_programId: {
        userId: learner2.id,
        programId: program1.id,
      }
    },
    update: {},
    create: {
      userId: learner2.id,
      programId: program1.id,
      batchId: batch1.id,
      status: 'ACTIVE',
    }
  });

  // Create Payments & Invoices
  const payment1 = await prisma.payment.create({
    data: {
      enrolmentId: enrolment1.id,
      stripeSessionId: 'cs_test_dummy_1',
      amount: 299.99,
      status: 'succeeded',
      invoice: {
        create: {
          invoiceNumber: 'INV-0001',
          amount: 299.99,
          status: 'PAID',
          pdfUrl: 'https://whatboutme.com/invoices/INV-0001.pdf',
        }
      }
    }
  });

  const payment2 = await prisma.payment.create({
    data: {
      enrolmentId: enrolment2.id,
      stripeSessionId: 'cs_test_dummy_2',
      amount: 299.99,
      status: 'succeeded',
      invoice: {
        create: {
          invoiceNumber: 'INV-0002',
          amount: 299.99,
          status: 'PAID',
          pdfUrl: 'https://whatboutme.com/invoices/INV-0002.pdf',
        }
      }
    }
  });

  // Create Quiz
  // First, find a step to attach the quiz to
  const stepToQuiz = await prisma.step.findFirst({
    where: { programId: program1.id, sequence: 1 }
  });

  if (stepToQuiz) {
    const quizExists = await prisma.quiz.findUnique({
      where: { stepId: stepToQuiz.id }
    });
    
    if (!quizExists) {
      await prisma.quiz.create({
        data: {
          stepId: stepToQuiz.id,
          passMark: 75,
          questions: {
            create: [
              {
                text: 'What is the main cause of stress?',
                options: {
                  create: [
                    { text: 'Lack of sleep', isCorrect: false },
                    { text: 'Work pressure', isCorrect: false },
                    { text: 'Perception of a threat', isCorrect: true },
                  ]
                }
              },
              {
                text: 'Which of the following is a mindfulness technique?',
                options: {
                  create: [
                    { text: 'Deep breathing', isCorrect: true },
                    { text: 'Multitasking', isCorrect: false },
                    { text: 'Ignoring emotions', isCorrect: false },
                  ]
                }
              }
            ]
          }
        }
      });
    }
  }

  console.log('Seeding complete! You can now log in with the following users:');
  console.log('- super@whatboutme.com (SUPER_ADMIN)');
  console.log('- admin@whatboutme.com (ADMIN)');
  console.log('- manager@whatboutme.com (MANAGER)');
  console.log('- learner1@whatboutme.com (USER)');
  console.log('- learner2@whatboutme.com (USER)');
  console.log('All passwords are: Learner@2026');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
