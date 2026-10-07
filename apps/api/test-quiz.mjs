import fetch from 'node-fetch';

async function run() {
  const payload = {
    stepId: "ee42f24d-6217-4d5c-afd9-63327cda9485",
    passMark: 80,
    maxAttempts: 3,
    cooldownHours: 24,
    questionCount: 1,
    questions: {
      create: [{
        text: "who are you",
        options: {
          create: [{ text: "you me", isCorrect: true }]
        }
      }]
    }
  };

  const res = await fetch('http://localhost:4000/quizzes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Get a super admin token by hitting auth/login or passing one manually
    },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  console.log(`Status: ${res.status}`);
  console.log(`Body: ${text}`);
}

run();
