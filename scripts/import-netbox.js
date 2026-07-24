#!/usr/bin/env node
/**
 * NetBox devicetype-library → Mini Rack Simulator catalog importer.
 *
 * The NetBox community device-type library (https://github.com/netbox-community/
 * devicetype-library, CC0) is structured YAML whose fields map closely onto our
 * DEVICE_TYPES schema. This offline tool converts one or more of those YAML files
 * into catalog entries you can paste into src/data/devices.js.
 *
 * Usage:
 *   node scripts/import-netbox.js <file-or-dir> [more...]
 *   node scripts/import-netbox.js path/to/Ubiquiti/USW-Lite-8-PoE.yaml
 *
 * Output: pretty-printed JS object entries on stdout. Review before pasting —
 * NetBox is crowdsourced and 19"-focused, so bracketWidth / 10" fit / exact PoE
 * budgets still need a datasheet pass. See scripts/README.md for the field map.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { load } from 'js-yaml';

// NetBox interface `type` → our port key (base, no PoE).
const IFACE_MAP = {
  '1000base-t': 'gbe',
  '2.5gbase-t': '2.5g',
  '5gbase-t': '2.5g',
  '10gbase-t': '10g',
  '10gbase-x-sfpp': 'sfp',
  '1000base-x-sfp': 'sfp',
  '25gbase-x-sfp28': 'sfp',
};

// Apply PoE-sourcing (pse) upgrades to the base key where we have a PoE variant.
const POE_MAP = { gbe: 'poe', '2.5g': 'poe-2.5g', '10g': '10g-poe' };

function mapInterface(iface) {
  const base = IFACE_MAP[iface.type] ?? 'gbe';
  const sourcesPoe = iface.poe_mode === 'pse';
  return sourcesPoe ? (POE_MAP[base] ?? base) : base;
}

function convert(doc) {
  const interfaces = Array.isArray(doc.interfaces) ? doc.interfaces : [];
  const outlets = Array.isArray(doc['power-outlets']) ? doc['power-outlets'].length : 0;
  const ports = interfaces.map(mapInterface);
  const uHeight = clamp(Math.ceil(Number(doc.u_height) || 1), 1, 3);

  const powerPorts = Array.isArray(doc['power-ports']) ? doc['power-ports'] : [];
  const watts = powerPorts.reduce((max, p) => Math.max(max, Number(p.allocated_draw || p.maximum_draw || 0)), 0);

  const entry = {
    name: doc.model || doc.slug || 'Imported Device',
    ports,
    uHeight,
    bracket: true,
    bracketWidth: clamp(60 + ports.length * 20, 90, 280),
    watts,
    poeBudget: 0,
    heatWeight: watts > 20 ? 3 : watts > 0 ? 1 : 0,
    // Carried through for later features (front/back view, sourcing links).
    netboxSlug: doc.slug,
    isFullDepth: Boolean(doc.is_full_depth),
  };
  if (outlets > 0) {
    entry.layout = 'pdu';
    entry.outlets = outlets;
    entry.ports = [];
  }
  return { key: doc.slug || slug(entry.name), entry };
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}
function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function collectFiles(paths) {
  const files = [];
  for (const p of paths) {
    if (statSync(p).isDirectory()) {
      for (const name of readdirSync(p)) {
        if (['.yaml', '.yml'].includes(extname(name))) files.push(join(p, name));
      }
    } else {
      files.push(p);
    }
  }
  return files;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('Usage: node scripts/import-netbox.js <file-or-dir> [more...]');
    process.exit(1);
  }
  const entries = {};
  for (const file of collectFiles(args)) {
    try {
      const { key, entry } = convert(load(readFileSync(file, 'utf8')));
      entries[key] = entry;
    } catch (err) {
      console.error(`Skipped ${file}: ${err.message}`);
    }
  }
  // Emit as pasteable JS object entries.
  const body = Object.entries(entries)
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
    .join('\n');
  console.log(`// Imported ${Object.keys(entries).length} device(s) — review before merging.\n{\n${body}\n}`);
}

main();
