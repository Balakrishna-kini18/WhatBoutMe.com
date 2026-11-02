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

async function main() {
  const user = await prisma.user.findFirst({ where: { email: 'gagan.cs22@sahyadri.edu.in' } });
  const session = await prisma.userSession.create({
    data: {
      userId: user.id,
      token: 'diag2_' + Date.now(),
      ipAddress: '127.0.0.1',
      userAgent: 'Diag',
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

  const res = await fetch('http://localhost:4000/notes', {
    headers: { Authorization: 'Bearer ' + token }
  });
  console.log('Status:', res.status);
  const data = await res.json();
  console.log('Returned notes:', Array.isArray(data) ? data.map(n => ({ id: n.id, title: n.title })) : data);
  await prisma.$disconnect();
}

main().catch(console.error);
