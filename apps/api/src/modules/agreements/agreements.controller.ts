import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AgreementsService } from './agreements.service.js';
import { RequirePermission } from '../../common/decorators/require-permission.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '@prisma/client';
import { Permission } from '../../config/permissions.config.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import {
  CreateAgreementTemplateDto,
  CreateTemplateVersionDto,
  QueryAgreementTemplatesDto,
  SignAgreementDto,
  UpdateAgreementTemplateDto,
  UpdateTemplateVersionDto,
  UpdateSavedSignatureDto,
  QuerySignedAgreementsDto,
} from './dto/index.js';


// ─────────────────────────────────────────────────────────────────────────────
// 1. ADMIN AGREEMENT TEMPLATES CONTROLLER
// ─────────────────────────────────────────────────────────────────────────────

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.SUPER_ADMIN, Role.ADMIN)
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

  @RequirePermission(Permission.AGREEMENTS_READ)
  @Get('signed/:signedId')
  async getSignedAgreementDetail(
    @Param('signedId') signedId: string,
    @Request() req?: any,
  ) {
    return this.agreementsService.getSignedAgreementDetail(signedId, req?.user);
  }

  @RequirePermission(Permission.AGREEMENTS_READ)
  @Get(':id/signed')
  async getSignedAgreementsForTemplate(
    @Param('id') templateId: string,
    @Query() query?: QuerySignedAgreementsDto,
    @Request() req?: any,
  ) {
    if (query && Object.keys(query).length > 0) {
      return this.agreementsService.getSignedAgreementsForTemplate(templateId, query, req?.user);
    }
    if (req?.user) {
      return this.agreementsService.getSignedAgreementsForTemplate(templateId, req.user);
    }
    return this.agreementsService.getSignedAgreementsForTemplate(templateId);
  }

  @RequirePermission(Permission.AGREEMENTS_READ)
  @Get(':id/signed/:signedId/pdf')
  async downloadSignedAgreementPdf(
    @Param('id') templateId: string,
    @Param('signedId') signedId: string,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const bytes = await this.agreementsService.renderSignedAgreementPdf(
      templateId,
      signedId,
      req?.user,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="agreement-${signedId}.pdf"`,
      'Content-Length': String(bytes.length),
    });
    res.send(Buffer.from(bytes));
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// 2. LEARNER AGREEMENTS CONTROLLER
// ─────────────────────────────────────────────────────────────────────────────

@UseGuards(JwtAuthGuard)
@Controller(['agreements/templates', 'agreements'])
export class LearnerAgreementsController {
  constructor(private readonly agreementsService: AgreementsService) {}

  @RequirePermission(Permission.AGREEMENTS_READ)
  @Get('program/:programId/active')
  async getActiveVersionForProgram(
    @Param('programId') programId: string,
    @Query('enrolmentId') enrolmentId?: string,
    @Request() req?: any,
  ) {
    if (enrolmentId && req?.user) {
      await this.agreementsService.verifyEnrolmentOwnership(enrolmentId, req.user);
    }
    return this.agreementsService.getActiveVersionForProgram(programId);
  }

  @RequirePermission(Permission.AGREEMENTS_READ)
  @Get('enrolments/:enrolmentId/active')
  async getActiveVersionForEnrolment(
    @Param('enrolmentId') enrolmentId: string,
    @Request() req: any,
  ) {
    const user = req.user;
    return this.agreementsService.getActiveVersionForEnrolment(enrolmentId, user);
  }

  @RequirePermission(Permission.AGREEMENTS_READ)
  @Post('initiate')
  async initiateAgreementFlow(
    @Body('programId') programId: string,
    @Request() req: any,
  ) {
    const userId = req.user?.sub ?? req.user?.id;
    return this.agreementsService.getOrInitiateSigningEnrolment(userId, programId);
  }

  @RequirePermission(Permission.AGREEMENTS_READ)
  @Get('saved-signature')
  async getSavedSignature(@Request() req: any) {
    const userId = req.user?.sub ?? req.user?.id;
    return this.agreementsService.getLearnerSavedSignature(userId);
  }

  @RequirePermission(Permission.AGREEMENTS_SIGN)
  @Put('saved-signature')
  async updateSavedSignature(
    @Body() dto: UpdateSavedSignatureDto,
    @Request() req: any,
  ) {
    const userId = req.user?.sub ?? req.user?.id;
    const ip = req.ip ?? req.headers?.['x-forwarded-for'] ?? req.socket?.remoteAddress;
    const userAgent = req.headers?.['user-agent'] ?? 'unknown';
    return this.agreementsService.updateLearnerSavedSignature(
      userId,
      dto.signatureData,
      dto.signatureType,
      ip,
      userAgent,
    );
  }

  @RequirePermission(Permission.AGREEMENTS_SIGN)
  @Delete('saved-signature')
  async removeSavedSignature(@Request() req: any) {
    const userId = req.user?.sub ?? req.user?.id;
    const ip = req.ip ?? req.headers?.['x-forwarded-for'] ?? req.socket?.remoteAddress;
    const userAgent = req.headers?.['user-agent'] ?? 'unknown';
    return this.agreementsService.removeLearnerSavedSignature(userId, ip, userAgent);
  }

  @RequirePermission(Permission.AGREEMENTS_SIGN)
  @Post('sign')
  async signAgreement(
    @Body() dto: SignAgreementDto,
    @Request() req: any,
  ) {
    const user = req.user;
    const ip = req.ip ?? req.headers?.['x-forwarded-for'] ?? req.socket?.remoteAddress;
    const userAgent = req.headers?.['user-agent'] ?? 'unknown';
    return this.agreementsService.signAgreement(dto, user, ip, userAgent);
  }

  @RequirePermission(Permission.AGREEMENTS_READ)
  @Get('enrolments/:enrolmentId')
  async getSignedAgreementForEnrolment(
    @Param('enrolmentId') enrolmentId: string,
    @Request() req: any,
  ) {
    const user = req.user;
    return this.agreementsService.getSignedAgreementForEnrolment(enrolmentId, user);
  }

  @RequirePermission(Permission.AGREEMENTS_READ)
  @Get('signed/:signedId/pdf')
  async downloadMySignedAgreementPdf(
    @Param('signedId') signedId: string,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const signed = await this.agreementsService.getSignedAgreementDetail(signedId, req?.user);
    const bytes = await this.agreementsService.renderSignedAgreementPdf(
      signed.templateId,
      signedId,
      req?.user,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="agreement-${signedId}.pdf"`,
      'Content-Length': String(bytes.length),
    });
    res.send(Buffer.from(bytes));
  }
}
