import fetch from 'node-fetch';

const API_URL = 'http://localhost:4000';

async function run() {
  console.log('--- STARTING BASELINE MEASUREMENT ---');
  
  // 1. Login
  const t0 = performance.now();
  const loginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'super@whatboutme.com', password: 'Learner@2026' })
  });
  const t1 = performance.now();
  const loginData: any = await loginRes.json();
  const token = loginData.access_token;
  
  const loginSize = JSON.stringify(loginData).length;
  const loginQueries = loginRes.headers.get('x-prisma-queries') || '0';
  
  console.log(`[LOGIN] Time: ${(t1 - t0).toFixed(2)}ms | Size: ${loginSize} bytes | Queries: ${loginQueries}`);
  
  if (!token) {
    console.error('Failed to login', loginData);
    return;
  }

  const headers = { Authorization: `Bearer ${token}` };

  const endpoints = [
    '/auth/me',
    '/users',
    '/programs',
    '/batches',
  ];

  for (const ep of endpoints) {
    const start = performance.now();
    const res = await fetch(`${API_URL}${ep}`, { headers });
    const end = performance.now();
    
    const text = await res.text();
    const size = Buffer.byteLength(text, 'utf8');
    const queries = res.headers.get('x-prisma-queries') || '0';
    
    console.log(`[${ep}] Time: ${(end - start).toFixed(2)}ms | Size: ${(size / 1024).toFixed(2)} KB | Queries: ${queries}`);
  }

  // Dashboard Concurrent Load
  const dStart = performance.now();
  const [usersRes, batchesRes] = await Promise.all([
    fetch(`${API_URL}/users`, { headers }),
    fetch(`${API_URL}/batches`, { headers })
  ]);
  const dEnd = performance.now();
  
  const uText = await usersRes.text();
  const bText = await batchesRes.text();
  
  const uQueries = parseInt(usersRes.headers.get('x-prisma-queries') || '0', 10);
  const bQueries = parseInt(batchesRes.headers.get('x-prisma-queries') || '0', 10);
  
  console.log(`[Dashboard Load] Time: ${(dEnd - dStart).toFixed(2)}ms | Total Size: ${((Buffer.byteLength(uText) + Buffer.byteLength(bText)) / 1024).toFixed(2)} KB | Total Queries: ${uQueries + bQueries}`);
}

run().catch(console.error);
