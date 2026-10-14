import { Controller, Get, Post, Param, Body, Req } from '@nestjs/common';
import { InvoicesService } from './invoices.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '@prisma/client';
import { CreateCreditNoteDto } from './dto/create-credit-note.dto.js';
import { CreateInvoiceDto } from './dto/create-invoice.dto.js';

@Controller('invoices')
@Roles(Role.SUPER_ADMIN, Role.ADMIN)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  findAll() {
    return this.invoicesService.findAll();
  }

  @Post()
  create(@Body() body: CreateInvoiceDto, @Req() req: any) {
    return this.invoicesService.create(body, req.user);
  }

  @Get('credit-notes')
  findAllCreditNotes() {
    return this.invoicesService.findAllCreditNotes();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.invoicesService.findOne(id);
  }

  @Post(':id/credit-note')
  createCreditNote(
    @Param('id') id: string,
    @Body() body: CreateCreditNoteDto,
    @Req() req: any,
  ) {
    return this.invoicesService.createCreditNote(id, body, req.user);
  }

  @Get(':id/credit-note')
  getCreditNote(@Param('id') id: string) {
    return this.invoicesService.getCreditNote(id);
  }
}
