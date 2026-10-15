import { Controller, Get, Post, Param, Body, Req, Query } from '@nestjs/common';
import { InvoicesService } from './invoices.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '@prisma/client';
import { CreateCreditNoteDto } from './dto/create-credit-note.dto.js';
import { CreateInvoiceDto } from './dto/create-invoice.dto.js';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.USER)
  @Get()
  findAll(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    const query = page || limit ? {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    } : undefined;
    return this.invoicesService.findAll(req?.user, query);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.USER)
  @Get('mine')
  findMine(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ) {
    const query = page || limit ? {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    } : undefined;
    return this.invoicesService.findAll(req?.user, query);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Post()
  create(@Body() body: CreateInvoiceDto, @Req() req: any) {
    return this.invoicesService.create(body, req.user);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Get('credit-notes')
  findAllCreditNotes(@Query('page') page?: string, @Query('limit') limit?: string) {
    const query = page || limit ? {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    } : undefined;
    return this.invoicesService.findAllCreditNotes(query);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.USER)
  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.invoicesService.findOne(id, req.user);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Post(':id/credit-note')
  createCreditNote(
    @Param('id') id: string,
    @Body() body: CreateCreditNoteDto,
    @Req() req: any,
  ) {
    return this.invoicesService.createCreditNote(id, body, req.user);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Get(':id/credit-note')
  getCreditNote(@Param('id') id: string) {
    return this.invoicesService.getCreditNote(id);
  }
}
