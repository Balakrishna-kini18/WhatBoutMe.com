import { PrismaClient, ContentType, ContentStatus, ReleaseSchedule } from '@prisma/client';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const prisma = new PrismaClient();

const SAMPLE_VIDEOS = [
  'https://res.cloudinary.com/demo/video/upload/elephants.mp4',
  'https://res.cloudinary.com/demo/video/upload/sea_turtle.mp4',
  'https://res.cloudinary.com/demo/video/upload/dog.mp4',
  'https://vjs.zencdn.net/v/oceans.mp4',
  'https://www.w3schools.com/html/mov_bbb.mp4',
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
];

const STEP_DEFINITIONS = [
  { sequence: 1, title: 'Step 1: Awakening Self-Awareness', subtitle: 'Self-Awareness' },
  { sequence: 2, title: 'Step 2: Unpacking Core Values', subtitle: 'Core Values & Principles' },
  { sequence: 3, title: 'Step 3: Emotional Resilience & Regulation', subtitle: 'Emotional Resilience' },
  { sequence: 4, title: 'Step 4: Personal Boundary Architecture', subtitle: 'Healthy Boundaries' },
  { sequence: 5, title: 'Step 5: Relational Dynamics & Communication', subtitle: 'Authentic Communication' },
  { sequence: 6, title: 'Step 6: Cultivating Empathy & Active Listening', subtitle: 'Empathy & Deep Listening' },
  { sequence: 7, title: 'Step 7: Overcoming Limiting Beliefs', subtitle: 'Cognitive Reframing' },
  { sequence: 8, title: 'Step 8: Constructive Conflict Navigation', subtitle: 'Conflict Navigation' },
  { sequence: 9, title: 'Step 9: Aligning Purpose & Career Vision', subtitle: 'Purpose & Vision' },
  { sequence: 10, title: 'Step 10: Sustainable Habit Loops & Mindfulness', subtitle: 'Habit Mastery' },
  { sequence: 11, title: 'Step 11: Integration, Final Review & Future Self', subtitle: 'Integration & Mastery' },
];

async function main() {
  console.log('--- Seeding 33 Dummy Content Videos Across 11 Steps ---');

  // 1. Locate all programs or find/create the canonical program
  let programs = await prisma.program.findMany();

  if (programs.length === 0) {
    const defaultProgram = await prisma.program.create({
      data: {
        title: '11 Steps to U',
        slug: '11-steps-to-u',
        description: 'Flagship 11-Step Brain Health & Emotional Resilience Certification Journey.',
        price: 995.0,
        status: ContentStatus.PUBLISHED,
        hasCertificate: true,
        certificateTemplate: 'CERT_TEMPLATE_STANDARD_V1',
        minAttendancePercentage: 75,
      },
    });
    programs = [defaultProgram];
    console.log(`Created default flagship program: ${defaultProgram.title}`);
  }

  for (const program of programs) {
    console.log(`\nProcessing Program: "${program.title}" (ID: ${program.id})`);

    let totalVideosSeededForProgram = 0;

    for (const stepDef of STEP_DEFINITIONS) {
      // Find or create Step
      const step = await prisma.step.upsert({
        where: {
          programId_sequence: {
            programId: program.id,
            sequence: stepDef.sequence,
          },
        },
        update: {
          title: stepDef.title,
          status: ContentStatus.PUBLISHED,
          releaseSchedule: ReleaseSchedule.IMMEDIATE,
        },
        create: {
          programId: program.id,
          sequence: stepDef.sequence,
          title: stepDef.title,
          description: `Comprehensive video curriculum and reflective practices for ${stepDef.subtitle}.`,
          status: ContentStatus.PUBLISHED,
          releaseSchedule: ReleaseSchedule.IMMEDIATE,
        },
      });

      // Clear old dummy videos for this step if any to avoid unbounded duplicates
      await prisma.lesson.deleteMany({
        where: {
          stepId: step.id,
          type: ContentType.VIDEO,
        },
      });

      // Insert exactly 3 content videos for this step
      const part1Video = SAMPLE_VIDEOS[(stepDef.sequence * 3 - 3) % SAMPLE_VIDEOS.length];
      const part2Video = SAMPLE_VIDEOS[(stepDef.sequence * 3 - 2) % SAMPLE_VIDEOS.length];
      const part3Video = SAMPLE_VIDEOS[(stepDef.sequence * 3 - 1) % SAMPLE_VIDEOS.length];

      await prisma.lesson.createMany({
        data: [
          {
            stepId: step.id,
            title: `Part 1: Foundations & Core Concepts of ${stepDef.subtitle}`,
            type: ContentType.VIDEO,
            mediaUrl: part1Video,
            durationSec: 720, // 12 mins
            order: 1,
            status: ContentStatus.PUBLISHED,
            content: `Core foundations, scientific underpinnings, and introductory models for ${stepDef.title}.`,
          },
          {
            stepId: step.id,
            title: `Part 2: Deep-Dive Principles & Real-World Case Studies`,
            type: ContentType.VIDEO,
            mediaUrl: part2Video,
            durationSec: 900, // 15 mins
            order: 2,
            status: ContentStatus.PUBLISHED,
            content: `Practical application, real-world scenario analysis, and breakdown for ${stepDef.subtitle}.`,
          },
          {
            stepId: step.id,
            title: `Part 3: Daily Implementation & Reflective Mastery`,
            type: ContentType.VIDEO,
            mediaUrl: part3Video,
            durationSec: 600, // 10 mins
            order: 3,
            status: ContentStatus.PUBLISHED,
            content: `Action plan, habit formation cues, and self-assessment guide for ${stepDef.subtitle}.`,
          },
        ],
      });

      totalVideosSeededForProgram += 3;
      console.log(`  ✓ Step ${stepDef.sequence}: Seeded 3 video lessons (Total program videos: ${totalVideosSeededForProgram})`);
    }

    console.log(`\n🎉 Successfully seeded ${totalVideosSeededForProgram} video lessons (3 per step × 11 steps) for "${program.title}"!`);
  }
}

main()
  .catch((e) => {
    console.error('Error seeding 33 dummy videos:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
