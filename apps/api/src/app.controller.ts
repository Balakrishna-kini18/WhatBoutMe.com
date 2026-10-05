import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';
import { Public } from './common/decorators/public.decorator.js';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    @InjectQueue('email') private readonly emailQueue: Queue
  ) {}

  @Public()
  @Get()
  getHello() {
    return this.appService.getHello();
  }

  @Public()
  @Get('test-email')
  async testEmail() {
    await this.emailQueue.add('send-email', {
      to: 'gagan@foxwel.ai',
      subject: 'Welcome to WhatBoutMe! (Realworld Test from Endpoint)',
      template: 'SignupWelcomeEmail',
      props: {
        firstName: 'Gagan',
        loginUrl: 'https://whatboutme.com/login'
      }
    });
    return { success: true, message: 'Email job successfully queued to BullMQ.' };
  }
}

