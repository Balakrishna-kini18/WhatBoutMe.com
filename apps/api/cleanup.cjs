const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Cleaning up archived batches...");
  const batches = await prisma.batch.findMany({ where: { status: 'ARCHIVED' } });
  for (const batch of batches) {
    console.log("Hard deleting batch:", batch.name);
    await prisma.batch.delete({ where: { id: batch.id } });
  }

  console.log("Cleaning up archived programs...");
  const progs = await prisma.program.findMany({ where: { status: 'ARCHIVED' } });
  
  for (const prog of progs) {
    console.log("Hard deleting program:", prog.title);
    
    // Delete any remaining batches for this program first just in case
    await prisma.batch.deleteMany({ where: { programId: prog.id } });

    await prisma.program.delete({ where: { id: prog.id } });
  }
}

main().finally(() => prisma.$disconnect());
