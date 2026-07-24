# Mini Rack Simulator

An interactive browser-based planner for **10-inch half-rack** network builds.
Drag network gear into rack units, patch cables between ports, and get live
power, heat, and cabling feedback — then export the result as a PNG or a
shareable link.

🔗 **Live demo:** https://sam-omalley.github.io/mini-rack-simulator/

> Rebuilt from a single-file prototype into a modular, responsive, accessible
> [Vite](https://vitejs.dev/) app.

## Features

- **Drag-and-drop or tap-to-place** — grab a device from the library, or tap it
  and tap a slot (works on touch and by keyboard).
- **Live cabling** — drag between ports to run cables; they're auto-classified
  (standard/PoE, 10G, WAN, SFP+, patch jumper) with media-mismatch detection and
  routed through brush panels.
- **Power & thermal summary** — running estimate of power draw, PoE supply/demand,
  and a thermal hot-spot map for stacked high-heat gear.
- **20+ devices** — UniFi switches & gateways, patch panels, DeskPi Pi mounts and
  displays, Dell OptiPlex adapters, blanks and cable management.
- **Undo / redo**, autosave, JSON import/export, and shareable-URL layouts.
- **PNG export** of the finished rack.
- **Dark mode**, responsive layout, keyboard support, and reduced-motion support.

## Development

```bash
npm install      # install dependencies
npm run dev      # start the dev server (http://localhost:5173)
npm run build    # production build into dist/
npm run preview  # preview the production build locally
```

## Project structure

```
index.html              # app shell / markup
src/
  main.js               # entry point
  app.js                # controller: state, history, drag/drop, update pipeline
  data/devices.js       # device catalog, port specs, categories
  render/               # deviceFactory, cableManager, metrics
  features/             # persistence (save/share/JSON), PNG export
  ui/                   # tooltip, toast, theme
  utils/geometry.js     # SVG coordinate + cable-path helpers
  styles/               # modular CSS (variables, layout, rack, devices, …)
.github/workflows/      # GitHub Pages deploy
```

## Deployment

Pushes to `main` trigger a [GitHub Actions](.github/workflows/deploy.yml)
workflow that builds the site and publishes it to GitHub Pages.

## License

[MIT](./LICENSE)
