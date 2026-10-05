import { Controller, Post, Body, Get, Request, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { LoginDto, SignupDto, RefreshDto, EmailVerificationDto } from './dto/index.js';
export { LoginDto, SignupDto, RefreshDto, EmailVerificationDto };

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
  login(@Body() body: LoginDto) {
    const identifier = body.email?.trim() || body.phone?.trim() || '';
    return this.authService.login(identifier, body.password);
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
   * Admin Login: POST /auth/admin-login
   * Only ADMIN / SUPER_ADMIN / MANAGER roles can use this.
   */
  @Public()
  @Throttle(CREDENTIAL_LIMIT)
  @Post('admin-login')
  adminLogin(@Body() body: LoginDto) {
    return this.authService.adminLogin(body.email ?? '', body.password);
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
   * Logout all sessions
   */
  @Post('logout-all')
  logoutAll(@Request() req: any) {
    return this.authService.logoutAll(req.user.sub);
  }
}
