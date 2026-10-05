import type { PrismaClient } from '@prisma/client';

/** What made the learner count as present on a day. */
export type AttendanceSource = 'visited' | 'lessonDone' | 'sessionJoined';

// Days are cut in one fixed time zone so "today" means the same for everyone.
const TIME_ZONE = process.env.ATTENDANCE_TIME_ZONE || 'Asia/Dubai';

/** Today as YYYY-MM-DD in the attendance time zone. */
export function attendanceDay(at: Date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(at);
}

/**
 * Marks the learner present today for the given reason. Never throws:
 * attendance is a side effect and must not fail a sign-in or a lesson.
 */
export async function markDailyAttendance(
  prisma: Pick<PrismaClient, 'dailyAttendance'>,
  userId: string,
  source: AttendanceSource,
) {
  try {
    const date = attendanceDay();
    await prisma.dailyAttendance.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, [source]: true },
      update: { [source]: true },
    });
  } catch (error) {
    console.warn('Could not record daily attendance:', error);
  }
}
