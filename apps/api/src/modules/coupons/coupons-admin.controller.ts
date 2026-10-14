import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CouponsService } from './coupons.service.js';
import {
  CreateCouponDto,
  UpdateCouponDto,
  QueryCouponDto,
} from './dto/index.js';

@Controller('admin/coupons')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN)
export class CouponsAdminController {
  constructor(private readonly couponsService: CouponsService) {}

  @Get('kpis')
  async getKpis() {
    return this.couponsService.getSummaryKpis();
  }

  @Get()
  async findAll(@Query() query: QueryCouponDto) {
    return this.couponsService.findAllAdmin(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.couponsService.findOneAdmin(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateCouponDto, @Req() req: any) {
    const actorId = req.user?.sub || req.user?.id;
    return this.couponsService.createCoupon(dto, actorId);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCouponDto,
    @Req() req: any,
  ) {
    const actorId = req.user?.sub || req.user?.id;
    return this.couponsService.updateCoupon(id, dto, actorId);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: any) {
    const actorId = req.user?.sub || req.user?.id;
    return this.couponsService.deleteCoupon(id, actorId);
  }
}
