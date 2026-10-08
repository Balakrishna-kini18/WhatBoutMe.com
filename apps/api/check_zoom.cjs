const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const sessions = await prisma.session.findMany({
    select: {
      id: true,
      title: true,
      joinUrl: true,
      hostUrl: true,
      meetingProvider: true
    }
  });
  console.log(sessions);
}

main().finally(() => prisma.$disconnect());
