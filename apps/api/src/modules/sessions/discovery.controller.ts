import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import { DiscoveryService, type BookDiscoveryCallDto } from './discovery.service.js';

@Public()
@Controller('meetings/discovery')
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Public()
  @Get('slots')
  getSlots(
    @Query('date') date: string,
    @Query('timezone') timezone?: string,
  ) {
    const targetDate = date || new Date().toISOString().split('T')[0]!;
    return this.discoveryService.getAvailableSlots(targetDate, timezone);
  }

  @Public()
  @Post('book')
  bookSlot(@Body() body: BookDiscoveryCallDto) {
    return this.discoveryService.bookDiscoveryCall(body);
  }
}

@Public()
@Controller('sessions/discovery')
export class SessionsDiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Public()
  @Get('slots')
  getSlots(
    @Query('date') date: string,
    @Query('timezone') timezone?: string,
  ) {
    const targetDate = date || new Date().toISOString().split('T')[0]!;
    return this.discoveryService.getAvailableSlots(targetDate, timezone);
  }

  @Public()
  @Post('book')
  bookSlot(@Body() body: BookDiscoveryCallDto) {
    return this.discoveryService.bookDiscoveryCall(body);
  }
}
