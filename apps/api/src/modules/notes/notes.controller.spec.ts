import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotesController } from './notes.controller.js';
import { NotesService } from './notes.service.js';

describe('NotesController', () => {
  let controller: NotesController;
  let serviceMock: any;

  beforeEach(async () => {
    serviceMock = {
      create: vi.fn().mockResolvedValue({ id: 'note-1' }),
      findAll: vi.fn().mockResolvedValue([{ id: 'note-1' }]),
      findByLesson: vi.fn().mockResolvedValue([{ id: 'note-1' }]),
      findOne: vi.fn().mockResolvedValue({ id: 'note-1' }),
      update: vi.fn().mockResolvedValue({ id: 'note-1', noteText: 'new' }),
      delete: vi.fn().mockResolvedValue({ success: true, id: 'note-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotesController],
      providers: [
        { provide: NotesService, useValue: serviceMock },
      ],
    }).compile();

    controller = module.get<NotesController>(NotesController);
  });

  it('delegates create with user ID', async () => {
    const req = { user: { id: 'u1' } };
    await controller.create(req, { noteText: 'Hello' });
    expect(serviceMock.create).toHaveBeenCalledWith('u1', { noteText: 'Hello' });
  });

  it('delegates findAll with query', async () => {
    const req = { user: { id: 'u1' } };
    await controller.findAll(req, { search: 'test' });
    expect(serviceMock.findAll).toHaveBeenCalledWith('u1', { search: 'test' });
  });

  it('delegates findByLesson', async () => {
    const req = { user: { id: 'u1' } };
    await controller.findByLesson(req, 'l1');
    expect(serviceMock.findByLesson).toHaveBeenCalledWith('u1', 'l1');
  });

  it('delegates update', async () => {
    const req = { user: { id: 'u1' } };
    await controller.update(req, 'n1', { noteText: 'new' });
    expect(serviceMock.update).toHaveBeenCalledWith('u1', 'n1', { noteText: 'new' });
  });

  it('delegates delete', async () => {
    const req = { user: { id: 'u1' } };
    await controller.delete(req, 'n1');
    expect(serviceMock.delete).toHaveBeenCalledWith('u1', 'n1');
  });
});
