import { Module } from '@nestjs/common';
import { UsersController } from './users.controller.js';
import { AdminDashboardController } from './admin-dashboard.controller.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [UsersController, AdminDashboardController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
