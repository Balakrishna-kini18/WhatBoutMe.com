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

  const session = await prisma.userSession.create({
    data: {
      userId: user.id,
      token: 'debug_nd_' + Date.now(),
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

  const profileDir = 'C:\\Users\\lenovo\\Desktop\\WhatBoutMe.com\\temp-chrome-prof-dbg';
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9271',
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

  const wsUrl = await waitForChrome(9271);
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

  ws.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.method === 'Runtime.consoleAPICalled') {
      console.log('CONSOLE:', m.params.type, m.params.args.map(a => a.value || a.description));
    }
    if (m.method === 'Network.responseReceived') {
      if (m.params.response.url.includes('/notes')) {
        console.log('NETWORK /notes response status:', m.params.response.status, m.params.response.url);
      }
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');

  const noteId = 'd7fe406b-8fe4-47c6-bcff-58b7d50b6e85';
  const url = `http://localhost:3003/notes/${noteId}`;

  // Seed token
  await send('Page.navigate', { url: 'http://localhost:3003' });
  await new Promise(r => setTimeout(r, 1200));
  await send('Runtime.evaluate', {
    expression: `
      localStorage.setItem('token', '${token}');
      localStorage.setItem('user', JSON.stringify({ id: '${user.id}', name: '${user.name}', email: '${user.email}', role: '${user.role}' }));
      localStorage.setItem('wbm_push_prompt_dismissed', 'true');
    `
  });

  console.log('Navigating to note detail page...');
  await send('Page.navigate', { url });

  await new Promise(r => setTimeout(r, 3500));

  const pageState = await send('Runtime.evaluate', {
    expression: `
      (function() {
        return {
          h2: document.querySelector('h2')?.innerText,
          inputs: Array.from(document.querySelectorAll('input')).map(i => i.placeholder || i.value),
          bodyText: document.body.innerText.slice(0, 300)
        };
      })()
    `,
    returnByValue: true
  });

  console.log('PAGE STATE:', pageState?.result?.value);

  ws.close();
  chrome.kill();
  await prisma.$disconnect();
}

run().catch(console.error);

