import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res: any = exception.getResponse();

      // Pass through Terminus health-check payloads directly with full status indicators
      if (res && typeof res === 'object' && (res.details || res.info || (res.status && res.error && typeof res.error === 'object'))) {
        if (response.headersSent) {
          return;
        }
        response.status(status).json(res);
        return;
      }
      
      if (typeof res === 'string') {
        message = res;
        code = HttpStatus[status] || 'ERROR';
      } else if (res && typeof res === 'object') {
        if (typeof res.message === 'string') {
          message = res.message;
        } else if (Array.isArray(res.message)) {
          message = res.message.join(', ');
          code = 'VALIDATION_ERROR';
        } else if (typeof res.error === 'string') {
          message = res.error;
        } else if (res.message) {
          message = JSON.stringify(res.message);
        }

        if (typeof res.error === 'string') {
          code = res.error.replace(/\s+/g, '_').toUpperCase();
        } else {
          code = HttpStatus[status] || 'ERROR';
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      if (
        (exception as any).type === 'entity.too.large' ||
        (exception as any).status === 413 ||
        exception.message?.toLowerCase().includes('entity too large')
      ) {
        status = HttpStatus.PAYLOAD_TOO_LARGE;
        code = 'PAYLOAD_TOO_LARGE';
        message = 'The uploaded file exceeds the allowed size limit. Please upload a smaller file or compress it.';
      }
    }

    let reason: string | undefined;
    if (exception instanceof HttpException) {
      const res: any = exception.getResponse();
      if (res && typeof res === 'object') {
        if (typeof res.reason === 'string') {
          reason = res.reason;
        } else if (res.error && typeof res.error === 'object' && typeof res.error.reason === 'string') {
          reason = res.error.reason;
        }
      }
    }

    if (response.headersSent) {
      return;
    }

    response.status(status).json({
      error: {
        code,
        message,
        ...(reason ? { reason } : {}),
      },
      ...(reason ? { reason } : {}),
    });
  }
}
