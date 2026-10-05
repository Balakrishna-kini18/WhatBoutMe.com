/**
 * Adds the flagship course from the Brain Matters brochure.
 *
 * Safe to run more than once: it only creates the programme and its eleven
 * steps if they are missing, and never touches users, batches or enrolments.
 *
 *   cd apps/api && npx tsx prisma/seed-brochure.ts
 *
 * The brochure gives no price, so the programme is created hidden with a price
 * of 0. Set the real price and make it active from the admin before launch.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Website details travel inside the description (see admin "Website Details").
const DESCRIPTION = `Three days, six hours a day. Not a seminar you sit through. It is a structured walk through your own truth, with neuroscience as the map and lived experience as the proof that the map works.

Type: Certification
Duration: 3 days
For: Individuals · Teams · Leaders
In person: 3 days · 6 hrs/day · Certified, 25 CPD hours
Online: 3 days · 6 hrs/day · Certified, 25 CPD hours

What it covers:
- 11 modules, each closing with a short quiz
- A final exam drawn from the full programme
- Modules unlock in sequence, with no skipping ahead
- Attendance across all three days is tracked
- A closing 1:1 call with Roweena before certification
- 25 CPD hours awarded on completion`;

// The brochure names five of the eleven steps; the rest are numbered until
// their titles are supplied.
const NAMED_STEPS: Record<number, string> = {
  1: 'Truth',
  3: 'Acceptance',
  5: 'Neuroscience',
  7: 'Confidence',
  11: 'Purpose',
};

async function main() {
  const program = await prisma.program.upsert({
    where: { slug: '11-steps-to-you' },
    update: {},
    create: {
      title: '11 Steps to You Programme',
      slug: '11-steps-to-you',
      description: DESCRIPTION,
      price: 0,
      isActive: false,
      hasCertificate: true,
    },
  });

  for (let sequence = 1; sequence <= 11; sequence++) {
    await prisma.step.upsert({
      where: { programId_sequence: { programId: program.id, sequence } },
      update: {},
      create: {
        programId: program.id,
        sequence,
        title: NAMED_STEPS[sequence] ?? `Step ${sequence}`,
      },
    });
  }

  console.log(`Programme ready: ${program.title} (${program.id}), 11 steps.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
