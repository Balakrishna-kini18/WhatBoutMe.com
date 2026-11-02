const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const user = await prisma.user.findUnique({
    where: { id: "0422caee-8884-4712-b317-a738661f7580" }
  });
  console.log('Owner of note d7fe...:', user.email, user.id);
  const gagan = await prisma.user.findFirst({
    where: { email: 'gagan.cs22@sahyadri.edu.in' }
  });
  console.log('Gagan user:', gagan.email, gagan.id);
  await prisma.$disconnect();
}

check();
