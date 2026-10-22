"use client";

import React from "react";
import LearnerPortalFlow, { type StepModule, type Lesson } from "../../../components/LearnerPortalFlow";

export type { Lesson };

export interface Step extends StepModule {}

export interface Step8ModulePreviewProps {
  module: Step;
  onBackToEdit: () => void;
  onContinueToReview: () => void;
}

export default function Step8ModulePreview({
  module,
  onBackToEdit,
  onContinueToReview,
}: Step8ModulePreviewProps) {
  return (
    <LearnerPortalFlow
      module={module}
      courseTitle="Executive Leadership & Emotional Mastery (CPD 25h)"
      cohortName="Sigma 1 — Cohort 1"
      totalStepsCount={12}
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
