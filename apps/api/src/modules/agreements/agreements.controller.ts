import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { AgreementsService } from './agreements.service.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { Permission } from '../../config/permissions.config.js';
import {
  CreateAgreementTemplateDto,
  CreateTemplateVersionDto,
  QueryAgreementTemplatesDto,
  UpdateAgreementTemplateDto,
  UpdateTemplateVersionDto,
} from './dto/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// 1. ADMIN AGREEMENT TEMPLATES CONTROLLER
// ─────────────────────────────────────────────────────────────────────────────

@Controller(['admin/agreement-templates', 'admin/agreements/templates'])
export class AdminAgreementTemplatesController {
  constructor(private readonly agreementsService: AgreementsService) {}

  @RequirePermission(Permission.AGREEMENTS_CREATE_TEMPLATE)
  @Post()
  async createTemplate(
    @Body() dto: CreateAgreementTemplateDto,
    @Request() req: any,
  ) {
    const actorId = req.user?.sub ?? req.user?.id;
    const ip = req.ip;
    return this.agreementsService.createTemplate(dto, actorId, ip);
  }

  @RequirePermission(Permission.AGREEMENTS_READ)
  @Get()
  async findAllTemplates(@Query() query: QueryAgreementTemplatesDto) {
    return this.agreementsService.findAllTemplates(query);
  }

  @RequirePermission(Permission.AGREEMENTS_READ)
  @Get(':id')
  async findTemplateById(@Param('id') id: string) {
    return this.agreementsService.findTemplateById(id);
  }

  @RequirePermission(Permission.AGREEMENTS_CREATE_TEMPLATE)
  @Patch(':id')
  async updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateAgreementTemplateDto,
    @Request() req: any,
  ) {
    const actorId = req.user?.sub ?? req.user?.id;
    const ip = req.ip;
    return this.agreementsService.updateTemplate(id, dto, actorId, ip);
  }

  @RequirePermission(Permission.AGREEMENTS_CREATE_TEMPLATE)
  @Post(':id/versions')
  async createVersion(
    @Param('id') templateId: string,
    @Body() dto: CreateTemplateVersionDto,
    @Request() req: any,
  ) {
    const actorId = req.user?.sub ?? req.user?.id;
    const ip = req.ip;
    return this.agreementsService.createVersion(templateId, dto, actorId, ip);
  }

  @RequirePermission(Permission.AGREEMENTS_READ)
  @Get(':id/versions')
  async findAllVersions(@Param('id') templateId: string) {
    return this.agreementsService.findAllVersions(templateId);
  }

  @RequirePermission(Permission.AGREEMENTS_READ)
  @Get(':id/versions/:versionId')
  async findVersionById(
    @Param('id') templateId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.agreementsService.findVersionById(templateId, versionId);
  }

  @RequirePermission(Permission.AGREEMENTS_CREATE_TEMPLATE)
  @Patch(':id/versions/:versionId')
  async updateVersion(
    @Param('id') templateId: string,
    @Param('versionId') versionId: string,
    @Body() dto: UpdateTemplateVersionDto,
    @Request() req: any,
  ) {
    const actorId = req.user?.sub ?? req.user?.id;
    const ip = req.ip;
    return this.agreementsService.updateVersion(
      templateId,
      versionId,
      dto,
      actorId,
      ip,
    );
  }

  @RequirePermission(Permission.AGREEMENTS_CREATE_TEMPLATE)
  @Post(':id/versions/:versionId/publish')
  async publishVersion(
    @Param('id') templateId: string,
    @Param('versionId') versionId: string,
    @Request() req: any,
  ) {
    const actorId = req.user?.sub ?? req.user?.id;
    const ip = req.ip;
    return this.agreementsService.publishVersion(
      templateId,
      versionId,
      actorId,
      ip,
    );
  }

  @RequirePermission(Permission.AGREEMENTS_CREATE_TEMPLATE)
  @Delete(':id/versions/:versionId')
  async deleteVersion(
    @Param('id') templateId: string,
    @Param('versionId') versionId: string,
    @Request() req: any,
  ) {
    const actorId = req.user?.sub ?? req.user?.id;
    const ip = req.ip;
    return this.agreementsService.deleteVersion(
      templateId,
      versionId,
      actorId,
      ip,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. LEARNER AGREEMENT TEMPLATES CONTROLLER
// ─────────────────────────────────────────────────────────────────────────────

@Controller(['agreements/templates', 'agreements'])
export class LearnerAgreementsController {
  constructor(private readonly agreementsService: AgreementsService) {}

  @RequirePermission(Permission.AGREEMENTS_READ)
  @Get('program/:programId/active')
  async getActiveVersionForProgram(@Param('programId') programId: string) {
    return this.agreementsService.getActiveVersionForProgram(programId);
  }
}
