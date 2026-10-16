import { Module } from '@nestjs/common';
import { EventsController } from './events.controller.js';
import { AdminEventsController } from './admin-events.controller.js';
import { EventsService } from './events.service.js';

@Module({
  controllers: [EventsController, AdminEventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
