import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module.js';
import { Queue } from 'bullmq';
import { getQueueToken } from '@nestjs/bullmq';

async function bootstrap() {
  console.log('Bootstrapping headless app for test...');
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const emailQueue = app.get<Queue>(getQueueToken('email'));
  
  console.log('Adding test job to queue...');
  await emailQueue.add('send-email', {
    to: 'gagankunder332@gmail.com',
    subject: 'Welcome to WhatBoutMe! (Realworld Test)',
    template: 'SignupWelcomeEmail',
    props: {
      firstName: 'Gagan',
      loginUrl: 'https://whatboutme.com/login'
    }
  });

  console.log('Job successfully added to the BullMQ "email" queue.');
  console.log('Because EmailProcessor is registered in this app context, it should process immediately...');
  
  // Wait to allow processing to finish
  await new Promise(resolve => setTimeout(resolve, 8000));
  
  console.log('Test complete. Shutting down.');
  await app.close();
}

bootstrap().catch(console.error);
