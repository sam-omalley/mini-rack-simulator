import { describe, it, expect } from 'vitest';
import { DEVICE_TYPES } from '../src/data/devices.js';
import { rearLayoutFor } from '../src/render/deviceFactory.js';

const KNOWN = ['blank', 'passthrough', 'punchdown', 'open', 'backplane', 'fan', 'pdu', 'psu'];

describe('rearLayoutFor', () => {
  it('gives every catalog device a known rear face', () => {
    Object.entries(DEVICE_TYPES).forEach(([type, spec]) => {
      expect(KNOWN, `${type} resolved to an unknown rear`).toContain(rearLayoutFor(spec));
    });
  });

  it('sends patch panels to the punch-down bank', () => {
    ['patch-8', 'patch-12', 'deskpi-dp0034'].forEach((t) => {
      expect(rearLayoutFor(DEVICE_TYPES[t])).toBe('punchdown');
    });
  });

  it('leaves blank plates blank — a blank has no power side', () => {
    expect(rearLayoutFor(DEVICE_TYPES['blank'])).toBe('blank');
    expect(rearLayoutFor(DEVICE_TYPES['blank-half'])).toBe('blank');
  });

  it('treats cable-entry panels as openings, not blanks', () => {
    expect(rearLayoutFor(DEVICE_TYPES['brush-panel'])).toBe('passthrough');
    expect(rearLayoutFor(DEVICE_TYPES['deskpi-dp0043'])).toBe('passthrough');
  });

  it('reads drive cages as backplanes and other carriers as open', () => {
    expect(rearLayoutFor(DEVICE_TYPES['hdd-cage-2u-6x'])).toBe('backplane');
    expect(rearLayoutFor(DEVICE_TYPES['drive-cage-6'])).toBe('backplane');
    expect(rearLayoutFor(DEVICE_TYPES['shelf-2slot'])).toBe('open');
  });

  it('keeps shelves open, including one whose port would imply a PSU', () => {
    expect(rearLayoutFor(DEVICE_TYPES['shelf-1u'])).toBe('open');
    expect(rearLayoutFor(DEVICE_TYPES['geeekpi-minipc-shelf-1u'])).toBe('open');
  });

  it('routes powered gear, PDUs and fans to their own faces', () => {
    expect(rearLayoutFor(DEVICE_TYPES['usw-pro-xg-8-poe'])).toBe('psu');
    expect(rearLayoutFor(DEVICE_TYPES['pdu-8'])).toBe('pdu');
    expect(rearLayoutFor(DEVICE_TYPES['ups-1u'])).toBe('pdu');
    expect(rearLayoutFor(DEVICE_TYPES['geeekpi-fan-1u-4x'])).toBe('fan');
  });

  it('honours an explicit override over the inference', () => {
    expect(rearLayoutFor({ ports: [], watts: 50, rear: 'blank' })).toBe('blank');
  });
});
