import { Injectable, Logger } from '@nestjs/common';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaService } from '../../prisma/prisma.service.js';
import { STORAGE_DIR } from '../website/storage.js';

export interface VolumeTier {
  minSeats: number;
  discountPercent: number; // e.g. 10 for 10%
  label?: string; // e.g. "10+ seats"
}

export interface VolumePricingConfig {
  enabled: boolean;
  tiers: VolumeTier[];
  quickPresets: number[]; // e.g. [10, 25, 50, 100]
  customNote?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_VOLUME_PRICING: VolumePricingConfig = {
  enabled: true,
  tiers: [
    { minSeats: 10, discountPercent: 10, label: '10+ seats' },
    { minSeats: 25, discountPercent: 15, label: '25+ seats' },
    { minSeats: 50, discountPercent: 25, label: '50+ seats' },
  ],
  quickPresets: [10, 25, 50, 100],
  customNote: 'Volume discounts: 10+ seats: 10% off • 25+ seats: 15% off • 50+ seats: 25% off',
};

@Injectable()
export class VolumePricingService {
  private readonly logger = new Logger(VolumePricingService.name);
  private readonly configFilePath = join(STORAGE_DIR, 'volume-pricing.json');
  private inMemoryCache: VolumePricingConfig | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async getPricingConfig(): Promise<VolumePricingConfig> {
    if (this.inMemoryCache) {
      return this.inMemoryCache;
    }

    try {
      const data = await readFile(this.configFilePath, 'utf8');
      const parsed = JSON.parse(data);
      if (parsed && Array.isArray(parsed.tiers) && parsed.tiers.length > 0) {
        this.inMemoryCache = {
          enabled: parsed.enabled !== false,
          tiers: parsed.tiers.sort((a: VolumeTier, b: VolumeTier) => a.minSeats - b.minSeats),
          quickPresets:
            Array.isArray(parsed.quickPresets) && parsed.quickPresets.length > 0
              ? parsed.quickPresets
              : [10, 25, 50, 100],
          customNote: parsed.customNote || DEFAULT_VOLUME_PRICING.customNote,
          updatedAt: parsed.updatedAt,
          updatedBy: parsed.updatedBy,
        };
        return this.inMemoryCache;
      }
    } catch {
      // Fallback to default
    }

    this.inMemoryCache = { ...DEFAULT_VOLUME_PRICING };
    return this.inMemoryCache;
  }

  async updatePricingConfig(
    newConfig: Partial<VolumePricingConfig>,
    actorUser?: any,
  ): Promise<VolumePricingConfig> {
    const current = await this.getPricingConfig();

    const rawTiers = newConfig.tiers || current.tiers;
    const cleanTiers: VolumeTier[] = rawTiers
      .filter((t) => Number(t.minSeats) > 0 && Number(t.discountPercent) >= 0 && Number(t.discountPercent) <= 100)
      .map((t) => ({
        minSeats: Math.round(Number(t.minSeats)),
        discountPercent: Math.round(Number(t.discountPercent)),
        label: t.label || `${t.minSeats}+ seats`,
      }))
      .sort((a, b) => a.minSeats - b.minSeats);

    const rawPresets = newConfig.quickPresets || current.quickPresets;
    const cleanPresets: number[] = rawPresets
      .map((q) => Math.round(Number(q)))
      .filter((q) => q > 0)
      .sort((a, b) => a - b);

    // Auto-generate note if not custom
    const tierSummaries = cleanTiers
      .map((t) => `${t.minSeats}+ seats: ${t.discountPercent}% off`)
      .join(' • ');
    const autoNote = `Volume discounts: ${tierSummaries}`;

    const updated: VolumePricingConfig = {
      enabled: newConfig.enabled !== undefined ? Boolean(newConfig.enabled) : current.enabled,
      tiers: cleanTiers.length > 0 ? cleanTiers : DEFAULT_VOLUME_PRICING.tiers,
      quickPresets: cleanPresets.length > 0 ? cleanPresets : [10, 25, 50, 100],
      customNote: newConfig.customNote !== undefined ? newConfig.customNote : autoNote,
      updatedAt: new Date().toISOString(),
      updatedBy: actorUser?.email || actorUser?.name || actorUser?.id || 'Admin',
    };

    try {
      await mkdir(STORAGE_DIR, { recursive: true });
      const tempPath = `${this.configFilePath}.tmp`;
      await writeFile(tempPath, JSON.stringify(updated, null, 2), 'utf8');
      await rename(tempPath, this.configFilePath);
    } catch (err: any) {
      this.logger.warn(
        `Failed to persist volume pricing to disk, keeping in memory: ${err?.message || err}`,
      );
    }

    this.inMemoryCache = updated;

    if (actorUser && actorUser.id) {
      try {
        await this.prisma.auditLog.create({
          data: {
            actorId: actorUser.id,
            action: 'VOLUME_PRICING_UPDATED',
            entity: 'OrganizationPricing',
            entityId: 'global',
            meta: JSON.parse(JSON.stringify({
              tiers: cleanTiers,
              quickPresets: cleanPresets,
              enabled: updated.enabled,
              reason: `Updated organization volume pricing tiers: ${cleanTiers.length} active tiers`,
            })),
          },
        });
      } catch (err: any) {
        this.logger.warn(`Could not write audit log for volume pricing update: ${err?.message}`);
      }
    }

    return updated;
  }

  async getDiscountRate(seatsCount: number): Promise<number> {
    const config = await this.getPricingConfig();
    if (!config.enabled) return 0;

    // Sort descending by minSeats to match highest qualifying tier
    const sorted = [...config.tiers].sort((a, b) => b.minSeats - a.minSeats);
    for (const tier of sorted) {
      if (seatsCount >= tier.minSeats) {
        return tier.discountPercent / 100;
      }
    }

    return 0;
  }
}
