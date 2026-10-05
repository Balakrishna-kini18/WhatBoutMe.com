import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service.js';
import { WsJwtGuard } from './ws-jwt.guard.js';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  transports: ['websocket', 'polling'], // Allow fallback for older clients
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway Initialized');

    // Authentication Middleware: Prevent connection entirely if invalid
    server.use(async (socket: Socket, next) => {
      try {
        const token =
          socket.handshake.auth?.token ||
          socket.handshake.headers?.authorization?.split(' ')[1];

        if (!token) {
          return next(new Error('Authentication Error: Missing Token'));
        }

        const payload = this.jwtService.verify(token, {
          secret: process.env.JWT_SECRET || 'super-secret',
        });

        // Validate against session store (D2-042)
        const session = await this.prisma.userSession.findUnique({
          where: { token },
        });

        if (!session || session.revokedAt || (session.expiresAt && session.expiresAt < new Date())) {
          return next(new Error('Authentication Error: Session Invalid'));
        }

        // Attach user object to socket
        socket.data.user = payload;
        next();
      } catch (err: any) {
        next(new Error('Authentication Error: Invalid Token'));
      }
    });
  }

  handleConnection(client: Socket) {
    this.logger.debug(`Client connected: ${client.id} (User: ${client.data?.user?.sub})`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  // --- ROOM ROUTING (D2-043) ---

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('join_room')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody('room') room: string, // e.g. "batch:123" or "conversation:456"
  ) {
    if (!room) return;
    client.join(room);
    this.logger.debug(`Client ${client.id} joined room ${room}`);
    return { event: 'joined', room };
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('leave_room')
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody('room') room: string,
  ) {
    if (!room) return;
    client.leave(room);
    this.logger.debug(`Client ${client.id} left room ${room}`);
    return { event: 'left', room };
  }

  // --- MESSAGE BROADCASTING ---

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('send_message')
  handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { room: string; content: string },
  ) {
    // 1. You would optionally save the message to Postgres here or via REST API
    // 2. Broadcast to everyone in the room EXCEPT the sender
    client.to(payload.room).emit('new_message', {
      senderId: client.data.user.sub,
      content: payload.content,
      timestamp: new Date().toISOString(),
      room: payload.room,
    });

    return { event: 'message_sent', status: 'ok' };
  }

  // --- TYPING INDICATORS ---

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('typing_start')
  handleTypingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody('room') room: string,
  ) {
    client.to(room).emit('user_typing', {
      userId: client.data.user.sub,
      isTyping: true,
      room,
    });
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('typing_stop')
  handleTypingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody('room') room: string,
  ) {
    client.to(room).emit('user_typing', {
      userId: client.data.user.sub,
      isTyping: false,
      room,
    });
  }

  // --- READ RECEIPTS ---

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('mark_read')
  handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { room: string; messageId: string },
  ) {
    client.to(payload.room).emit('message_read', {
      userId: client.data.user.sub,
      messageId: payload.messageId,
      room: payload.room,
    });
  }
}
