import { Controller, Get, Post, Body, Patch, Param, Delete, Request } from '@nestjs/common';
import { BatchesService } from './batches.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '@prisma/client';
import { IsString, IsNotEmpty, IsInt, IsDateString, IsOptional } from 'class-validator';

export class CreateBatchDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() programId: string;
  @IsOptional() @IsString() managerId?: string;
  @IsDateString() startDate: string;
  @IsInt() capacity: number;
}

export class UpdateBatchDto {
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsString() @IsNotEmpty() programId?: string;
  @IsOptional() @IsString() managerId?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsInt() capacity?: number;
}

@Controller('batches')
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER)
export class BatchesController {
  constructor(private readonly batchesService: BatchesService) {}

  @Get()
  findAll(@Request() req: any) {
    return this.batchesService.findAll(req.user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.batchesService.findOne(id, req.user);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Post()
  create(@Body() createDto: CreateBatchDto) {
    return this.batchesService.create(createDto);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: UpdateBatchDto) {
    return this.batchesService.update(id, updateDto);
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.batchesService.remove(id);
  }
}
