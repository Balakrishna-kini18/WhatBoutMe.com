import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { AdminListEventsQueryDto } from './dto/list-events-query.dto.js';
import {
  CreateEventDto,
  RejectEventRegistrationDto,
  UpdateEventDto,
} from './dto/event.dto.js';
import { EventsService } from './events.service.js';

@Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.MANAGER)
@Controller('admin/events')
export class AdminEventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  listEvents(@Query() query: AdminListEventsQueryDto) {
    return this.eventsService.listForAdmin(query);
  }

  @Post('cover-image')
  @UseInterceptors(FileInterceptor('file'))
  uploadCoverImage(@UploadedFile() file: any) {
    return this.eventsService.uploadCoverImage(file);
  }

  @Get(':id/registrations')
  listRegistrations(@Param('id') id: string) {
    return this.eventsService.listRegistrationsForAdmin(id);
  }

  @Post(':id/registrations/:registrationId/reject')
  rejectRegistration(
    @Req() req: any,
    @Param('id') id: string,
    @Param('registrationId') registrationId: string,
    @Body() dto: RejectEventRegistrationDto,
  ) {
    const adminId = req.user?.id || req.user?.userId || req.user?.sub || 'system';
    return this.eventsService.refundRegistrationForAdmin(adminId, id, registrationId, dto.reason);
  }

  @Post(':id/registrations/:registrationId/refund')
  refundRegistration(
    @Req() req: any,
    @Param('id') id: string,
    @Param('registrationId') registrationId: string,
    @Body() dto: RejectEventRegistrationDto,
  ) {
    const adminId = req.user?.id || req.user?.userId || req.user?.sub || 'system';
    return this.eventsService.refundRegistrationForAdmin(adminId, id, registrationId, dto.reason);
  }

  @Get(':id')
  getEvent(@Param('id') id: string) {
    return this.eventsService.getForAdmin(id);
  }

  @Post()
  createEvent(
    @Req() req: any,
    @Body() dto: CreateEventDto,
  ) {
    const adminId = req.user?.id || req.user?.userId || req.user?.sub || 'system';
    return this.eventsService.createForAdmin(adminId, dto, {
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent'],
    });
  }

  @Patch(':id')
  updateEvent(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
  ) {
    const adminId = req.user?.id || req.user?.userId || req.user?.sub || 'system';
    return this.eventsService.updateForAdmin(adminId, id, dto, {
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent'],
    });
  }

  @Delete(':id')
  removeEvent(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    const adminId = req.user?.id || req.user?.userId || req.user?.sub || 'system';
    return this.eventsService.removeForAdmin(adminId, id, {
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent'],
    });
  }
}
