"use client";

import React from "react";
import LearnerPortalFlow, { type StepModule, type Lesson } from "../../../components/LearnerPortalFlow";

export type { Lesson };

export interface Step extends StepModule {}

export interface Step8ModulePreviewProps {
  module: Step;
  allModules?: Step[];
  courseTitle?: string;
  onBackToEdit: () => void;
  onContinueToReview: () => void;
}

export default function Step8ModulePreview({
  module,
  allModules,
  courseTitle,
  onBackToEdit,
  onContinueToReview,
}: Step8ModulePreviewProps) {
  return (
    <LearnerPortalFlow
      module={module}
      allModules={allModules}
      courseTitle={courseTitle || "Executive Leadership & Emotional Mastery (CPD 25h)"}
      cohortName="Sigma 1 — Cohort 1"
      totalStepsCount={allModules && allModules.length > 0 ? allModules.length : 12}
      completedStepsCount={3}
      overallProgressPercentage={25}
      learnerName="Roweena Foxwel"
      learnerEmail="roweena@whatboutme.com"
      initialStep="MODULE_PAGE"
      onBackToEdit={onBackToEdit}
      onContinueToReview={onContinueToReview}
      isSimulatorMode={false}
    />
  );
}
