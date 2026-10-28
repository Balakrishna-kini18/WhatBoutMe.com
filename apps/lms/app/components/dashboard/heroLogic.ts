export function getTimeOfDayGreeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

export function formatLearnerFirstName(
  name?: string,
  fallback: string = "sahyadri"
): string {
  if (!name || !name.trim()) return fallback;
  const parts = name.trim().split(/\s+/);
  return parts[0] || fallback;
}

export function formatSupportingCourseText(activeCoursesCount: number): string {
  if (activeCoursesCount === 0) {
    return "You have 0 active courses in progress — explore your curriculum and begin your journey today.";
  }
  if (activeCoursesCount === 1) {
    return "You have 1 active course in progress — keep learning and build a better version of yourself every day.";
  }
  return `You have ${activeCoursesCount} active courses in progress — keep learning and build a better version of yourself every day.`;
}
