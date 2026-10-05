import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client: Socket = context.switchToWs().getClient<Socket>();
      
      // Clients usually send the token in the auth payload when connecting:
      // const socket = io('ws://localhost:4000', { auth: { token: '...' } })
      const token = 
        client.handshake?.auth?.token || 
        client.handshake?.headers?.authorization?.split(' ')[1];

      if (!token) {
        throw new WsException('Unauthorized');
      }

      // Verify the JWT signature
      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET || 'super-secret',
      });

      // (Optional but requested) Validate against session store (UserSession table)
      // For performance in an extremely high scale app, you might only check Redis.
      // But for completeness we check the Postgres UserSession table:
      const session = await this.prisma.userSession.findUnique({
        where: { token },
      });

      if (!session || session.revokedAt || (session.expiresAt && session.expiresAt < new Date())) {
        throw new WsException('Session expired or revoked');
      }

      // Attach user to the socket object so we can use it in the gateway handlers
      client.data.user = payload;
      
      return true;
    } catch (err: any) {
      this.logger.warn(`WS connection failed: ${err.message}`);
      throw new WsException('Unauthorized');
    }
  }
}
