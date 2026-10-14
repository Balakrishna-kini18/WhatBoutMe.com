import { Controller, Post, Body, Get, Request, Query, Delete, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { AuthService } from './auth.service.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import {
  LoginDto,
  SignupDto,
  SendSignupOtpDto,
  RefreshDto,
  EmailVerificationDto,
  PasswordResetRequestDto,
  PasswordResetConfirmDto,
  TotpSetupDto,
  TotpVerifyDto,
  OtpSendDto,
  OtpVerifyDto,
} from './dto/index.js';
export {
  LoginDto,
  SignupDto,
  SendSignupOtpDto,
  RefreshDto,
  EmailVerificationDto,
  PasswordResetRequestDto,
  PasswordResetConfirmDto,
  TotpSetupDto,
  TotpVerifyDto,
  OtpSendDto,
  OtpVerifyDto,
};

// Strict limit for the endpoints that take a password. Applied per endpoint,
// not to the whole controller: /auth/me, /auth/session and /auth/refresh are
// called on every page load and by the 60-second session check, and under the
// strict limit a signed-in learner was bounced back to the login page.
const CREDENTIAL_LIMIT = { default: { limit: 5, ttl: 60000 } };

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Learner Login: POST /auth/login
   */
  @Public()
  @Throttle(CREDENTIAL_LIMIT)
  @Post('login')
  login(@Body() body: LoginDto, @Request() req?: any) {
    const identifier = body.email?.trim() || body.phone?.trim() || '';
    const ipAddress = req?.ip || req?.socket?.remoteAddress || null;
    const userAgent = req?.headers?.['user-agent'] || null;
    const deviceFingerprint = (req?.headers?.['x-device-fingerprint'] as string) || null;
    const country = (req?.headers?.['cf-ipcountry'] as string) || (req?.headers?.['x-country-code'] as string) || null;
    return this.authService.login(identifier, body.password, {
      ipAddress,
      userAgent,
      deviceFingerprint,
      country,
    });
  }

  /**
   * Request Signup Email OTP: POST /auth/signup/send-otp
   */
  @Public()
  @Post('signup/send-otp')
  sendSignupOtp(@Body() body: SendSignupOtpDto) {
    return this.authService.sendSignupOtp(body.email, body.name, body.phone);
  }

  /**
   * Learner Signup: POST /auth/signup
   */
  @Public()
  @Throttle(CREDENTIAL_LIMIT)
  @Post('signup')
  signup(@Body() body: SignupDto) {
    return this.authService.signup(body);
  }

  /**
   * Learner Email Verification: POST /auth/verify-email
   */
  @Public()
  @Post('verify-email')
  verifyEmail(@Body() body: EmailVerificationDto) {
    return this.authService.verifyEmail(body.token);
  }

  /**
   * Learner Email Verification: GET /auth/verify-email?token=...
   */
  @Public()
  @Get('verify-email')
  verifyEmailGet(@Query() query: EmailVerificationDto) {
    return this.authService.verifyEmail(query.token);
  }

  /**
   * Password Reset Request: POST /auth/password-reset/request
   */
  @Public()
  @Throttle(CREDENTIAL_LIMIT)
  @Post('password-reset/request')
  requestPasswordReset(@Body() body: PasswordResetRequestDto) {
    return this.authService.requestPasswordReset(body.email);
  }

  /**
   * Password Reset Confirm: POST /auth/password-reset/confirm
   */
  @Public()
  @Throttle(CREDENTIAL_LIMIT)
  @Post('password-reset/confirm')
  confirmPasswordReset(@Body() body: PasswordResetConfirmDto) {
    const newPassword = body.newPassword || body.password || '';
    return this.authService.confirmPasswordReset(body.token, newPassword);
  }

  /**
   * Send Email OTP: POST /auth/otp/send
   */
  @Public()
  @Post('otp/send')
  sendOtp(@Body() body: OtpSendDto) {
    return this.authService.sendEmailOtp(body.email);
  }

  /**
   * Verify Email OTP: POST /auth/otp/verify
   */
  @Public()
  @Post('otp/verify')
  verifyOtp(@Body() body: OtpVerifyDto) {
    return this.authService.verifyEmailOtp(body.email, body.code);
  }

  /**
   * Admin Login: POST /auth/admin-login
   * Only ADMIN / SUPER_ADMIN / MANAGER roles can use this.
   */
  @Public()
  @Throttle(CREDENTIAL_LIMIT)
  @Post('admin-login')
  adminLogin(@Body() body: LoginDto, @Request() req?: any) {
    const ipAddress = req?.ip || req?.socket?.remoteAddress || null;
    const userAgent = req?.headers?.['user-agent'] || null;
    const deviceFingerprint = (req?.headers?.['x-device-fingerprint'] as string) || null;
    const country = (req?.headers?.['cf-ipcountry'] as string) || (req?.headers?.['x-country-code'] as string) || null;
    return this.authService.adminLogin(body.email ?? '', body.password, {
      ipAddress,
      userAgent,
      deviceFingerprint,
      country,
    });
  }

  /**
   * 2FA Setup - Generate Secret: POST /auth/2fa/generate
   * Authenticated. Only SUPER_ADMIN and ADMIN roles can generate a TOTP secret.
   */
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Post('2fa/generate')
  generate2fa(@Request() req: any) {
    return this.authService.generate2faSecret(req.user.sub);
  }

  /**
   * 2FA Setup - Enable TOTP: POST /auth/2fa/enable
   * Authenticated. Only SUPER_ADMIN and ADMIN roles can enable 2FA after verifying code.
   */
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  @Post('2fa/enable')
  enable2fa(@Body() body: TotpSetupDto, @Request() req: any) {
    return this.authService.enable2fa(req.user.sub, body.code, body.secret);
  }

  /**
   * 2FA Verify - Complete Login: POST /auth/2fa/verify
   * Public (second step of admin login), throttled.
   */
  @Public()
  @Throttle(CREDENTIAL_LIMIT)
  @Post('2fa/verify')
  verify2fa(@Body() body: TotpVerifyDto, @Request() req?: any) {
    const tempToken =
      body.tempToken ||
      (req?.headers?.['x-temp-token'] as string) ||
      (req?.headers?.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.substring(7)
        : undefined) ||
      '';
    const code = body.backupCode || body.code;
    const ipAddress = req?.ip || req?.socket?.remoteAddress || null;
    const userAgent = req?.headers?.['user-agent'] || null;
    const deviceFingerprint = (req?.headers?.['x-device-fingerprint'] as string) || null;
    const country = (req?.headers?.['cf-ipcountry'] as string) || (req?.headers?.['x-country-code'] as string) || null;
    return this.authService.verify2fa(tempToken, code, {
      ipAddress,
      userAgent,
      deviceFingerprint,
      country,
    });
  }

  /**
   * Refresh Token: POST /auth/refresh
   */
  @Public()
  @Post('refresh')
  refreshToken(@Body() body: RefreshDto) {
    return this.authService.refreshToken(body.refresh_token);
  }

  /**
   * Get current user profile (requires valid JWT): GET /auth/me
   * Returns user info + enrolled programs for tenant separation.
   */
  @Get('me')
  getProfile(@Request() req: any) {
    return this.authService.getProfile(req.user.sub);
  }

  /**
   * Check session status: GET /auth/session
   */
  @Get('session')
  async checkSession(@Request() req: any) {
    // throws when the session has ended; the row itself (it holds the
    // refresh-token hash) stays on the server
    await this.authService.checkSession(req.user.sessionId);
    return { active: true };
  }

  /**
   * Logout current session: POST /auth/logout
   */
  @Post('logout')
  logout(@Request() req: any) {
    return this.authService.logout(req.user.sub, req.user.sessionId);
  }

  /**
   * Logout all sessions: POST /auth/logout-all
   */
  @Post('logout-all')
  logoutAll(@Request() req: any) {
    return this.authService.logoutAll(req.user.sub);
  }

  /**
   * List all active sessions for current user: GET /auth/sessions
   */
  @Get('sessions')
  getSessions(@Request() req: any) {
    return this.authService.getSessions(req.user.sub, req.user.sessionId);
  }

  /**
   * Revoke specific session: DELETE /auth/sessions/:id
   */
  @Delete('sessions/:id')
  revokeSession(@Param('id') id: string, @Request() req: any) {
    return this.authService.revokeSession(req.user.sub, id, req.user.sessionId);
  }

  /**
   * Revoke specific session (POST alternative): POST /auth/sessions/:id/revoke
   */
  @Post('sessions/:id/revoke')
  revokeSessionPost(@Param('id') id: string, @Request() req: any) {
    return this.authService.revokeSession(req.user.sub, id, req.user.sessionId);
  }
}
