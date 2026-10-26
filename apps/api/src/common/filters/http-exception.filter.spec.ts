import { describe, it, expect, vi } from 'vitest';
import { HttpExceptionFilter } from './http-exception.filter.js';
import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common';

describe('HttpExceptionFilter', () => {
  const createMockHost = (responseObj: any): ArgumentsHost => {
    return {
      switchToHttp: () => ({
        getResponse: () => responseObj,
        getRequest: () => ({}),
        getNext: () => ({}),
      }),
    } as unknown as ArgumentsHost;
  };

  it('preserves structured reason in response when exception has reason field', () => {
    const filter = new HttpExceptionFilter();
    let jsonPayload: any = null;
    let statusCode: number = 0;

    const mockResponse = {
      headersSent: false,
      status: vi.fn().mockImplementation((status: number) => {
        statusCode = status;
        return {
          json: vi.fn().mockImplementation((payload: any) => {
            jsonPayload = payload;
          }),
        };
      }),
    };

    const host = createMockHost(mockResponse);
    const exception = new UnauthorizedException({
      message: 'Session revoked due to token reuse',
      error: 'SESSION_REVOKED',
      reason: 'TOKEN_REUSED',
    });

    filter.catch(exception, host);

    expect(statusCode).toBe(HttpStatus.UNAUTHORIZED);
    expect(jsonPayload).toBeDefined();
    expect(jsonPayload.reason).toBe('TOKEN_REUSED');
    expect(jsonPayload.error).toEqual({
      code: 'SESSION_REVOKED',
      message: 'Session revoked due to token reuse',
      reason: 'TOKEN_REUSED',
    });
  });

  it('preserves DEVICE_LIMIT_EXCEEDED reason properly', () => {
    const filter = new HttpExceptionFilter();
    let jsonPayload: any = null;
    let statusCode: number = 0;

    const mockResponse = {
      headersSent: false,
      status: vi.fn().mockImplementation((status: number) => {
        statusCode = status;
        return {
          json: vi.fn().mockImplementation((payload: any) => {
            jsonPayload = payload;
          }),
        };
      }),
    };

    const host = createMockHost(mockResponse);
    const exception = new UnauthorizedException({
      message: 'You were logged out because this account was logged in from another device',
      error: 'SESSION_REVOKED',
      reason: 'DEVICE_LIMIT_EXCEEDED',
    });

    filter.catch(exception, host);

    expect(statusCode).toBe(HttpStatus.UNAUTHORIZED);
    expect(jsonPayload.reason).toBe('DEVICE_LIMIT_EXCEEDED');
    expect(jsonPayload.error.code).toBe('SESSION_REVOKED');
    expect(jsonPayload.error.reason).toBe('DEVICE_LIMIT_EXCEEDED');
  });

  it('formats standard exceptions without reason cleanly', () => {
    const filter = new HttpExceptionFilter();
    let jsonPayload: any = null;
    let statusCode: number = 0;

    const mockResponse = {
      headersSent: false,
      status: vi.fn().mockImplementation((status: number) => {
        statusCode = status;
        return {
          json: vi.fn().mockImplementation((payload: any) => {
            jsonPayload = payload;
          }),
        };
      }),
    };

    const host = createMockHost(mockResponse);
    const exception = new HttpException('Forbidden resource', HttpStatus.FORBIDDEN);

    filter.catch(exception, host);

    expect(statusCode).toBe(HttpStatus.FORBIDDEN);
    expect(jsonPayload.error.code).toBe('FORBIDDEN');
    expect(jsonPayload.error.message).toBe('Forbidden resource');
    expect(jsonPayload.reason).toBeUndefined();
  });
});
