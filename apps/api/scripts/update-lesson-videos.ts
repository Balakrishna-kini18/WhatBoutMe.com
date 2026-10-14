import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const prisma = new PrismaClient();

const WORKING_VIDEOS = [
  'https://res.cloudinary.com/demo/video/upload/elephants.mp4',
  'https://res.cloudinary.com/demo/video/upload/sea_turtle.mp4',
  'https://res.cloudinary.com/demo/video/upload/dog.mp4',
  'https://vjs.zencdn.net/v/oceans.mp4',
  'https://www.w3schools.com/html/mov_bbb.mp4',
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
];

async function main() {
  console.log('--- Updating all lesson video URLs in Database ---');

  const lessons = await prisma.lesson.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, title: true, mediaUrl: true, type: true },
  });

  console.log(`Found ${lessons.length} lessons in database.`);

  let updatedCount = 0;
  for (let i = 0; i < lessons.length; i++) {
    const lesson = lessons[i];
    const isVideo = lesson.type === 'VIDEO';
    const isBadUrl =
      !lesson.mediaUrl ||
      lesson.mediaUrl.includes('commondatastorage.googleapis.com') ||
      lesson.mediaUrl.includes('sample/ForBigger') ||
      lesson.mediaUrl.includes('sample/BigBuck') ||
      lesson.mediaUrl.includes('sample/Elephant');

    if (isVideo || isBadUrl) {
      const workingUrl = WORKING_VIDEOS[i % WORKING_VIDEOS.length];
      await prisma.lesson.update({
        where: { id: lesson.id },
        data: {
          mediaUrl: workingUrl,
          durationSec: 180 + (i % 5) * 60, // 3 to 7 minutes
        },
      });
      updatedCount++;
    }
  }

  console.log(`Successfully updated ${updatedCount} lessons with verified, fast CDN video URLs!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
