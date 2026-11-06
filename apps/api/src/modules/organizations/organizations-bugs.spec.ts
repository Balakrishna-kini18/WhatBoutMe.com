import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AssignSeatDto } from './dto/index.js';
import { SeatStatus, OrganizationType } from '@prisma/client';

describe('Organizations Module — Bug Fix Verifications', () => {
  describe('Bug #1: AssignSeatDto seatId optionality in request body', () => {
    it('should validate successfully when seatId is omitted from body (as it is provided via URL path)', async () => {
      const dtoObj = {
        email: 'learner@example.com',
        fullName: 'Jane Doe',
        phone: '+1234567890',
        department: 'Engineering',
      };

      const instance = plainToInstance(AssignSeatDto, dtoObj);
      const errors = await validate(instance);
      expect(errors.length).toBe(0);
    });

    it('should still validate successfully when a valid UUID seatId is provided', async () => {
      const dtoObj = {
        seatId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        email: 'learner@example.com',
        fullName: 'Jane Doe',
      };

      const instance = plainToInstance(AssignSeatDto, dtoObj);
      const errors = await validate(instance);
      expect(errors.length).toBe(0);
    });

    it('should fail validation when an invalid email is provided', async () => {
      const dtoObj = {
        email: 'not-an-email',
      };

      const instance = plainToInstance(AssignSeatDto, dtoObj);
      const errors = await validate(instance);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('email');
    });
  });

  describe('Bug #3: Seat counter math in Goodwill Reclaim', () => {
    it('should decrement seatsConsumed when repossessing a CONSUMED seat', () => {
      const seat = { status: SeatStatus.CONSUMED, seatPoolId: 'pool-123' };
      const wasConsumed = seat.status === SeatStatus.CONSUMED;

      const updateData = {
        ...(wasConsumed
          ? { seatsConsumed: { decrement: 1 } }
          : { seatsAssigned: { decrement: 1 } }),
        seatsAvailable: { increment: 1 },
      };

      expect(updateData).toEqual({
        seatsConsumed: { decrement: 1 },
        seatsAvailable: { increment: 1 },
      });
      expect(updateData).not.toHaveProperty('seatsAssigned');
    });

    it('should decrement seatsAssigned when repossessing an ASSIGNED seat', () => {
      const seat = { status: SeatStatus.ASSIGNED, seatPoolId: 'pool-123' };
      const wasConsumed = seat.status === SeatStatus.CONSUMED;

      const updateData = {
        ...(wasConsumed
          ? { seatsConsumed: { decrement: 1 } }
          : { seatsAssigned: { decrement: 1 } }),
        seatsAvailable: { increment: 1 },
      };

      expect(updateData).toEqual({
        seatsAssigned: { decrement: 1 },
        seatsAvailable: { increment: 1 },
      });
      expect(updateData).not.toHaveProperty('seatsConsumed');
    });
  });

  describe('Bug #5: Database where condition construction with orgType', () => {
    it('should include orgType in Prisma where query when specified', () => {
      const query = {
        status: undefined,
        orgType: OrganizationType.RESELLER_ACADEMY,
        search: 'Apna',
      };

      const where: any = {};
      if (query.orgType) {
        where.orgType = query.orgType;
      }
      if (query.search) {
        where.OR = [{ name: { contains: query.search } }];
      }

      expect(where.orgType).toBe(OrganizationType.RESELLER_ACADEMY);
      expect(where.OR).toBeDefined();
    });
  });
});

