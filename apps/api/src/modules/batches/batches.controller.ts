import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Request,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BatchesService } from './batches.service.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import {
  RequireBatchAccess,
  BatchAccessGuard,
} from '../../common/guards/batch-access.guard.js';
import { Permission } from '../../config/permissions.config.js';
import {
  CreateBatchDto,
  UpdateBatchDto,
  TransitionBatchStatusDto,
  AssignTrainerDto,
  QueryBatchesDto,
} from './dto/index.js';

@Controller('batches')
export class BatchesController {
  constructor(private readonly batchesService: BatchesService) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. QUERY
  // ─────────────────────────────────────────────────────────────────────────────

  @RequirePermission(Permission.BATCHES_READ)
  @Get()
  findAll(@Request() req: any, @Query() query: QueryBatchesDto) {
    return this.batchesService.findAll(req.user, query);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. CREATION
  // ─────────────────────────────────────────────────────────────────────────────

  @RequirePermission(Permission.BATCHES_CREATE)
  @Post()
  create(@Body() createDto: CreateBatchDto) {
    return this.batchesService.create(createDto);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. TRAINER ASSIGNMENT (Declared before parameterized ':id' routes)
  // ─────────────────────────────────────────────────────────────────────────────

  @RequirePermission(Permission.BATCHES_ASSIGN_TRAINER)
  @Delete(':id/trainers/:trainerId')
  removeTrainer(
    @Param('id') id: string,
    @Param('trainerId') trainerId: string,
  ) {
    return this.batchesService.removeTrainer(id, trainerId);
  }

  @RequirePermission(Permission.BATCHES_ASSIGN_TRAINER)
  @Post(':id/trainers')
  assignTrainer(
    @Param('id') id: string,
    @Body() dto: AssignTrainerDto,
  ) {
    return this.batchesService.assignTrainer(id, dto);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. LIFECYCLE TRANSITION
  // ─────────────────────────────────────────────────────────────────────────────

  @RequirePermission(Permission.BATCHES_UPDATE)
  @Patch(':id/status')
  transitionStatus(
    @Param('id') id: string,
    @Body() statusDto: TransitionBatchStatusDto,
  ) {
    return this.batchesService.transitionStatus(id, statusDto);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. BATCH INSTANCE CRUD
  // ─────────────────────────────────────────────────────────────────────────────

  @RequirePermission(Permission.BATCHES_READ)
  @UseGuards(BatchAccessGuard)
  @RequireBatchAccess('id')
  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.batchesService.findOne(id, req.user);
  }

  @RequirePermission(Permission.BATCHES_UPDATE)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdateBatchDto,
  ) {
    return this.batchesService.update(id, updateDto);
  }

  @RequirePermission(Permission.BATCHES_DELETE)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.batchesService.remove(id);
  }
}
