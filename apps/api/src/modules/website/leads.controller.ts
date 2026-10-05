import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LeadStatus, Role } from '@prisma/client';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export class CreateLeadDto {
  @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @IsEmail() @MaxLength(200) email: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(4000) message?: string;
}

export class UpdateLeadDto {
  @IsEnum(LeadStatus) status: LeadStatus;
}

/** Enquiries from the public website, worked through in the admin CRM. */
@Controller('leads')
export class LeadsController {
  constructor(private prisma: PrismaService) {}

  // public form: keep it to a handful of submissions a minute per address
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post()
  async create(@Body() body: CreateLeadDto) {
    const lead = await this.prisma.lead.create({ data: body });
    return { id: lead.id, status: lead.status };
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER)
  @Get()
  list() {
    return this.prisma.lead.findMany({ orderBy: { createdAt: 'desc' } });
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER)
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateLeadDto) {
    return this.prisma.lead.update({ where: { id }, data: { status: body.status } });
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.prisma.lead.delete({ where: { id } });
  }
}
