# Device import tooling

## `import-netbox.js`

Converts [NetBox devicetype-library](https://github.com/netbox-community/devicetype-library)
YAML into Mini Rack Simulator catalog entries.

The NetBox library is **CC0 (public domain)** and structured, so it's a reliable
bulk source for port counts, port types, PoE, and U-height. It is **crowdsourced
and 19"-rack focused**, so always review the output and fill the 10"-specific
gaps from the manufacturer datasheet.

### Usage

```bash
# A single device file, or a whole vendor directory:
node scripts/import-netbox.js path/to/devicetype-library/device-types/Ubiquiti
node scripts/import-netbox.js some-switch.yaml other.yaml
```

It prints pasteable JS object entries on stdout. Review, then merge the ones you
want into `src/data/devices.js` and add them to a `CATEGORIES` group.

### Field mapping

| NetBox field                                  | Catalog field             | Notes                                      |
| --------------------------------------------- | ------------------------- | ------------------------------------------ |
| `model`                                       | `name`                    | Falls back to `slug`.                      |
| `u_height`                                    | `uHeight`                 | `Math.ceil`, clamped to 1–3.               |
| `interfaces[].type`                           | `ports[]`                 | See interface map below.                   |
| `interfaces[].poe_mode: pse`                  | PoE port variant          | `gbe→poe`, `2.5g→poe-2.5g`, `10g→10g-poe`. |
| `power-outlets[]`                             | `outlets` + `layout: pdu` | Presence marks the device a PDU.           |
| `power-ports[].allocated_draw`/`maximum_draw` | `watts`                   | Max across ports.                          |
| `is_full_depth`                               | `isFullDepth`             | Carried for the front/back view feature.   |
| `slug`                                        | `netboxSlug` + object key |                                            |

Interface types: `1000base-t→gbe`, `2.5gbase-t→2.5g`, `5gbase-t→2.5g`,
`10gbase-t→10g`, `10gbase-x-sfpp / 1000base-x-sfp / 25gbase-x-sfp28→sfp`.
Unknown types fall back to `gbe`.

### Always verify from the datasheet

- `bracketWidth` and physical 10" fit (NetBox has neither).
- `poeBudget` (NetBox models per-port PoE, not a switch's total budget).
- WAN designation (`wan-2.5g` / `wan-10g`) — NetBox doesn't distinguish uplinks.
