import { Controller, Post, Get, Param, Request, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MuxService } from './mux.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

@Controller('mux')
export class MuxController {
  constructor(
    private readonly muxService: MuxService,
    private readonly prisma: PrismaService,
  ) {}

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Post('upload-url')
  createUploadUrl() {
    return this.muxService.createDirectUpload();
  }

  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Get('upload/:uploadId')
  getPlaybackId(@Param('uploadId') uploadId: string) {
    return this.muxService.getPlaybackIdFromUpload(uploadId);
  }

  @Get('secure-playback/:lessonId')
  async getSecurePlayback(@Param('lessonId') lessonId: string, @Request() req: any) {
    const userId = req.user.sub;
    
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { step: { include: { program: true } } }
    });

    if (!lesson || !lesson.mediaUrl) {
      throw new NotFoundException('Lesson or video not found');
    }

    // Verify enrolment if not an admin
    if (req.user.role === Role.USER) {
      const enrolment = await this.prisma.enrolment.findFirst({
        where: {
          userId,
          batch: { programId: lesson.step.program.id },
          status: 'ACTIVE'
        }
      });
      if (!enrolment) {
        throw new ForbiddenException('Not enrolled in this program');
      }

      // TRD: Would typically also check if the step is unlocked/dripped here
    }

    // Extract playbackId if it's an upload reference
    let playbackId = lesson.mediaUrl;
    if (playbackId.startsWith('upload:')) {
      playbackId = playbackId.replace('upload:', '');
    } else if (playbackId.includes('/upload/')) {
      playbackId = playbackId.split('/upload/')[1].split('?')[0];
    }
    
    // Resolve upload to playbackId if needed
    if (playbackId.length !== 35 && playbackId.length !== 31 && playbackId.length > 20) { // arbitrary heuristic for uploadId vs playbackId, better is to just check Mux
      const uploadStatus = await this.muxService.getPlaybackIdFromUpload(playbackId);
      if (uploadStatus.status === 'ready' && uploadStatus.playbackId) {
        playbackId = uploadStatus.playbackId;
      }
    }

    const token = await this.muxService.getSignedPlaybackToken(playbackId);
    return { token, playbackId };
  }
}
