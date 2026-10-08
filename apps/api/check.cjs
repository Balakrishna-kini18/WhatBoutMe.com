const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const progs = await prisma.program.findMany();
  console.log('Programs:', progs.map(p => ({ id: p.id, title: p.title, status: p.status })));
  
  const batches = await prisma.batch.findMany();
  console.log('Batches:', batches.map(b => ({ id: b.id, name: b.name, status: b.status })));
}

main().finally(() => prisma.$disconnect());
