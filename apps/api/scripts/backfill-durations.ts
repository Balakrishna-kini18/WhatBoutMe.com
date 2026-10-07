import { PrismaClient, ContentType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Scanning Video and Audio Lessons with Unknown Duration ---');

  const zeroDurationLessons = await prisma.lesson.findMany({
    where: {
      type: { in: [ContentType.VIDEO, ContentType.AUDIO] },
      OR: [
        { durationSec: null },
        { durationSec: 0 },
        { durationSec: { lt: 0 } },
      ],
    },
    include: {
      step: {
        select: {
          id: true,
          sequence: true,
          title: true,
          program: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (zeroDurationLessons.length === 0) {
    console.log('✓ All video and audio lessons have valid durationSec set.');
    return;
  }

  console.log(`Found ${zeroDurationLessons.length} media lessons with durationSec missing or 0:`);
  console.table(
    zeroDurationLessons.map((l) => ({
      lessonId: l.id,
      title: l.title,
      type: l.type,
      currentDuration: l.durationSec,
      program: l.step.program.title,
      stepSequence: l.step.sequence,
      mediaUrl: l.mediaUrl ? l.mediaUrl.substring(0, 40) + '...' : 'none',
    }))
  );

  console.log('\nNote: When admins edit lessons or re-upload media, durationSec is automatically captured and stored.');
}

main()
  .catch((e) => {
    console.error('Error running duration audit:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
