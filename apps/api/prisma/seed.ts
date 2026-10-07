import { PrismaClient, Role, ContentStatus, ReleaseSchedule, ContentType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding canonical Sprint 0 development database...');

  // 1. Password Hash for Development Users
  const passwordHash = await bcrypt.hash('Learner@2026', 10);

  // 2. Canonical Users
  const superAdmin = await prisma.user.upsert({
    where: { email: 'super@whatboutme.com' },
    update: {
      name: 'Super Admin Roweena',
      role: Role.SUPER_ADMIN,
    },
    create: {
      email: 'super@whatboutme.com',
      name: 'Super Admin Roweena',
      passwordHash,
      role: Role.SUPER_ADMIN,
      country: 'AU',
      timezone: 'Australia/Sydney',
      emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@whatboutme.com' },
    update: {
      name: 'System Admin',
      role: Role.ADMIN,
    },
    create: {
      email: 'admin@whatboutme.com',
      name: 'System Admin',
      passwordHash,
      role: Role.ADMIN,
      country: 'AU',
      timezone: 'Australia/Sydney',
      emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  });

  // Corporate Batch Manager (Role: MANAGER)
  const manager = await prisma.user.upsert({
    where: { email: 'manager@whatboutme.com' },
    update: {
      name: 'Corporate Batch Manager',
      role: Role.MANAGER,
    },
    create: {
      email: 'manager@whatboutme.com',
      name: 'Corporate Batch Manager',
      passwordHash,
      role: Role.MANAGER,
      country: 'AU',
      timezone: 'Australia/Sydney',
      emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  });

  // Cohort Trainer (Role: MANAGER)
  const trainer = await prisma.user.upsert({
    where: { email: 'trainer@whatboutme.com' },
    update: {
      name: 'Lead Cohort Trainer',
      role: Role.MANAGER,
    },
    create: {
      email: 'trainer@whatboutme.com',
      name: 'Lead Cohort Trainer',
      passwordHash,
      role: Role.MANAGER,
      country: 'AU',
      timezone: 'Australia/Sydney',
      emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  });

  // Test Learners (Role: USER)
  const learner1 = await prisma.user.upsert({
    where: { email: 'learner1@whatboutme.com' },
    update: {
      name: 'Alice Learner',
      role: Role.USER,
    },
    create: {
      email: 'learner1@whatboutme.com',
      name: 'Alice Learner',
      passwordHash,
      role: Role.USER,
      country: 'US',
      timezone: 'America/New_York',
      emailVerifiedAt: new Date('2026-02-01T00:00:00.000Z'),
    },
  });

  const learner2 = await prisma.user.upsert({
    where: { email: 'learner2@whatboutme.com' },
    update: {
      name: 'Bob Learner',
      role: Role.USER,
    },
    create: {
      email: 'learner2@whatboutme.com',
      name: 'Bob Learner',
      passwordHash,
      role: Role.USER,
      country: 'GB',
      timezone: 'Europe/London',
      emailVerifiedAt: new Date('2026-02-01T00:00:00.000Z'),
    },
  });

  console.log(`Seeded users: ${superAdmin.email}, ${admin.email}, ${manager.email}, ${trainer.email}, ${learner1.email}, ${learner2.email}`);

  // 3. Canonical Program: "11 Steps to U"
  const program = await prisma.program.upsert({
    where: { slug: '11-steps-to-u' },
    update: {
      title: '11 Steps to U',
      description: 'A transformative 11-step personal and professional development journey.',
      price: 995.0,
      status: ContentStatus.PUBLISHED,
      hasCertificate: true,
    },
    create: {
      title: '11 Steps to U',
      slug: '11-steps-to-u',
      description: 'A transformative 11-step personal and professional development journey.',
      price: 995.0,
      status: ContentStatus.PUBLISHED,
      hasCertificate: true,
      certificateTemplate: 'CERT_TEMPLATE_STANDARD_V1',
    },
  });

  console.log(`Seeded program: ${program.title} (${program.slug})`);

  // 4. Agreement Template for "11 Steps to U"
  let agreementTemplate = await prisma.agreementTemplate.findFirst({
    where: { programId: program.id },
  });

  if (!agreementTemplate) {
    agreementTemplate = await prisma.agreementTemplate.create({
      data: {
        programId: program.id,
        title: '11 Steps to U Enrollment & Code of Conduct Agreement',
        description: 'Standard code of conduct and cohort engagement terms.',
      },
    });
  }

  const templateVersion = await prisma.agreementTemplateVersion.upsert({
    where: {
      templateId_version: {
        templateId: agreementTemplate.id,
        version: 'v1.0',
      },
    },
    update: {},
    create: {
      templateId: agreementTemplate.id,
      version: 'v1.0',
      content:
        'By signing this agreement, you commit to actively participating in all scheduled cohort sessions, completing weekly reflective coursework, and adhering to strict cohort confidentiality standards.',
      changelog: 'Initial baseline version',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-04T17:51:44.248Z'),
    },
  });

  console.log(`Seeded agreement template: ${agreementTemplate.title} (${templateVersion.version})`);

  // 5. 11 Ordered Program Steps with Sample Lessons
  const stepTitles = [
    'Awakening Self-Awareness',
    'Unpacking Core Values',
    'Emotional Resilience',
    'Personal Boundary Architecture',
    'Relational Dynamics & Communication',
    'Cultivating Empathy & Active Listening',
    'Overcoming Limiting Beliefs',
    'Constructive Conflict Navigation',
    'Aligning Purpose & Career Vision',
    'Sustainable Habit Loops',
    'Integration & The Future Self',
  ];

  for (let i = 0; i < stepTitles.length; i++) {
    const sequence = i + 1;
    const title = `Step ${sequence}: ${stepTitles[i]}`;

    const step = await prisma.step.upsert({
      where: {
        programId_sequence: {
          programId: program.id,
          sequence,
        },
      },
      update: {
        title,
        status: ContentStatus.PUBLISHED,
        releaseSchedule: ReleaseSchedule.IMMEDIATE,
      },
      create: {
        programId: program.id,
        sequence,
        title,
        description: `Core curriculum and reflection exercises for ${title}.`,
        status: ContentStatus.PUBLISHED,
        releaseSchedule: ReleaseSchedule.IMMEDIATE,
      },
    });

    // Seed sample lessons for Step 1
    if (sequence === 1) {
      const existingLessons = await prisma.lesson.findMany({ where: { stepId: step.id } });
      if (existingLessons.length === 0) {
        await prisma.lesson.createMany({
          data: [
            {
              stepId: step.id,
              title: 'Introduction to Self-Awareness',
              type: ContentType.VIDEO,
              mediaUrl: 'cloudinary:sample-video-step-1',
              durationSec: 720,
              order: 1,
              status: ContentStatus.PUBLISHED,
            },
            {
              stepId: step.id,
              title: 'The Self-Reflection Framework',
              type: ContentType.TEXT,
              content: 'Read through the self-reflection framework notes and complete your daily check-in.',
              mediaUrl: 'internal://lesson-content',
              order: 2,
              status: ContentStatus.PUBLISHED,
            },
          ],
        });
      }
    }
  }

  console.log(`Seeded 11 ordered steps for program: ${program.title}`);

  // 6. Active Batch: "Cohort Alpha 2026"
  let batch = await prisma.batch.findFirst({
    where: {
      programId: program.id,
      name: 'Cohort Alpha 2026',
    },
  });

  if (!batch) {
    batch = await prisma.batch.create({
      data: {
        programId: program.id,
        name: 'Cohort Alpha 2026',
        startDate: new Date('2026-10-01T09:00:00.000Z'),
        capacity: 30,
        managerId: manager.id,
      },
    });
  }

  // Assign Lead Trainer to the Batch
  await prisma.batchTrainer.upsert({
    where: {
      batchId_trainerId: {
        batchId: batch.id,
        trainerId: trainer.id,
      },
    },
    update: {},
    create: {
      batchId: batch.id,
      trainerId: trainer.id,
    },
  });

  console.log(`Seeded active batch: ${batch.name} with manager ${manager.name} and trainer ${trainer.name}`);

  // 7. Seed Initial Cohort Session
  const existingSession = await prisma.session.findFirst({
    where: {
      batchId: batch.id,
      title: 'Cohort Kickoff & Orientation',
    },
  });

  if (!existingSession) {
    await prisma.session.create({
      data: {
        batchId: batch.id,
        title: 'Cohort Kickoff & Orientation',
        description: 'Welcome and program orientation live video call.',
        startTime: new Date('2026-10-08T18:00:00.000Z'),
        endTime: new Date('2026-10-08T19:30:00.000Z'),
        timezone: 'Australia/Sydney',
        hostTrainerId: trainer.id,
        meetingProvider: 'ZOOM',
        joinUrl: 'https://zoom.us/j/sample-orientation-meeting',
      },
    });
  }

  // 8. Test Learner Enrolments
  // Learner 1: Active enrolment with completed signed agreement
  const enrolment1 = await prisma.enrolment.upsert({
    where: {
      userId_programId: {
        userId: learner1.id,
        programId: program.id,
      },
    },
    update: {
      batchId: batch.id,
      status: 'ACTIVE',
    },
    create: {
      userId: learner1.id,
      programId: program.id,
      batchId: batch.id,
      status: 'ACTIVE',
    },
  });

  await prisma.signedAgreement.upsert({
    where: {
      enrolmentId: enrolment1.id,
    },
    update: {
      status: 'SIGNED',
      consentGiven: true,
      typedName: 'Alice Learner',
      versionId: templateVersion.id,
    },
    create: {
      enrolmentId: enrolment1.id,
      userId: learner1.id,
      programId: program.id,
      templateId: agreementTemplate.id,
      versionId: templateVersion.id,
      templateVersion: templateVersion.version,
      consentGiven: true,
      typedName: 'Alice Learner',
      signerIp: '127.0.0.1',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) TestClient',
      status: 'SIGNED',
      signedAt: new Date('2026-10-02T10:00:00.000Z'),
    },
  });

  // Learner 2: Pending Agreement state
  const enrolment2 = await prisma.enrolment.upsert({
    where: {
      userId_programId: {
        userId: learner2.id,
        programId: program.id,
      },
    },
    update: {
      batchId: batch.id,
      status: 'PENDING_AGREEMENT',
    },
    create: {
      userId: learner2.id,
      programId: program.id,
      batchId: batch.id,
      status: 'PENDING_AGREEMENT',
    },
  });

  console.log(`Seeded enrolments: Learner1 (ACTIVE + SIGNED), Learner2 (PENDING_AGREEMENT)`);
  console.log('Canonical development seed completed successfully.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
