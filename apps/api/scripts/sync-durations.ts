import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const prisma = new PrismaClient();

async function main() {
  const lessons = await prisma.lesson.findMany({ select: { id: true, mediaUrl: true } });
  let count = 0;
  for (const l of lessons) {
    let dur = 46;
    if (l.mediaUrl?.includes('dog.mp4')) dur = 13;
    else if (l.mediaUrl?.includes('sea_turtle.mp4')) dur = 15;
    else if (l.mediaUrl?.includes('elephants.mp4')) dur = 16;
    else if (l.mediaUrl?.includes('mov_bbb.mp4')) dur = 10;
    else if (l.mediaUrl?.includes('flower.mp4')) dur = 5;
    else if (l.mediaUrl?.includes('oceans.mp4')) dur = 46;
    await prisma.lesson.update({ where: { id: l.id }, data: { durationSec: dur } });
    count++;
  }
  console.log(`Successfully synced real durations for ${count} lessons!`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
