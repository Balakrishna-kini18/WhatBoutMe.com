import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  console.log('Adding indexes concurrently...');
  
  try { await prisma.$executeRawUnsafe(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_role_idx" ON "User"("role")`); } catch(e) { console.log(e.message) }
  try { await prisma.$executeRawUnsafe(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "User_companyId_idx" ON "User"("companyId")`); } catch(e) { console.log(e.message) }
  
  try { await prisma.$executeRawUnsafe(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "Session_batchId_startTime_idx" ON "Session"("batchId", "startTime")`); } catch(e) { console.log(e.message) }
  try { await prisma.$executeRawUnsafe(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "Session_learnerId_idx" ON "Session"("learnerId")`); } catch(e) { console.log(e.message) }
  try { await prisma.$executeRawUnsafe(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "Session_hostTrainerId_idx" ON "Session"("hostTrainerId")`); } catch(e) { console.log(e.message) }
  
  try { await prisma.$executeRawUnsafe(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "Enrolment_batchId_status_idx" ON "Enrolment"("batchId", "status")`); } catch(e) { console.log(e.message) }
  try { await prisma.$executeRawUnsafe(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "StepProgress_enrolmentId_isCompleted_idx" ON "StepProgress"("enrolmentId", "isCompleted")`); } catch(e) { console.log(e.message) }

  console.log('Done adding indexes.');
}

run().finally(() => prisma.$disconnect());
