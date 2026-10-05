import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello() {
    return {
      status: 'ok',
      service: 'WhatBoutMe Backend API',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      endpoints: {
        programs: '/programs',
        auth: {
          login: '/auth/login',
          signup: '/auth/signup',
          adminLogin: '/auth/admin-login',
          session: '/auth/session',
          me: '/auth/me',
        },
        batches: '/batches',
        sessions: '/sessions',
        quizzes: '/quizzes',
        certificates: '/certificates',
        invoices: '/invoices',
        revenue: '/revenue',
      },
    };
  }
}

