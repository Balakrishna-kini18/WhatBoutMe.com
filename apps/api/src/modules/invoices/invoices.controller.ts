import { Controller, Get } from '@nestjs/common';
import { InvoicesService } from './invoices.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '@prisma/client';

@Controller('invoices')
@Roles(Role.SUPER_ADMIN, Role.ADMIN)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  findAll() {
    return this.invoicesService.findAll();
  }
}
