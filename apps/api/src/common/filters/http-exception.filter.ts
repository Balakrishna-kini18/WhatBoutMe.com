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
      
      message = typeof res === 'string' ? res : (res.message || res.error || message);
      code = res.error ? res.error.replace(/\s+/g, '_').toUpperCase() : HttpStatus[status] || 'ERROR';

      // Special handling for class-validator errors
      if (Array.isArray(message)) {
        message = message.join(', ');
        code = 'VALIDATION_ERROR';
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    response.status(status).json({
      error: {
        code,
        message,
      },
    });
  }
}
