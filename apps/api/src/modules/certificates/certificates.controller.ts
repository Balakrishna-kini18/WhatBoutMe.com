import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Query,
  Request,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { CertificatesService } from './certificates.service.js';
import { CertificateEligibilityService } from './certificate-eligibility.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Role, CertificateType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

@Controller(['certificates', 'api/certificates'])
export class CertificatesController {
  constructor(
    private readonly certificatesService: CertificatesService,
    private readonly eligibilityService: CertificateEligibilityService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * D1-053: Public Certificate Verification (Unauthenticated)
   * GET /certificates/verify/:code and GET /api/certificates/verify/:code
   */
  @Public()
  @Get('verify/:code')
  verifyCertificate(@Param('code') code: string) {
    return this.certificatesService.verifyCertificate(code);
  }

  /**
   * D1-051 & D1-051b: Certificate Eligibility Evaluation (Read-Only)
   * GET /certificates/eligibility/:enrolmentId
   * Secured: Learners can only evaluate their own enrolment (IDOR prevented).
   */
  @Get('eligibility/:enrolmentId')
  async evaluateEligibility(
    @Param('enrolmentId') enrolmentId: string,
    @Query('type') type: string,
    @Request() req: any,
  ) {
    if (req.user?.role === Role.USER) {
      const enrolment = await this.prisma.enrolment.findUnique({
        where: { id: enrolmentId },
        select: { userId: true },
      });
      if (!enrolment || enrolment.userId !== req.user.sub) {
        throw new ForbiddenException(
          'Access denied: You can only evaluate certificate eligibility for your own enrolment',
        );
      }
    }

    return this.eligibilityService.evaluateEligibility(
      enrolmentId,
      type as CertificateType,
    );
  }

  // Admin: Get all certificates
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER, Role.TEACHER)
  @Get()
  findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    const query = page || limit ? {
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    } : undefined;
    return this.certificatesService.findAll(query);
  }

  // Learner: Get their approved or issued certificates
  @Get('mine')
  getMyCertificates(@Request() req: any) {
    return this.certificatesService.getMyCertificates(req.user.sub);
  }

  // Learner or Admin: Request a certificate for an enrolment (ELIGIBLE -> PENDING)
  @Post('request/:enrolmentId')
  requestCertificate(
    @Param('enrolmentId') enrolmentId: string,
    @Body('type') type: string,
    @Request() req: any,
  ) {
    return this.certificatesService.requestCertificate(
      enrolmentId,
      req.user,
      type as CertificateType,
    );
  }

  // Admin: Approve Certificate (PENDING -> APPROVED)
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Post(':id/approve')
  approveCertificate(@Param('id') id: string, @Request() req: any) {
    return this.certificatesService.approveCertificate(id, req.user);
  }

  // Admin: Reject Certificate (PENDING -> REJECTED)
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Post(':id/reject')
  rejectCertificate(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Request() req: any,
  ) {
    return this.certificatesService.rejectCertificate(id, req.user, reason);
  }

  // Admin: Issue Certificate (APPROVED -> ISSUED)
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Post(':id/issue')
  issueCertificate(@Param('id') id: string, @Request() req: any) {
    return this.certificatesService.issueCertificate(id, req.user);
  }

  // Admin: Batch issue certificates
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Post('batch/:batchId/issue')
  issueForBatch(
    @Param('batchId') batchId: string,
    @Body('includeUnfinished') includeUnfinished: unknown,
    @Request() req: any,
  ) {
    return this.certificatesService.issueForBatch(
      batchId,
      includeUnfinished === true,
      req.user,
    );
  }

  // D2-052: Secure access to official generated certificate PDF
  @Get(':id/pdf')
  getCertificatePdf(@Param('id') id: string, @Request() req: any) {
    return this.certificatesService.getCertificatePdfDownload(id, req.user);
  }

  @Get(':id/download')
  downloadCertificatePdf(@Param('id') id: string, @Request() req: any) {
    return this.certificatesService.getCertificatePdfDownload(id, req.user);
  }
}
