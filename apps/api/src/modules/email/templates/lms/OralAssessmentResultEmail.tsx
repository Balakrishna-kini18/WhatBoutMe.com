import { Button, Text, Section } from '@react-email/components';
import * as React from 'react';
import WhatBoutMeEmailLayout from '../WhatBoutMeEmailLayout.js';

interface OralAssessmentResultEmailProps {
  firstName: string;
  assessmentName: string;
  passed: boolean;
  score: string;
  feedback?: string;
  dashboardUrl: string;
}

export const OralAssessmentResultEmail = ({
  firstName = 'Student',
  assessmentName = 'Mid-Term Oral Exam',
  passed = true,
  score = '85/100',
  feedback = 'Excellent pronunciation and great use of advanced vocabulary.',
  dashboardUrl = 'https://whatboutme.com/dashboard/assessments',
}: OralAssessmentResultEmailProps) => {
  return (
    <WhatBoutMeEmailLayout previewText={`Your results for ${assessmentName} are ready`} heading="Assessment Results">
      <Text className="text-black text-[14px] leading-[24px]">
        Hi {firstName},
      </Text>
      <Text className="text-black text-[14px] leading-[24px]">
        Your instructor has finished grading your <strong>{assessmentName}</strong>. 
        Here are your results:
      </Text>
      
      <Section className={`rounded border border-solid p-[16px] my-[24px] ${passed ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
        <Text className={`text-[16px] font-bold leading-[24px] m-0 ${passed ? 'text-green-800' : 'text-red-800'}`}>
          Status: {passed ? 'PASSED 🎉' : 'NEEDS IMPROVEMENT 🔄'}
        </Text>
        <Text className="text-black text-[14px] leading-[24px] m-0 mt-[8px]"><strong>Score:</strong> {score}</Text>
        {feedback && (
          <Text className="text-black text-[14px] leading-[24px] m-0 mt-[8px]">
            <strong>Instructor Feedback:</strong><br/>
            {feedback}
          </Text>
        )}
      </Section>

      <Text className="text-black text-[14px] leading-[24px]">
        {passed 
          ? 'Great job! You have unlocked the next module in your program.' 
          : 'Don\'t worry! You can review the feedback, practice, and request a retake from your dashboard.'}
      </Text>

      <Section className="text-center mt-[32px] mb-[32px]">
        <Button
          className="bg-black rounded text-white text-[14px] font-semibold no-underline text-center px-[20px] py-[12px]"
          href={dashboardUrl}
        >
          {passed ? 'Continue Learning' : 'Schedule Retake'}
        </Button>
      </Section>
    </WhatBoutMeEmailLayout>
  );
};

export default OralAssessmentResultEmail;
