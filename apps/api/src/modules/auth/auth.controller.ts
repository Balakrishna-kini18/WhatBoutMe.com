import { Controller, Post, Body, Get, Request } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { IsString, IsEmail, IsNotEmpty, IsOptional, IsArray, ValidateIf } from 'class-validator';

export class LoginDto {
  // sign in with either the account email or its mobile number
  @ValidateIf((o) => !o.phone) @IsEmail() @IsNotEmpty() email?: string;
  @ValidateIf((o) => !o.email) @IsString() @IsNotEmpty() phone?: string;
  @IsString() @IsNotEmpty() password: string;
}

export class SignupDto {
  @IsString() @IsNotEmpty() name: string;
  @IsEmail() @IsNotEmpty() email: string;
  @IsOptional() @IsString() phone?: string;
  @IsString() @IsNotEmpty() password: string;
  @IsOptional() @IsArray() @IsString({ each: true }) programIds?: string[];
}

export class RefreshDto {
  @IsString() @IsNotEmpty() refresh_token: string;
}

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
    return this.authService.login(body.email ?? body.phone ?? '', body.password);
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
