import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import {
  AdminAgreementTemplatesController,
  LearnerAgreementsController,
} from './agreements.controller.js';
import { AgreementsService } from './agreements.service.js';
import { PERMISSIONS_KEY } from '../../common/decorators/require-permission.decorator.js';
import {
  Permission,
  roleHasPermission,
} from '../../config/permissions.config.js';

describe('D1-039: Agreement Controllers - Route & Authorization Tests', () => {
  let adminController: AdminAgreementTemplatesController;
  let learnerController: LearnerAgreementsController;
  let serviceMock: any;
  const reflector = new Reflector();

  beforeEach(() => {
    serviceMock = {
      createTemplate: vi.fn(),
      findAllTemplates: vi.fn(),
      findTemplateById: vi.fn(),
      updateTemplate: vi.fn(),
      createVersion: vi.fn(),
      findAllVersions: vi.fn(),
      findVersionById: vi.fn(),
      updateVersion: vi.fn(),
      publishVersion: vi.fn(),
      deleteVersion: vi.fn(),
      getActiveVersionForProgram: vi.fn(),
      signAgreement: vi.fn(),
      getSignedAgreementForEnrolment: vi.fn(),
      getSignedAgreementsForTemplate: vi.fn(),
    };


    adminController = new AdminAgreementTemplatesController(
      serviceMock as unknown as AgreementsService,
    );
    learnerController = new LearnerAgreementsController(
      serviceMock as unknown as AgreementsService,
    );
  });

  describe('Admin Controller Delegations', () => {
    it('delegates createTemplate to service', async () => {
      serviceMock.createTemplate.mockResolvedValueOnce({ id: 'tpl-1' });
      const req = { user: { id: 'admin-1' }, ip: '127.0.0.1' };
      const dto = { programId: 'prog-1', title: 'Terms' };

      const res = await adminController.createTemplate(dto, req);
      expect(res).toEqual({ id: 'tpl-1' });
      expect(serviceMock.createTemplate).toHaveBeenCalledWith(
        dto,
        'admin-1',
        '127.0.0.1',
      );
    });

    it('delegates createVersion to service', async () => {
      serviceMock.createVersion.mockResolvedValueOnce({ id: 'ver-1' });
      const req = { user: { id: 'admin-1' }, ip: '127.0.0.1' };
      const dto = { version: 'v1.0', content: 'Terms v1.0' };

      const res = await adminController.createVersion('tpl-1', dto, req);
      expect(res).toEqual({ id: 'ver-1' });
      expect(serviceMock.createVersion).toHaveBeenCalledWith(
        'tpl-1',
        dto,
        'admin-1',
        '127.0.0.1',
      );
    });

    it('delegates publishVersion to service', async () => {
      serviceMock.publishVersion.mockResolvedValueOnce({
        id: 'ver-1',
        status: 'PUBLISHED',
      });
      const req = { user: { id: 'admin-1' }, ip: '127.0.0.1' };

      const res = await adminController.publishVersion('tpl-1', 'ver-1', req);
      expect(res).toEqual({ id: 'ver-1', status: 'PUBLISHED' });
      expect(serviceMock.publishVersion).toHaveBeenCalledWith(
        'tpl-1',
        'ver-1',
        'admin-1',
        '127.0.0.1',
      );
    });
  });

  describe('Learner Controller Delegations', () => {
    it('delegates getActiveVersionForProgram to service', async () => {
      serviceMock.getActiveVersionForProgram.mockResolvedValueOnce({
        versionId: 'ver-1',
        version: 'v1.0',
      });

      const res = await learnerController.getActiveVersionForProgram('prog-1');
      expect(res).toEqual({ versionId: 'ver-1', version: 'v1.0' });
      expect(serviceMock.getActiveVersionForProgram).toHaveBeenCalledWith('prog-1');
    });

    it('delegates signAgreement to service with user, IP, and user-agent', async () => {
      serviceMock.signAgreement.mockResolvedValueOnce({
        id: 'signed-1',
        status: 'SIGNED',
      });

      const req = {
        user: { id: 'user-1', role: Role.USER },
        ip: '10.0.0.1',
        headers: { 'user-agent': 'Chrome/120' },
      };
      const dto = {
        enrolmentId: 'enrol-1',
        consentGiven: true,
        typedName: 'Jane Doe',
        drawnSignature: 'data:image/png;base64,...',
      };

      const res = await learnerController.signAgreement(dto, req);
      expect(res).toEqual({ id: 'signed-1', status: 'SIGNED' });
      expect(serviceMock.signAgreement).toHaveBeenCalledWith(
        dto,
        req.user,
        '10.0.0.1',
        'Chrome/120',
      );
    });

    it('delegates getSignedAgreementForEnrolment to service', async () => {
      serviceMock.getSignedAgreementForEnrolment.mockResolvedValueOnce({
        id: 'signed-1',
        enrolmentId: 'enrol-1',
      });

      const req = { user: { id: 'user-1', role: Role.USER } };
      const res = await learnerController.getSignedAgreementForEnrolment('enrol-1', req);
      expect(res).toEqual({ id: 'signed-1', enrolmentId: 'enrol-1' });
      expect(serviceMock.getSignedAgreementForEnrolment).toHaveBeenCalledWith(
        'enrol-1',
        req.user,
      );
    });
  });

  describe('Admin Controller Signed Agreement Delegations', () => {
    it('delegates getSignedAgreementsForTemplate to service', async () => {
      serviceMock.getSignedAgreementsForTemplate.mockResolvedValueOnce([
        { id: 'signed-1' },
      ]);

      const res = await adminController.getSignedAgreementsForTemplate('tpl-1');
      expect(res).toEqual([{ id: 'signed-1' }]);
      expect(serviceMock.getSignedAgreementsForTemplate).toHaveBeenCalledWith('tpl-1');
    });
  });

  describe('Route Permission Annotations', () => {
    it('decorates createTemplate with AGREEMENTS_CREATE_TEMPLATE permission', () => {
      const perm = reflector.get(
        PERMISSIONS_KEY,
        AdminAgreementTemplatesController.prototype.createTemplate,
      );
      expect(perm).toEqual([Permission.AGREEMENTS_CREATE_TEMPLATE]);
    });

    it('decorates createVersion with AGREEMENTS_CREATE_TEMPLATE permission', () => {
      const perm = reflector.get(
        PERMISSIONS_KEY,
        AdminAgreementTemplatesController.prototype.createVersion,
      );
      expect(perm).toEqual([Permission.AGREEMENTS_CREATE_TEMPLATE]);
    });

    it('decorates updateVersion with AGREEMENTS_CREATE_TEMPLATE permission', () => {
      const perm = reflector.get(
        PERMISSIONS_KEY,
        AdminAgreementTemplatesController.prototype.updateVersion,
      );
      expect(perm).toEqual([Permission.AGREEMENTS_CREATE_TEMPLATE]);
    });

    it('decorates publishVersion with AGREEMENTS_CREATE_TEMPLATE permission', () => {
      const perm = reflector.get(
        PERMISSIONS_KEY,
        AdminAgreementTemplatesController.prototype.publishVersion,
      );
      expect(perm).toEqual([Permission.AGREEMENTS_CREATE_TEMPLATE]);
    });

    it('decorates findAllTemplates with AGREEMENTS_READ permission', () => {
      const perm = reflector.get(
        PERMISSIONS_KEY,
        AdminAgreementTemplatesController.prototype.findAllTemplates,
      );
      expect(perm).toEqual([Permission.AGREEMENTS_READ]);
    });

    it('decorates getActiveVersionForProgram with AGREEMENTS_READ permission', () => {
      const perm = reflector.get(
        PERMISSIONS_KEY,
        LearnerAgreementsController.prototype.getActiveVersionForProgram,
      );
      expect(perm).toEqual([Permission.AGREEMENTS_READ]);
    });

    it('decorates signAgreement with AGREEMENTS_SIGN permission', () => {
      const perm = reflector.get(
        PERMISSIONS_KEY,
        LearnerAgreementsController.prototype.signAgreement,
      );
      expect(perm).toEqual([Permission.AGREEMENTS_SIGN]);
    });

    it('decorates getSignedAgreementForEnrolment with AGREEMENTS_READ permission', () => {
      const perm = reflector.get(
        PERMISSIONS_KEY,
        LearnerAgreementsController.prototype.getSignedAgreementForEnrolment,
      );
      expect(perm).toEqual([Permission.AGREEMENTS_READ]);
    });

    it('decorates getSignedAgreementsForTemplate with AGREEMENTS_READ permission', () => {
      const perm = reflector.get(
        PERMISSIONS_KEY,
        AdminAgreementTemplatesController.prototype.getSignedAgreementsForTemplate,
      );
      expect(perm).toEqual([Permission.AGREEMENTS_READ]);
    });
  });

  describe('Role-Based Authorization Enforcement (Requirement 9 & D1-040)', () => {
    it('SUPER_ADMIN is granted template authoring, signing, and read permissions', () => {
      expect(
        roleHasPermission(Role.SUPER_ADMIN, Permission.AGREEMENTS_CREATE_TEMPLATE),
      ).toBe(true);
      expect(roleHasPermission(Role.SUPER_ADMIN, Permission.AGREEMENTS_READ)).toBe(
        true,
      );
      expect(roleHasPermission(Role.SUPER_ADMIN, Permission.AGREEMENTS_SIGN)).toBe(
        true,
      );
    });

    it('ADMIN is granted template authoring, signing, and read permissions', () => {
      expect(
        roleHasPermission(Role.ADMIN, Permission.AGREEMENTS_CREATE_TEMPLATE),
      ).toBe(true);
      expect(roleHasPermission(Role.ADMIN, Permission.AGREEMENTS_READ)).toBe(true);
      expect(roleHasPermission(Role.ADMIN, Permission.AGREEMENTS_SIGN)).toBe(true);
    });

    it('MANAGER is DENIED template authoring privileges but granted read access', () => {
      expect(
        roleHasPermission(Role.MANAGER, Permission.AGREEMENTS_CREATE_TEMPLATE),
      ).toBe(false);
      expect(roleHasPermission(Role.MANAGER, Permission.AGREEMENTS_READ)).toBe(
        true,
      );
    });

    it('USER (Learner) is granted AGREEMENTS_SIGN and AGREEMENTS_READ, but DENIED template authoring', () => {
      expect(
        roleHasPermission(Role.USER, Permission.AGREEMENTS_CREATE_TEMPLATE),
      ).toBe(false);
      expect(roleHasPermission(Role.USER, Permission.AGREEMENTS_READ)).toBe(true);
      expect(roleHasPermission(Role.USER, Permission.AGREEMENTS_SIGN)).toBe(true);
    });
  });
});
