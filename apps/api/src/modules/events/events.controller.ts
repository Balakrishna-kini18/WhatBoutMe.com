import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator.js';
import { ListEventsQueryDto } from './dto/list-events-query.dto.js';
import { RegisterEventDto } from './dto/event.dto.js';
import { EventsService } from './events.service.js';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Public()
  @Get('categories')
  listCategories() {
    return this.eventsService.listCategories();
  }

  @Get('my/registrations')
  listMyRegistrations(@Req() req: any) {
    const userId = req.user?.id || req.user?.userId || req.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }
    return this.eventsService.listMyRegistrations(userId);
  }

  @Public()
  @Get()
  listEvents(@Req() req: any, @Query() query: ListEventsQueryDto) {
    const userId = req.user?.id || req.user?.userId || req.user?.sub;
    return this.eventsService.listForPublic(query, userId);
  }

  @Public()
  @Get(':id')
  getEvent(@Param('id') id: string, @Req() req: any) {
    const userId = req.user?.id || req.user?.userId || req.user?.sub;
    return this.eventsService.getForPublic(id, userId);
  }

  @Public()
  @Post(':id/register')
  register(
    @Param('id') id: string,
    @Req() req: any,
    @Body() dto: RegisterEventDto,
  ) {
    const userId = req.user?.id || req.user?.userId || req.user?.sub || null;
    return this.eventsService.register(id, userId, dto);
  }
}
