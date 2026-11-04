import {
  Body,
  Controller,
  Post,
  Get,
  Param,
  Res,
  Request,
  ForbiddenException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { CloudinaryMediaProvider } from './cloudinary.service.js';
import { CloudinaryObjectStorageProvider } from './cloudinary-object-storage.service.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Role, EnrolmentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Response } from 'express';

@Controller('media')
export class CloudinaryController {
  constructor(
    private readonly cloudinaryService: CloudinaryMediaProvider,
    private readonly objectStorage: CloudinaryObjectStorageProvider,
    private readonly prisma: PrismaService,
  ) { }

  // D2-008: Implement backend endpoint POST /media/upload-signature
  // Only admins should be able to upload course media. Managers cannot edit course content.
  @Post('upload-signature')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  getUploadSignature(@Body() body?: { resourceType?: string; type?: string }) {
    return this.cloudinaryService.createDirectUpload(body);
  }

  /**
 * Secure, inline PDF document viewer stream.
 * Serves application/pdf with Content-Disposition: inline for native in-browser viewing.
 */
  @Get(['document/:lessonId', 'pdf/:lessonId'])
  async streamDocument(
    @Param('lessonId') lessonId: string,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const user = req?.user;
    if (!user) {
      throw new UnauthorizedException('Authentication required to access protected document');
    }

    const cleanLessonId = (lessonId || '').trim();
    if (!cleanLessonId) {
      throw new NotFoundException('Document not specified');
    }

    let targetUrl: string | null = null;
    let programId: string | null = null;
    let docTitle: string = 'document';

    // 1. Resolve by Lesson
    const lesson = await this.prisma.lesson.findFirst({
      where: {
        OR: [
          { id: cleanLessonId },
          { mediaUrl: { contains: cleanLessonId } },
        ],
      },
      include: {
        step: {
          select: { programId: true },
        },
      },
    });

    if (lesson && lesson.mediaUrl) {
      targetUrl = lesson.mediaUrl;
      programId = lesson.step?.programId ?? null;
      docTitle = lesson.title || 'document';
    } else {
      // 2. Resolve by Resource
      const resource = await this.prisma.resource.findFirst({
        where: {
          OR: [
            { id: cleanLessonId },
            { mediaUrl: { contains: cleanLessonId } },
          ],
        },
      });

      if (resource && resource.mediaUrl) {
        targetUrl = resource.mediaUrl;
        programId = resource.programId ?? null;
        docTitle = resource.title || 'document';
      } else {
        // 3. Resolve by ResourceItem
        const resourceItem = await this.prisma.resourceItem.findFirst({
          where: {
            OR: [
              { id: cleanLessonId },
              { storageKey: { contains: cleanLessonId } },
            ],
          },
        });

        if (resourceItem) {
          targetUrl = (resourceItem as any).fileUrl || resourceItem.storageKey;
          programId = resourceItem.programId ?? null;
          docTitle = resourceItem.title || 'document';
        }
      }
    }

    if (!targetUrl) {
      throw new NotFoundException('Document not found');
    }

    // 4. Authorization check: learners must be enrolled in the owning program
    if (user.role === Role.USER && programId) {
      const userId = user.sub ?? user.userId ?? user.id;
      const activeEnrolment = await this.prisma.enrolment.findFirst({
        where: {
          userId,
          programId,
          status: { in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.COMPLETED] },
        },
      });

      if (!activeEnrolment) {
        throw new ForbiddenException('Active enrolment required to view course documents');
      }
    }

    // 5. Resolve target storage URL
    if (targetUrl.startsWith('upload:')) {
      const publicId = targetUrl.replace('upload:', '');
      targetUrl = await this.objectStorage.getPresignedGetUrl(publicId, 300);
    } else if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = await this.objectStorage.getPresignedGetUrl(targetUrl, 300);
    }

    try {
      const docRes = await fetch(targetUrl);
      if (!docRes.ok) {
        throw new NotFoundException('Failed to retrieve document from storage');
      }

      const buffer = Buffer.from(await docRes.arrayBuffer());

      // Detect PDF magic bytes (%PDF-)
      const isPdf = buffer.subarray(0, 5).toString('ascii') === '%PDF-';
      const contentType = isPdf ? 'application/pdf' : 'application/octet-stream';
      const safeFilename = docTitle.replace(/[^\w\s.-]/gi, '_');

      // Restrict document framing strictly to approved WhatBoutMe application origins (mitigates clickjacking & unauthorized third-party embedding)
      res.removeHeader('X-Frame-Options');
      res.setHeader(
        'Content-Security-Policy',
        "frame-ancestors 'self' https://whatboutme.com https://*.whatboutme.com https://*.testfox.in http://localhost:*",
      );
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(safeFilename)}.pdf"`);
      res.setHeader('Content-Length', buffer.length);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'private, max-age=86400');
      res.setHeader('X-Content-Type-Options', 'nosniff');

      return res.end(buffer);
    } catch (err: any) {
      console.error('Document stream error:', err);
      res.status(500).send('Failed to stream document');
    }
  }

  // D2-016: Redirect to secure streaming CDN URL (Requires valid authenticated and authorized session)
  @Get('stream/*key')
  async streamMedia(@Param('key') key: string, @Request() req: any, @Res() res: Response) {
    const user = req?.user;
    if (!user) {
      throw new UnauthorizedException('Authentication required to access protected media');
    }

    const rawKey = (key || req?.params?.key || req?.params?.[0] || '').trim();
    const normalizedKey = rawKey.replace(/^\/+/, '');
    if (!normalizedKey || normalizedKey.includes('..')) {
      throw new NotFoundException('Media resource not found');
    }

    // Admins, managers, and teachers have authoring/preview access to course media
    if (user.role !== Role.USER) {
      return this.handleStreamRedirect(normalizedKey, res);
    }

    // For learners (Role.USER), resolve the owning program of the requested media key
    const userId = user.sub ?? user.userId ?? user.id;

    // Build canonical candidate keys and exact URL path termination patterns
    const withoutExt = normalizedKey.replace(
      /\.(mp4|mov|avi|wmv|mkv|webm|m3u8|ts|mp3|wav|ogg|jpg|jpeg|png|gif|webp|svg|pdf)$/i,
      '',
    );
    const withMp4 = `${withoutExt}.mp4`;

    const candidateKeys = Array.from(
      new Set([
        normalizedKey,
        withoutExt,
        withMp4,
        `upload:${normalizedKey}`,
        `upload:${withoutExt}`,
        `upload:${withMp4}`,
        `cloudinary:${normalizedKey}`,
        `cloudinary:${withoutExt}`,
        `cloudinary:${withMp4}`,
      ]),
    );

    const endsWithClauses = [
      `/${normalizedKey}`,
      `/${withoutExt}`,
      `/${withMp4}`,
    ];

    const lessonWhere = {
      OR: [
        { mediaUrl: { in: candidateKeys } },
        ...endsWithClauses.map((ew) => ({ mediaUrl: { endsWith: ew } })),
      ],
    };

    const resourceWhere = {
      OR: [
        { mediaUrl: { in: candidateKeys } },
        ...endsWithClauses.map((ew) => ({ mediaUrl: { endsWith: ew } })),
      ],
    };

    const sessionWhere = {
      OR: [
        { recordingUrl: { in: candidateKeys } },
        ...endsWithClauses.map((ew) => ({ recordingUrl: { endsWith: ew } })),
        { providerRecordingUrl: { in: candidateKeys } },
        ...endsWithClauses.map((ew) => ({ providerRecordingUrl: { endsWith: ew } })),
      ],
    };

    const [lessons, resources, sessions] = await Promise.all([
      this.prisma.lesson.findMany({
        where: lessonWhere,
        select: { step: { select: { programId: true } } },
      }),
      this.prisma.resource.findMany({
        where: resourceWhere,
        select: { programId: true },
      }),
      this.prisma.session.findMany({
        where: sessionWhere,
        select: { batch: { select: { programId: true } } },
      }),
    ]);

    const matchingProgramIds = new Set<string>();
    for (const l of lessons) {
      if (l.step?.programId) matchingProgramIds.add(l.step.programId);
    }
    for (const r of resources) {
      if (r.programId) matchingProgramIds.add(r.programId);
    }
    for (const s of sessions) {
      if (s.batch?.programId) matchingProgramIds.add(s.batch.programId);
    }

    if (matchingProgramIds.size === 0) {
      throw new NotFoundException('Media resource not found');
    }

    // Verify learner has active/completed enrolment in ANY program owning this media
    const activeEnrolment = await this.prisma.enrolment.findFirst({
      where: {
        userId,
        programId: { in: Array.from(matchingProgramIds) },
        status: { in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.COMPLETED] },
      },
    });

    if (!activeEnrolment) {
      throw new ForbiddenException('Active enrolment in the program is required to stream this media');
    }

    return this.handleStreamRedirect(normalizedKey, res);
  }

  private async handleStreamRedirect(key: string, res: Response) {
    try {
      // Allow browser <video> across origins to stream seamlessly
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Access-Control-Allow-Origin', '*');

      if (key.startsWith('http://') || key.startsWith('https://')) {
        return res.redirect(302, key);
      }

      // 1. Get the securely signed Cloudinary URL with a 5-minute TTL
      const signedUrl = await this.objectStorage.getPresignedGetUrl(key, 300);

      // 2. Redirect the client to the CDN URL to properly support Range requests and seeking
      return res.redirect(302, signedUrl);
    } catch (error: any) {
      console.error('Error generating signed URL:', error);
      res.status(500).send('Internal Server Error');
    }
  }
}
