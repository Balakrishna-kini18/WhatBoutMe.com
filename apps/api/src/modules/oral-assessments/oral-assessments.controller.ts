import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
} from '@nestjs/common';
import { OralAssessmentsService } from './oral-assessments.service.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { Permission } from '../../config/permissions.config.js';
import {
  CreateOralAssessmentDto,
  GradeOralAssessmentDto,
} from './dto/index.js';

@Controller('oral-assessments')
export class OralAssessmentsController {
  constructor(
    private readonly oralAssessmentsService: OralAssessmentsService,
  ) {}

  @RequirePermission(Permission.ORAL_ASSESSMENTS_GRADE)
  @Post()
  create(
    @Body() dto: CreateOralAssessmentDto,
    @Request() req: any,
  ) {
    return this.oralAssessmentsService.create(dto, req?.user);
  }

  @Get('enrolments/:enrolmentId')
  findByEnrolment(
    @Param('enrolmentId') enrolmentId: string,
    @Request() req: any,
  ) {
    return this.oralAssessmentsService.findByEnrolment(enrolmentId, req?.user);
  }

  @RequirePermission(Permission.ORAL_ASSESSMENTS_READ)
  @Get('batches/:batchId')
  findByBatch(
    @Param('batchId') batchId: string,
    @Request() req: any,
  ) {
    return this.oralAssessmentsService.findByBatch(batchId, req?.user);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Request() req: any,
  ) {
    return this.oralAssessmentsService.findOne(id, req?.user);
  }

  @RequirePermission(Permission.ORAL_ASSESSMENTS_GRADE)
  @Post(':id/grade')
  grade(
    @Param('id') id: string,
    @Body() dto: GradeOralAssessmentDto,
    @Request() req: any,
  ) {
    return this.oralAssessmentsService.grade(id, dto, req?.user);
  }
}
