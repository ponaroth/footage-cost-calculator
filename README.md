# Footage Cost Calculator

Desktop app (Windows and Mac) for estimating cable and equipment costs from a plan image.

1. **Load an image**: choose a file, drag it onto the window, or paste a screenshot (Ctrl+V / ⌘V).
2. **Calibrate the scale**: click *Start scale calibration*, click two points on the image, enter the real length between them in feet and click *Apply calibration*.
3. **Draw runs**: pick a cost item and click *Start new run / group*.
   - Per-foot items (cables, conduit) are drawn as lines: each click adds a point and the length is measured.
   - Per-each items (transformers, structures, handholes…) are placed with one click per unit.
   - Pick an existing run under *Add points to* (or click it in the summary) to keep adding to it.
4. **Review the estimate**: each run shows its quantity and cost. You can undo points, remove a run, or change its color. The totals include an editable contingency (30% by default).
5. **Export**: *Export PDF* (8.5×11, 11×17 or 22×32 landscape, plan on the left and breakdown on the right) or *Export Excel* (estimate sheet with live formulas, plus the marked-up plan on a second sheet).

Zoom with the mouse wheel or trackpad, or with the + / − / Fit buttons. Drag to pan. Shortcuts: Ctrl/⌘+Z undo last point, Esc cancel calibration, `0` fit to window.

## Prices

Default prices live in [`src/items.js`](src/items.js). **They are placeholders.** Only 34.5kV Cable ($200/ft) is a known value, and everything else is $0 until real prices are added. Users can also override prices and units on their own computer with *Change cost values…*.

## Development

```bash
npm install
npm start          # run the app
npm run dist       # build an installer for the current OS (output in dist/)
```

The UI is plain HTML/CSS/JS in `src/`, and `src/index.html` also works when opened directly in a browser. `main.js` is the Electron shell. The PDF and Excel libraries are vendored in `src/vendor/`; run `npm run vendor` after upgrading `jspdf` or `exceljs`.

## Getting the Windows and Mac installers

The **Build desktop apps** GitHub Actions workflow builds a Windows installer and portable `.exe`, plus a Mac `.dmg`, on every push to `main` and on pull requests. Download them from the workflow run's *Artifacts* section.

The builds are not code-signed. On Windows, click *More info → Run anyway* in the SmartScreen prompt. On Mac, right-click the app and choose *Open* the first time.
