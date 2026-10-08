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
}

export class UpdateUserDto {
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @IsArray() permissions?: string[];
}

@Controller('users')
@Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  // @UseInterceptors(CacheInterceptor)
  // @CacheKey('all_users')
  // @CacheTTL(60000)
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
  create(@Body() createDto: CreateUserDto) {
    return this.usersService.create(createDto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: UpdateUserDto) {
    return this.usersService.update(id, updateDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  @Get(':id/sessions')
  getUserSessions(@Param('id') id: string) {
    return this.usersService.getUserSessions(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Delete(':id/sessions')
  revokeUserSessions(@Param('id') id: string) {
    return this.usersService.revokeUserSessions(id);
  }
}
