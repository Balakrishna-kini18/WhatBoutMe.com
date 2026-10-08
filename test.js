fetch('http://localhost:4000/auth/admin-login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: "manager@whatboutme.com", password: "Learner@2026" })
}).then(r => r.json()).then(console.log);
