import { Controller, Get, Post, Body, Patch, Param, Delete, UseInterceptors, Req } from '@nestjs/common';
import { CacheInterceptor, CacheKey, CacheTTL } from '@nestjs/cache-manager';
import { Query } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '@prisma/client';
import { IsString, IsEmail, IsOptional, IsEnum, IsArray } from 'class-validator';

export class CreateUserDto {
  @IsEmail() email: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() password?: string;
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @IsArray() permissions?: string[];
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() batchId?: string;
  @IsOptional() @IsArray() batchIds?: string[];
  @IsOptional() @IsString() cohort?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() country?: string;
}

export class UpdateUserDto {
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() password?: string;
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @IsArray() permissions?: string[];
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() batchId?: string;
  @IsOptional() @IsArray() batchIds?: string[];
  @IsOptional() @IsString() cohort?: string;
  @IsOptional() @IsString() enrolmentId?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsString() country?: string;
}

@Controller('users')
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(@Req() req: any, @Query('page') page?: string, @Query('limit') limit?: string, @Query('search') search?: string, @Query('role') role?: Role) {
    return this.usersService.findAll({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      search,
      role,
      reqUser: req.user,
    });
  }

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  create(@Body() createDto: CreateUserDto, @Req() req: any) {
    return this.usersService.create(createDto, req.user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: UpdateUserDto, @Req() req: any) {
    return this.usersService.update(id, updateDto, req.user);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.usersService.remove(id, req.user);
  }

  @Get(':id/sessions')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  getUserSessions(@Param('id') id: string) {
    return this.usersService.getUserSessions(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.usersService.findOne(id, req.user);
  }

  @Delete(':id/sessions')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  revokeUserSessions(@Param('id') id: string) {
    return this.usersService.revokeUserSessions(id);
  }

  @Post(':id/revoke-access')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER)
  revokeAccess(
    @Param('id') id: string,
    @Body() body: { enrolmentId?: string; reason?: string },
    @Req() req: any,
  ) {
    return this.usersService.revokeAccess(id, body, req.user);
  }
}
