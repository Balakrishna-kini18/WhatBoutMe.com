"use client";

import React from "react";
import LearnerPortalFlow from "../components/LearnerPortalFlow";

export default function SimulatorPage() {
  return (
    <LearnerPortalFlow
      courseTitle="Sigma 1"
      cohortName="Sigma 1 - Cohort 1"
      learnerName="sahyadri"
      learnerEmail="sahyadri@whatboutme.com"
      initialStep="ROADMAP"
      showShell={true}
      isSimulatorMode={false}
    />
  );
}
