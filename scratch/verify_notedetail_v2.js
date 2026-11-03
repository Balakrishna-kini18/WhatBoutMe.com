const WebSocket = require('C:/Users/lenovo/Desktop/WhatBoutMe.com/node_modules/ws');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');

const env = fs.readFileSync('apps/api/.env', 'utf8');
const secret = env.match(/JWT_SECRET="?([^"\s\r\n]+)/)[1];

function signJwt(payload, secret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(header + '.' + body).digest('base64url');
  return header + '.' + body + '.' + signature;
}

const { PrismaClient } = require('C:/Users/lenovo/Desktop/WhatBoutMe.com/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const user = await prisma.user.findFirst({
    where: { email: 'gagan.cs22@sahyadri.edu.in' }
  });

  // Clear previous test sessions to avoid single-device limit conflict
  await prisma.userSession.deleteMany({ where: { userId: user.id } });

  const session = await prisma.userSession.create({
    data: {
      userId: user.id,
      token: 'session_clean_verify_' + Date.now(),
      ipAddress: '127.0.0.1',
      userAgent: 'Chrome Verification Runner',
      expiresAt: new Date(Date.now() + 86400000)
    }
  });

  const token = signJwt({
    sub: user.id,
    sessionId: session.id,
    email: user.email,
    name: user.name,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + 86400 * 30
  }, secret);

  const profileDir = 'C:\\Users\\lenovo\\Desktop\\WhatBoutMe.com\\temp-chrome-prof-v2-clean';
  if (fs.existsSync(profileDir)) {
    fs.rmSync(profileDir, { recursive: true, force: true });
  }

  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9277',
    '--remote-allow-origins=*',
    `--user-data-dir=${profileDir}`,
    'about:blank'
  ]);

  async function waitForChrome(port, maxTries = 30) {
    for (let i = 0; i < maxTries; i++) {
      try {
        const data = await new Promise((resolve, reject) => {
          const req = http.get('http://127.0.0.1:' + port + '/json/list', (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(JSON.parse(body)));
          });
          req.on('error', reject);
        });
        const page = data.find(t => t.type === 'page');
        if (page && page.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
      } catch {
        await new Promise(r => setTimeout(r, 200));
      }
    }
    throw new Error('Chrome did not start debugging port in time');
  }

  const wsUrl = await waitForChrome(9277);
  const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.on('open', r));

  function send(method, params = {}) {
    return new Promise((res, rej) => {
      const id = Math.floor(Math.random() * 100000);
      const h = (d) => {
        const m = JSON.parse(d);
        if (m.id === id) { ws.removeListener('message', h); res(m.result); }
      };
      ws.on('message', h);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');

  const artifactDir = 'C:/Users/lenovo/.gemini/antigravity/brain/8e9c9d42-7dee-49b9-a2e1-76089e776c77';
  const noteId = 'd7fe406b-8fe4-47c6-bcff-58b7d50b6e85';
  const url = `http://localhost:3003/notes/${noteId}`;

  // 1. Seed auth
  await send('Page.navigate', { url: 'http://localhost:3003/notes' });
  await new Promise(r => setTimeout(r, 2000));
  await send('Runtime.evaluate', {
    expression: `
      localStorage.setItem('token', '${token}');
      localStorage.setItem('user', JSON.stringify({ id: '${user.id}', name: '${user.name}', email: '${user.email}', role: '${user.role}' }));
      localStorage.setItem('wbm_push_prompt_dismissed', 'true');
    `
  });

  // 2. Set mobile 375x812
  console.log('Navigating to mobile note editor...');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 375,
    height: 812,
    deviceScaleFactor: 2,
    mobile: true
  });
  await send('Page.navigate', { url });

  // Wait for note editor to be fully loaded
  let loaded = false;
  for (let i = 0; i < 50; i++) {
    const res = await send('Runtime.evaluate', {
      expression: 'Boolean(document.querySelector("div[role=\'textbox\']") || document.querySelector("input[value*=\'sfsdd\']"))',
      returnByValue: true
    });
    if (res?.result?.value) {
      console.log('Note editor loaded successfully on mobile 375!');
      loaded = true;
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  if (!loaded) {
    console.error('Note editor failed to load in time, current text:');
    const textRes = await send('Runtime.evaluate', {
      expression: 'document.body.innerText',
      returnByValue: true
    });
    console.error(textRes?.result?.value);
  }
  await new Promise(r => setTimeout(r, 1000));

  let shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${artifactDir}/mobile-notedetail-375-v2.png`, Buffer.from(shot.data, 'base64'));

  // 3. Narrow mobile 320
  console.log('Capturing mobile 320...');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 320,
    height: 640,
    deviceScaleFactor: 2,
    mobile: true
  });
  await new Promise(r => setTimeout(r, 600));
  shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${artifactDir}/mobile-notedetail-320-v2.png`, Buffer.from(shot.data, 'base64'));

  // 4. Tablet 768
  console.log('Capturing tablet 768...');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 768,
    height: 1024,
    deviceScaleFactor: 2,
    mobile: false
  });
  await new Promise(r => setTimeout(r, 600));
  shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${artifactDir}/tablet-notedetail-768-v2.png`, Buffer.from(shot.data, 'base64'));

  // 5. Desktop 1440
  console.log('Capturing desktop 1440...');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1.5,
    mobile: false
  });
  await new Promise(r => setTimeout(r, 600));
  shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${artifactDir}/desktop-notedetail-1440-v2.png`, Buffer.from(shot.data, 'base64'));

  console.log('ALL SCREENSHOTS CAPTURED CLEANLY!');
  ws.close();
  chrome.kill();
  await prisma.$disconnect();
}

run().catch(console.error);
