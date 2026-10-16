import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import { ListEventsQueryDto } from './dto/list-events-query.dto.js';
import {
  CheckoutEventDto,
  VerifyEventPaymentDto,
} from './dto/event.dto.js';
import { EventsService } from './events.service.js';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Public()
  @Get()
  listEvents(@Req() req: any, @Query() query: ListEventsQueryDto) {
    const userId = req.user?.id || req.user?.userId || req.user?.sub;
    return this.eventsService.listForPublic(query, userId);
  }

  @Public()
  @Get(':idOrSlug')
  getEvent(@Param('idOrSlug') idOrSlug: string, @Req() req: any) {
    const userId = req.user?.id || req.user?.userId || req.user?.sub;
    return this.eventsService.getForPublic(idOrSlug, userId);
  }

  @Public()
  @Post(':idOrSlug/checkout')
  checkout(
    @Param('idOrSlug') idOrSlug: string,
    @Req() req: any,
    @Body() dto: CheckoutEventDto,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.sub || null;
    return this.eventsService.checkout(idOrSlug, dto, userId);
  }

  // Alias for legacy register buttons
  @Public()
  @Post(':idOrSlug/register')
  register(
    @Param('idOrSlug') idOrSlug: string,
    @Req() req: any,
    @Body() dto: CheckoutEventDto,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.sub || null;
    return this.eventsService.checkout(idOrSlug, dto, userId);
  }

  @Public()
  @Post('verify-payment')
  verifyPayment(@Body() dto: VerifyEventPaymentDto) {
    return this.eventsService.verifyPayment(dto);
  }

  // Route alias allowing POST /events/:id/verify-payment
  @Public()
  @Post(':id/verify-payment')
  verifyPaymentForEvent(
    @Param('id') id: string,
    @Body() dto: VerifyEventPaymentDto,
  ) {
    return this.eventsService.verifyPayment({
      ...dto,
      registrationId: dto.registrationId || id,
    });
  }
}
