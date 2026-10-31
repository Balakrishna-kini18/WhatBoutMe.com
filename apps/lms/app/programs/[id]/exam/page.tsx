"use client";

import ExamPage from "../../../exams/[id]/page";

export default function ProgramExamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <ExamPage params={params} />;
}
