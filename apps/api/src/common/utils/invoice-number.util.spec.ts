import { describe, it, expect, vi } from 'vitest';
import { generateSequentialInvoiceNumber } from './invoice-number.util.js';

describe('generateSequentialInvoiceNumber', () => {
  it('increments sequence atomically using InvoiceCounter table', async () => {
    let currentSeq = 0;
    const prismaMock = {
      invoiceCounter: {
        upsert: vi.fn().mockImplementation(async ({ create, update }) => {
          currentSeq += 1;
          return { year: 2026, lastSeq: currentSeq };
        }),
      },
    };

    const inv1 = await generateSequentialInvoiceNumber(prismaMock, new Date('2026-05-01'));
    const inv2 = await generateSequentialInvoiceNumber(prismaMock, new Date('2026-05-01'));

    expect(inv1).toBe('WBM-INV-2026-00001');
    expect(inv2).toBe('WBM-INV-2026-00002');
    expect(prismaMock.invoiceCounter.upsert).toHaveBeenCalledTimes(2);
  });

  it('falls back gracefully when invoiceCounter is not available in mock', async () => {
    const inv = await generateSequentialInvoiceNumber({}, new Date('2026-05-01'));
    expect(inv).toMatch(/^WBM-INV-2026-\d{5}$/);
  });
});

