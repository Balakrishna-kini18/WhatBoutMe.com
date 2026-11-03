import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '@prisma/client';
import { DiscoveryService, type BookDiscoveryCallDto } from './discovery.service.js';

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

  @Post('accept')
  acceptCall(@Body() body: { sessionId?: string; leadId?: string }, @Req() req: any) {
    return this.discoveryService.acceptDiscoveryCall(body, req?.user);
  }

  @Post(':sessionId/accept')
  acceptCallByParam(@Param('sessionId') sessionId: string, @Req() req: any) {
    return this.discoveryService.acceptDiscoveryCall({ sessionId }, req?.user);
  }

  @Post('decline')
  declineCall(@Body() body: { sessionId?: string; leadId?: string; reason?: string }, @Req() req: any) {
    return this.discoveryService.declineDiscoveryCall(body, req?.user);
  }

  @Post(':sessionId/decline')
  declineCallByParam(@Param('sessionId') sessionId: string, @Body() body: { reason?: string }, @Req() req: any) {
    return this.discoveryService.declineDiscoveryCall({ sessionId, reason: body?.reason }, req?.user);
  }
}

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

  @Post('accept')
  acceptCall(@Body() body: { sessionId?: string; leadId?: string }, @Req() req: any) {
    return this.discoveryService.acceptDiscoveryCall(body, req?.user);
  }

  @Post(':sessionId/accept')
  acceptCallByParam(@Param('sessionId') sessionId: string, @Req() req: any) {
    return this.discoveryService.acceptDiscoveryCall({ sessionId }, req?.user);
  }

  @Post('decline')
  declineCall(@Body() body: { sessionId?: string; leadId?: string; reason?: string }, @Req() req: any) {
    return this.discoveryService.declineDiscoveryCall(body, req?.user);
  }

  @Post(':sessionId/decline')
  declineCallByParam(@Param('sessionId') sessionId: string, @Body() body: { reason?: string }, @Req() req: any) {
    return this.discoveryService.declineDiscoveryCall({ sessionId, reason: body?.reason }, req?.user);
  }
}
