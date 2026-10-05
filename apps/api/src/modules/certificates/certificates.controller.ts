import { Body, Controller, Get, Post, Param, Request } from '@nestjs/common';
import { CertificatesService } from './certificates.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '@prisma/client';

@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  // Admin: Get all certificates
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER)
  @Get()
  findAll() {
    return this.certificatesService.findAll();
  }

  // Learner: Get their approved certificates
  @Get('mine')
  getMyCertificates(@Request() req: any) {
    return this.certificatesService.getMyCertificates(req.user.sub);
  }

  // Learner: Request a certificate for an enrolment
  @Post('request/:enrolmentId')
  requestCertificate(@Param('enrolmentId') enrolmentId: string, @Request() req: any) {
    return this.certificatesService.requestCertificate(enrolmentId, req.user.sub);
  }

  // Admin: issue to every learner in a batch
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Post('batch/:batchId/issue')
  issueForBatch(@Param('batchId') batchId: string, @Body('includeUnfinished') includeUnfinished: unknown) {
    return this.certificatesService.issueForBatch(batchId, includeUnfinished === true);
  }

  // Admin: Approve
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Post(':id/approve')
  approveCertificate(@Param('id') id: string) {
    return this.certificatesService.approveCertificate(id);
  }

  // Admin: Reject
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Post(':id/reject')
  rejectCertificate(@Param('id') id: string) {
    return this.certificatesService.rejectCertificate(id);
  }
}
