import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '@prisma/client';
import { IsString, IsEmail, IsOptional, IsEnum } from 'class-validator';

export class CreateUserDto {
  @IsEmail() email: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() password?: string;
  @IsOptional() @IsEnum(Role) role?: Role;
}

export class UpdateUserDto {
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEnum(Role) role?: Role;
}

@Controller('users')
@Roles(Role.SUPER_ADMIN, Role.ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
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

  @Delete(':id/sessions')
  revokeUserSessions(@Param('id') id: string) {
    return this.usersService.revokeUserSessions(id);
  }
}
