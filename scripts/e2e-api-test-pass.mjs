import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const dotenv = require('dotenv');
const crypto = require('node:crypto');
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../apps/api/.env') });

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  }
});

const BASE_URL = 'http://127.0.0.1:4000';

function decryptTotpSecret(encryptedString) {
  const key = Buffer.from(process.env.TOTP_ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex');
  const [ivHex, tagHex, encryptedHex] = encryptedString.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Decode(str) {
  const cleaned = str.toUpperCase().replace(/=+$/, '').replace(/[\s-]+/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (idx === -1) throw new Error(`Invalid Base32 char: ${cleaned[i]}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function generateHotp(secret, counter) {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binary % 1_000_000).toString().padStart(6, '0');
}

function generateTotp(secret, timeMs = Date.now(), stepSeconds = 30) {
  const counter = Math.floor(timeMs / 1000 / stepSeconds);
  return generateHotp(secret, counter);
}

const results = [];
const slowEndpoints = [];

async function apiRequest(name, method, path, options = {}) {
  const { headers = {}, body, token, expectedStatus } = options;
  const reqHeaders = { 'Content-Type': 'application/json', ...headers };
  if (token) {
    reqHeaders['Authorization'] = `Bearer ${token}`;
  }

  const start = Date.now();
  let status = null;
  let data = null;
  let error = null;

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: reqHeaders,
      body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    });
    status = res.status;
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  } catch (err) {
    error = err.message;
  }
  const duration = Date.now() - start;

  let passed = false;
  if (Array.isArray(expectedStatus)) {
    passed = expectedStatus.includes(status);
  } else if (expectedStatus) {
    passed = status === expectedStatus;
  } else {
    passed = status >= 200 && status < 300;
  }

  const resultItem = {
    name,
    method,
    path,
    status,
    expectedStatus,
    duration,
    passed,
    error,
    dataPreview: typeof data === 'object' ? JSON.stringify(data).slice(0, 150) : String(data).slice(0, 150),
    fullData: data,
  };
  results.push(resultItem);

  if (duration > 1000) {
    slowEndpoints.push({ name, method, path, duration });
  }

  const symbol = passed ? '✅' : '❌';
  console.log(`${symbol} [${status || 'ERR'}] ${method} ${path} (${duration}ms) - ${name}`);
  if (!passed) {
    if (error) console.log(`   Fetch Error:`, error);
    console.log(`   Expected: ${expectedStatus}, Got: ${status}`);
    console.log(`   Response:`, typeof data === 'object' ? JSON.stringify(data).slice(0, 300) : data);
  }

  return { status, data, duration, passed };
}

async function run() {
  console.log('====================================================');
  console.log('🚀 STARTING FULL E2E API VERIFICATION PASS');
  console.log('====================================================\n');

  // 1. Root and Health
  console.log('--- 1. SYSTEM CONNECTIVITY & HEALTH ---');
  await apiRequest('Service info root', 'GET', '/', { expectedStatus: 200 });
  await apiRequest('Health check', 'GET', '/health', { expectedStatus: 200 });

  // 2. Authentication Flow
  console.log('\n--- 2. AUTHENTICATION & SESSIONS ---');
  // Learner login valid
  const learnerLogin = await apiRequest('Learner Login with valid credentials', 'POST', '/auth/login', {
    body: { email: 'learner1@whatboutme.com', password: 'Learner@2026' },
    expectedStatus: 201,
  });
  const learnerToken = learnerLogin.data?.access_token;
  const learnerRefreshToken = learnerLogin.data?.refresh_token;

  // Learner login invalid password
  await apiRequest('Learner Login with invalid password', 'POST', '/auth/login', {
    body: { email: 'learner1@whatboutme.com', password: 'WrongPassword' },
    expectedStatus: 401,
  });

  // Learner 2 login
  const learner2Login = await apiRequest('Learner 2 Login with valid credentials', 'POST', '/auth/login', {
    body: { email: 'learner2@whatboutme.com', password: 'Learner@2026' },
    expectedStatus: 201,
  });
  const learner2Token = learner2Login.data?.access_token;

  // Manager login (No 2FA required for manager)
  const managerLogin = await apiRequest('Manager Login via /auth/admin-login', 'POST', '/auth/admin-login', {
    body: { email: 'manager@whatboutme.com', password: 'Learner@2026' },
    expectedStatus: 201,
  });
  const managerToken = managerLogin.data?.access_token;

  // Admin Login with 2FA Challenge
  const adminLoginStep1 = await apiRequest('Admin Login Step 1 (triggers 2FA challenge)', 'POST', '/auth/admin-login', {
    body: { email: 'admin@whatboutme.com', password: 'Learner@2026' },
    expectedStatus: 201,
  });
  const adminTempToken = adminLoginStep1.data?.tempToken;

  // 2FA Verify with invalid code
  await apiRequest('2FA Verify with invalid code (rejection)', 'POST', '/auth/2fa/verify', {
    body: { tempToken: adminTempToken, code: '000000' },
    expectedStatus: 401,
  });

  // 2FA Verify with valid code
  const adminDb = await prisma.user.findUnique({ where: { email: 'admin@whatboutme.com' } });
  const adminSecret = decryptTotpSecret(adminDb.twoFactorSecret);
  const adminTotp = generateTotp(adminSecret);

  const admin2faVerify = await apiRequest('2FA Verify with valid TOTP code', 'POST', '/auth/2fa/verify', {
    body: { tempToken: adminTempToken, code: adminTotp },
    expectedStatus: 201,
  });
  const adminToken = admin2faVerify.data?.access_token;

  // SuperAdmin Login with 2FA
  const superLoginStep1 = await apiRequest('SuperAdmin Login Step 1', 'POST', '/auth/admin-login', {
    body: { email: 'super@whatboutme.com', password: 'Learner@2026' },
    expectedStatus: 201,
  });
  const superDb = await prisma.user.findUnique({ where: { email: 'super@whatboutme.com' } });
  const superSecret = decryptTotpSecret(superDb.twoFactorSecret);
  const superTotp = generateTotp(superSecret);
  const super2faVerify = await apiRequest('SuperAdmin 2FA Verify', 'POST', '/auth/2fa/verify', {
    body: { tempToken: superLoginStep1.data?.tempToken, code: superTotp },
    expectedStatus: 201,
  });
  const superToken = super2faVerify.data?.access_token;

  // Learner attempting admin-login -> 401 or 403 Forbidden
  await apiRequest('Learner attempting /auth/admin-login (forbidden)', 'POST', '/auth/admin-login', {
    body: { email: 'learner1@whatboutme.com', password: 'Learner@2026' },
    expectedStatus: [401, 403],
  });

  // Unauthenticated protected endpoint -> 401
  await apiRequest('Protected GET /auth/me without token (unauthorized)', 'GET', '/auth/me', {
    expectedStatus: 401,
  });

  // Invalid JWT -> 401
  await apiRequest('Protected GET /auth/me with bogus token (unauthorized)', 'GET', '/auth/me', {
    token: 'bogus-invalid-token',
    expectedStatus: 401,
  });

  // Valid JWT on GET /auth/me
  await apiRequest('GET /auth/me with Learner token', 'GET', '/auth/me', {
    token: learnerToken,
    expectedStatus: 200,
  });
  await apiRequest('GET /auth/me with Admin token', 'GET', '/auth/me', {
    token: adminToken,
    expectedStatus: 200,
  });

  // Session check
  await apiRequest('GET /auth/session with valid token', 'GET', '/auth/session', {
    token: learnerToken,
    expectedStatus: 200,
  });

  // Token refresh
  if (learnerRefreshToken) {
    await apiRequest('POST /auth/refresh with valid refresh token', 'POST', '/auth/refresh', {
      body: { refresh_token: learnerRefreshToken },
      expectedStatus: 201,
    });
  }

  // 3. User & Role Permissions
  console.log('\n--- 3. USER MANAGEMENT & ROLE RESTRICTIONS ---');
  // Learner accessing /users -> 403
  await apiRequest('Learner accessing GET /users (role restricted)', 'GET', '/users', {
    token: learnerToken,
    expectedStatus: 403,
  });

  // Manager accessing /users -> 200
  await apiRequest('Manager accessing GET /users', 'GET', '/users', {
    token: managerToken,
    expectedStatus: 200,
  });

  // Admin accessing /users -> 200
  const usersPage1 = await apiRequest('Admin GET /users?page=1&limit=20', 'GET', '/users?page=1&limit=20', {
    token: adminToken,
    expectedStatus: 200,
  });

  // Pagination verification
  console.log('\n--- 4. USERS PAGINATION & SEARCH VERIFICATION ---');
  const p1 = await apiRequest('GET /users?page=1&limit=3', 'GET', '/users?page=1&limit=3', {
    token: adminToken,
    expectedStatus: 200,
  });
  const p2 = await apiRequest('GET /users?page=2&limit=3', 'GET', '/users?page=2&limit=3', {
    token: adminToken,
    expectedStatus: 200,
  });

  if (p1.data?.data && p2.data?.data) {
    const ids1 = new Set(p1.data.data.map(u => u.id));
    const ids2 = new Set(p2.data.data.map(u => u.id));
    const overlap = [...ids1].filter(id => ids2.has(id));
    const isDisjoint = overlap.length === 0;
    console.log(`   Pagination verification: Page 1 count=${ids1.size}, Page 2 count=${ids2.size}, Overlap=${overlap.length}`);
    results.push({
      name: 'Users pagination disjoint sets (no duplicate or omitted items)',
      method: 'GET',
      path: '/users?page=1..2&limit=3',
      status: isDisjoint ? 200 : 500,
      expectedStatus: 200,
      passed: isDisjoint,
      duration: 0,
      dataPreview: `Overlap IDs: ${overlap.join(', ')}`,
    });
  }

  // Search filter
  await apiRequest('GET /users?search=learner1 (search filter)', 'GET', '/users?search=learner1', {
    token: adminToken,
    expectedStatus: 200,
  });

  // Role filter
  await apiRequest('GET /users?role=USER (role filter)', 'GET', '/users?role=USER', {
    token: adminToken,
    expectedStatus: 200,
  });

  // Find user by ID
  const testUserId = adminDb.id;
  await apiRequest(`GET /users/${testUserId}`, 'GET', `/users/${testUserId}`, {
    token: adminToken,
    expectedStatus: 200,
  });

  // Get user active sessions
  await apiRequest(`GET /users/${testUserId}/sessions`, 'GET', `/users/${testUserId}/sessions`, {
    token: adminToken,
    expectedStatus: 200,
  });

  // POST /users validation (invalid payload)
  await apiRequest('POST /users with invalid payload (missing email)', 'POST', '/users', {
    token: adminToken,
    body: { name: 'No Email User' },
    expectedStatus: 400,
  });

  // 5. Manager Batch Scoping & BatchAccessGuard
  console.log('\n--- 5. BATCH ACCESS & MANAGER BATCH SCOPING ---');
  const assignedBatchId = '654a580b-c706-4a11-8799-9ff7bbb33173'; // Assigned to manager@whatboutme.com
  const unassignedBatchId = '52e356d6-0354-4660-ac02-781d83e34cee'; // Not assigned to manager@whatboutme.com

  // Manager accessing assigned batch -> 200 OK
  await apiRequest(`Manager accessing ASSIGNED batch (${assignedBatchId})`, 'GET', `/batches/${assignedBatchId}`, {
    token: managerToken,
    expectedStatus: 200,
  });

  // Manager accessing UNASSIGNED batch -> 403 Forbidden
  await apiRequest(`Manager accessing UNASSIGNED batch (${unassignedBatchId}) - scoping guard`, 'GET', `/batches/${unassignedBatchId}`, {
    token: managerToken,
    expectedStatus: 403,
  });

  // Admin accessing unassigned batch -> 200 OK (unrestricted)
  await apiRequest(`Admin accessing batch (${unassignedBatchId}) - unrestricted access`, 'GET', `/batches/${unassignedBatchId}`, {
    token: adminToken,
    expectedStatus: 200,
  });

  // Learner accessing batch -> 403 Forbidden (no BATCHES_READ permission)
  await apiRequest(`Learner accessing batch (${assignedBatchId}) - forbidden`, 'GET', `/batches/${assignedBatchId}`, {
    token: learnerToken,
    expectedStatus: 403,
  });

  // 6. Programs Domain
  console.log('\n--- 6. PROGRAMS & CONTENT STUDIO ---');
  // Public GET /programs
  await apiRequest('Public GET /programs', 'GET', '/programs', {
    expectedStatus: 200,
  });

  // Learner GET /programs
  await apiRequest('Learner GET /programs', 'GET', '/programs', {
    token: learnerToken,
    expectedStatus: 200,
  });

  // Admin GET /programs (includes drafts)
  await apiRequest('Admin GET /programs', 'GET', '/programs', {
    token: adminToken,
    expectedStatus: 200,
  });

  const existingProg = await prisma.program.findFirst();
  const testProgId = existingProg.id;

  // GET /programs/:id
  await apiRequest(`GET /programs/${testProgId}`, 'GET', `/programs/${testProgId}`, {
    expectedStatus: 200,
  });

  // GET /programs/:id/steps
  await apiRequest(`GET /programs/${testProgId}/steps`, 'GET', `/programs/${testProgId}/steps`, {
    expectedStatus: 200,
  });

  // Learner creating program -> 403 Forbidden
  await apiRequest('Learner POST /programs (forbidden)', 'POST', '/programs', {
    token: learnerToken,
    body: { title: 'Unauthorized Program' },
    expectedStatus: 403,
  });

  // Admin creating program -> 201 Created
  const createdProg = await apiRequest('Admin POST /programs (create test program)', 'POST', '/programs', {
    token: adminToken,
    body: { title: 'Automated E2E Verification Program', description: 'Temporary testing program', price: 0 },
    expectedStatus: 201,
  });
  const tempProgId = createdProg.data?.id;

  if (tempProgId) {
    // Admin creating step
    const createdStep = await apiRequest(`Admin POST /programs/${tempProgId}/steps (create step)`, 'POST', `/programs/${tempProgId}/steps`, {
      token: adminToken,
      body: { title: 'Step 1 - Test Introduction', sequence: 1 },
      expectedStatus: 201,
    });
    const tempStepId = createdStep.data?.id;

    if (tempStepId) {
      // Admin creating lesson
      await apiRequest(`Admin POST /programs/steps/${tempStepId}/lessons`, 'POST', `/programs/steps/${tempStepId}/lessons`, {
        token: adminToken,
        body: { title: 'Lesson 1.1 Intro Video', type: 'VIDEO', mediaUrl: 'https://cloudinary.com/sample.mp4', durationSec: 180 },
        expectedStatus: 201,
      });

      // GET /programs/steps/:stepId/lessons
      await apiRequest(`GET /programs/steps/${tempStepId}/lessons`, 'GET', `/programs/steps/${tempStepId}/lessons`, {
        token: adminToken,
        expectedStatus: 200,
      });
    }

    // Publish program
    await apiRequest(`PATCH /programs/${tempProgId}/publish`, 'PATCH', `/programs/${tempProgId}/publish`, {
      token: adminToken,
      body: { status: 'PUBLISHED' },
      expectedStatus: 200,
    });

    // Cleanup test program
    await apiRequest(`DELETE /programs/${tempProgId}`, 'DELETE', `/programs/${tempProgId}`, {
      token: adminToken,
      expectedStatus: 200,
    });
  }

  // 7. Enrolments Domain
  console.log('\n--- 7. ENROLMENTS DOMAIN ---');
  // Admin list enrolments
  await apiRequest('Admin GET /admin/enrolments', 'GET', '/admin/enrolments', {
    token: adminToken,
    expectedStatus: 200,
  });

  // Learner list admin enrolments -> 403 Forbidden
  await apiRequest('Learner GET /admin/enrolments (forbidden)', 'GET', '/admin/enrolments', {
    token: learnerToken,
    expectedStatus: 403,
  });

  // Learner GET /enrolments/me
  const myEnrolments = await apiRequest('Learner GET /enrolments/me', 'GET', '/enrolments/me', {
    token: learnerToken,
    expectedStatus: 200,
  });

  // 8. Progression Domain
  console.log('\n--- 8. PROGRESSION DOMAIN ---');
  const learner1EnrolmentId = 'dd342d41-4baf-4ea6-9ea3-652fce8a0730';
  const progAlphaId = '52b65003-2c5f-4aac-8be2-2b27b14d2a82';

  // Learner GET /progression/me/:programId
  await apiRequest(`Learner GET /progression/me/${progAlphaId}`, 'GET', `/progression/me/${progAlphaId}`, {
    token: learnerToken,
    expectedStatus: 200,
  });

  // Admin GET /progression/enrolments/:enrolmentId
  await apiRequest(`Admin GET /progression/enrolments/${learner1EnrolmentId}`, 'GET', `/progression/enrolments/${learner1EnrolmentId}`, {
    token: adminToken,
    expectedStatus: 200,
  });

  // Admin recalculate progression
  await apiRequest(`Admin POST /progression/admin/enrolments/${learner1EnrolmentId}/recalculate`, 'POST', `/progression/admin/enrolments/${learner1EnrolmentId}/recalculate`, {
    token: adminToken,
    expectedStatus: 201,
  });

  // Learner recalculate -> 403 Forbidden
  await apiRequest('Learner POST /progression/admin/recalculate (forbidden)', 'POST', `/progression/admin/enrolments/${learner1EnrolmentId}/recalculate`, {
    token: learnerToken,
    expectedStatus: 403,
  });

  // 9. Agreements Domain
  console.log('\n--- 9. AGREEMENTS DOMAIN ---');
  // Admin list templates
  await apiRequest('Admin GET /admin/agreement-templates', 'GET', '/admin/agreement-templates', {
    token: adminToken,
    expectedStatus: 200,
  });

  // Learner list admin templates -> 403 Forbidden
  await apiRequest('Learner GET /admin/agreement-templates (forbidden)', 'GET', '/admin/agreement-templates', {
    token: learnerToken,
    expectedStatus: 403,
  });

  // Learner get active version for program
  await apiRequest(`Learner GET /agreements/program/${progAlphaId}/active`, 'GET', `/agreements/program/${progAlphaId}/active`, {
    token: learnerToken,
    expectedStatus: [200, 404], // 404 if no agreement template linked to program yet
  });

  // 10. Sessions & Live Scheduling
  console.log('\n--- 10. SESSIONS & TIMEZONE HANDLING ---');
  // GET /sessions with query
  await apiRequest('GET /sessions (list sessions)', 'GET', '/sessions', {
    token: adminToken,
    expectedStatus: 200,
  });

  // Admin GET /sessions/all
  await apiRequest('Admin GET /sessions/all', 'GET', '/sessions/all', {
    token: adminToken,
    expectedStatus: 200,
  });

  // Learner GET /sessions/mine (D1-045 Timezone Handling)
  const mySessions = await apiRequest('Learner GET /sessions/mine (with profile displayTime)', 'GET', '/sessions/mine', {
    token: learnerToken,
    expectedStatus: 200,
  });

  // Verify displayTime structure if sessions exist
  if (Array.isArray(mySessions.data) && mySessions.data.length > 0) {
    const s = mySessions.data[0];
    const hasDisplayTime = Boolean(s.displayTime?.start?.timezone);
    console.log(`   Session displayTime check: timezone=${s.displayTime?.start?.timezone}, formatted=${s.displayTime?.start?.display}`);
    results.push({
      name: 'D1-045 Session displayTime enriched with profile timezone',
      method: 'GET',
      path: '/sessions/mine',
      status: hasDisplayTime ? 200 : 500,
      expectedStatus: 200,
      passed: hasDisplayTime,
      duration: 0,
      dataPreview: JSON.stringify(s.displayTime?.start),
    });
  }

  // Learner creating session -> 403 Forbidden
  await apiRequest('Learner POST /sessions (forbidden)', 'POST', '/sessions', {
    token: learnerToken,
    body: { title: 'Unauthorized Session' },
    expectedStatus: 403,
  });

  // 11. Booking, Reschedule, Cancellation
  console.log('\n--- 11. BOOKING, RESCHEDULE & CANCELLATION ---');
  // Learner get bookings
  await apiRequest('Learner GET /sessions/my/bookings', 'GET', '/sessions/my/bookings', {
    token: learnerToken,
    expectedStatus: 200,
  });

  // Business rule: Learner booking non-existent or past session -> 404 / 400
  await apiRequest('Learner booking invalid session ID (rejection)', 'POST', '/sessions/00000000-0000-0000-0000-000000000000/book', {
    token: learnerToken,
    expectedStatus: [400, 404],
  });

  // 12. Attendance Domain
  console.log('\n--- 12. ATTENDANCE & COMPLIANCE ---');
  // Learner portal visit
  await apiRequest('Learner POST /attendance/visit (portal check-in)', 'POST', '/attendance/visit', {
    token: learnerToken,
    expectedStatus: 201,
  });

  // Learner GET /attendance/mine
  await apiRequest('Learner GET /attendance/mine', 'GET', '/attendance/mine', {
    token: learnerToken,
    expectedStatus: 200,
  });

  // D1-049: Attendance Compliance for enrolment (Staff check)
  await apiRequest(`Admin GET /attendance/compliance/${learner1EnrolmentId}`, 'GET', `/attendance/compliance/${learner1EnrolmentId}`, {
    token: adminToken,
    expectedStatus: 200,
  });

  // Learner accessing OWN compliance -> 200 OK
  await apiRequest(`Learner GET /attendance/compliance (own enrolment)`, 'GET', `/attendance/compliance/${learner1EnrolmentId}`, {
    token: learnerToken,
    expectedStatus: 200,
  });

  // Learner accessing OTHER learner enrolment -> 403 Forbidden (IDOR prevented!)
  const otherEnrolmentId = 'df5a2a7c-00be-4808-8b65-da535ea1adf3'; // Belongs to learner2
  await apiRequest(`Learner GET /attendance/compliance (other learner enrolment - IDOR prevented)`, 'GET', `/attendance/compliance/${otherEnrolmentId}`, {
    token: learnerToken,
    expectedStatus: 403,
  });

  // D1-050: Manual Attendance Override
  // Learner attempting override -> 403 Forbidden
  await apiRequest('Learner PATCH /attendance/override (forbidden)', 'PATCH', '/attendance/00000000-0000-0000-0000-000000000000/override', {
    token: learnerToken,
    body: { status: 'PRESENT_MANUAL', correctionReason: 'Testing' },
    expectedStatus: 403,
  });

  // Admin manual attendance override on non-existent record -> 404 Not Found
  await apiRequest('Admin PATCH /attendance/override with non-existent ID (404)', 'PATCH', '/attendance/00000000-0000-0000-0000-000000000000/override', {
    token: adminToken,
    body: { status: 'PRESENT_MANUAL', correctionReason: 'Admin corrected' },
    expectedStatus: [400, 404],
  });

  // 13. Attendance Reconciliation & Unmatched Records (D1-048b)
  console.log('\n--- 13. ATTENDANCE RECONCILIATION & UNMATCHED RECORDS ---');
  const existingSession = await prisma.session.findFirst();
  const testSessionId = existingSession?.id || '8d3336fb-fb18-40d8-961b-325e21e6cb94';

  // GET unmatched attendance for session (Staff)
  await apiRequest(`Admin GET /sessions/${testSessionId}/unmatched-attendance`, 'GET', `/sessions/${testSessionId}/unmatched-attendance`, {
    token: adminToken,
    expectedStatus: 200,
  });

  // Learner GET unmatched attendance -> 403 Forbidden
  await apiRequest(`Learner GET /sessions/${testSessionId}/unmatched-attendance (forbidden)`, 'GET', `/sessions/${testSessionId}/unmatched-attendance`, {
    token: learnerToken,
    expectedStatus: 403,
  });

  // Resolve unmatched attendance with non-existent ID -> 400/404
  await apiRequest(`Admin PATCH resolve unmatched attendance (400/404 for non-existent)`, 'PATCH', `/sessions/${testSessionId}/unmatched-attendance/00000000-0000-0000-0000-000000000000/resolve`, {
    token: adminToken,
    body: { enrolmentId: learner1EnrolmentId },
    expectedStatus: [400, 404],
  });

  // Learner resolve unmatched attendance -> 403 Forbidden
  await apiRequest(`Learner PATCH resolve unmatched attendance (forbidden)`, 'PATCH', `/sessions/${testSessionId}/unmatched-attendance/00000000-0000-0000-0000-000000000000/resolve`, {
    token: learnerToken,
    body: { enrolmentId: learner1EnrolmentId },
    expectedStatus: 403,
  });

  // 14. Zoom Webhook & Synchronization
  console.log('\n--- 14. ZOOM WEBHOOK & SYNCHRONIZATION ---');
  // Zoom missing signature headers -> 401
  await apiRequest('POST /webhooks/zoom without signature headers (unauthorized)', 'POST', '/webhooks/zoom', {
    body: { event: 'meeting.started' },
    expectedStatus: 401,
  });

  // Zoom invalid signature -> 401
  await apiRequest('POST /webhooks/zoom with invalid signature (unauthorized)', 'POST', '/webhooks/zoom', {
    headers: {
      'x-zm-signature': 'v0=invalid-signature',
      'x-zm-request-timestamp': '1600000000',
    },
    body: { event: 'meeting.started' },
    expectedStatus: 401,
  });

  // Zoom URL validation challenge with valid signature
  const secretToken = process.env.ZOOM_WEBHOOK_SECRET_TOKEN || 't_jL-WFwRGyGAqwbQmwDcQ';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const challengeBody = {
    event: 'endpoint.url_validation',
    payload: { plainToken: 'zoom-challenge-token-xyz' },
  };
  const rawMessage = `v0:${timestamp}:${JSON.stringify(challengeBody)}`;
  const validSignature = `v0=${crypto.createHmac('sha256', secretToken).update(rawMessage).digest('hex')}`;

  const zoomChallengeRes = await apiRequest('POST /webhooks/zoom URL validation challenge', 'POST', '/webhooks/zoom', {
    headers: {
      'x-zm-signature': validSignature,
      'x-zm-request-timestamp': timestamp,
    },
    body: challengeBody,
    expectedStatus: 201,
  });

  if (zoomChallengeRes.data?.encryptedToken) {
    const expectedEncrypted = crypto.createHmac('sha256', secretToken).update('zoom-challenge-token-xyz').digest('hex');
    const isEncryptedCorrect = zoomChallengeRes.data.encryptedToken === expectedEncrypted;
    console.log(`   Zoom challenge verification: correct HMAC=${isEncryptedCorrect}`);
    results.push({
      name: 'Zoom webhook URL validation challenge response encryption',
      method: 'POST',
      path: '/webhooks/zoom',
      status: isEncryptedCorrect ? 200 : 500,
      expectedStatus: 200,
      passed: isEncryptedCorrect,
      duration: 0,
      dataPreview: JSON.stringify(zoomChallengeRes.data),
    });
  }

  // Summary
  console.log('\n====================================================');
  console.log('📊 TEST EXECUTION SUMMARY');
  console.log('====================================================');
  const total = results.length;
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = total - passedCount;

  console.log(`Total tests run: ${total}`);
  console.log(`Passed: ${passedCount}`);
  console.log(`Failed: ${failedCount}`);

  if (slowEndpoints.length > 0) {
    console.log(`\n⚠️ SLOW REQUESTS (>1s): ${slowEndpoints.length}`);
    for (const s of slowEndpoints) {
      console.log(`- ${s.method} ${s.path} (${s.duration}ms): ${s.name}`);
    }
  } else {
    console.log('\n⚡ No slow endpoints exceeding 1000ms detected.');
  }

  await prisma.$disconnect();
}

run().catch(async (err) => {
  console.error('Test runner fatal error:', err);
  await prisma.$disconnect();
  process.exit(1);
});
