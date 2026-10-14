import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Request,
} from '@nestjs/common';
import { ProgressionService } from './progression.service.js';
import { RecordMediaProgressDto } from './dto/index.js';

@Controller('progress')
export class LessonProgressController {
  constructor(private readonly progressionService: ProgressionService) {}

  /**
   * Records media playback progress (heartbeat) for VIDEO or AUDIO lessons.
   * Authoritative duration is read from Lesson.durationSec.
   * Monotonic progress percent calculation.
   */
  @Post(['lessons/:lessonId/heartbeat', 'lessons/:lessonId'])
  @HttpCode(HttpStatus.OK)
  async recordMediaProgress(
    @Param('lessonId') lessonId: string,
    @Body() dto: RecordMediaProgressDto,
    @Request() req: any,
  ) {
    return this.progressionService.recordMediaProgress(
      lessonId,
      req.user,
      dto.positionSec,
      dto.videoDurationSec,
      dto.isEnded,
    );
  }

  /**
   * Records completion for PDF or TEXT lessons.
   * Rejects VIDEO and AUDIO.
   */
  @Post('lessons/:lessonId/complete')
  @HttpCode(HttpStatus.OK)
  async completeDocumentOrTextLesson(
    @Param('lessonId') lessonId: string,
    @Request() req: any,
  ) {
    return this.progressionService.completeDocumentOrTextLesson(
      lessonId,
      req.user,
    );
  }

  /**
   * Retrieves learner progress for a specific lesson.
   * Derives enrolment from authenticated user to prevent IDOR.
   */
  @Get('lessons/:lessonId')
  async getLearnerLessonProgress(
    @Param('lessonId') lessonId: string,
    @Request() req: any,
  ) {
    return this.progressionService.getLearnerLessonProgress(
      lessonId,
      req.user,
    );
  }
}
