import seed from '../data/prices.json';

const KEY = 'rack_sim_prices_v1';

/**
 * Device pricing. Seed values in prices.json are APPROXIMATE MSRPs for a rough
 * estimate — never authoritative. Users override per device type; overrides are
 * catalog-level (persist across layouts) so they aren't re-entered each build.
 *
 * `priceFor` returns the effective price (override → seed → null when unknown).
 */
export const Pricing = {
  overrides: {},
  currency: seed.currency,
  lastUpdated: seed.lastUpdated,

  load() {
    try {
      this.overrides = JSON.parse(localStorage.getItem(KEY)) || {};
    } catch {
      this.overrides = {};
    }
  },

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.overrides));
    } catch {
      /* non-fatal */
    }
  },

  seedFor(type) {
    return seed.prices[type] ?? null;
  },

  priceFor(type) {
    if (type in this.overrides) return this.overrides[type];
    return seed.prices[type] ?? null;
  },

  isOverridden(type) {
    return type in this.overrides;
  },

  /** Set (or clear, when blank/invalid) a price override for a device type. */
  setPrice(type, value) {
    const n = Number(value);
    if (value === '' || value == null || Number.isNaN(n) || n < 0) delete this.overrides[type];
    else this.overrides[type] = n;
    this.save();
  },
};

/** A bound price lookup for passing into computeBom. */
export const priceFn = (type) => Pricing.priceFor(type);
