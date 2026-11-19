// Default cost items. Edit prices here to change the defaults for everyone,
// or use "Change cost values…" in the app to override them on one computer.
//
// unit: 'ft' = priced per linear foot, drawn as a line of connected points.
//       'ea' = priced per each, placed with one click per unit.
//
// PLACEHOLDER PRICES: only 34.5kV Cable ($200/ft) is a known value.
// Everything else is 0 until real prices are provided.
window.DEFAULT_ITEMS = [
  { id: 'conduit',          name: 'Conduit',                unit: 'ft', price: 0 },
  { id: 'secondary-cable',  name: 'Secondary Cable',        unit: 'ft', price: 0 },
  { id: 'comm-cable',       name: 'COMM Cable',             unit: 'ft', price: 0 },
  { id: '4.8kv-cable',      name: '4.8kV Cable',            unit: 'ft', price: 0 },
  { id: '34.5kv-cable',     name: '34.5kV Cable',           unit: 'ft', price: 200 },
  { id: 'structure',        name: 'Structure (H222/H202)',  unit: 'ea', price: 0 },
  { id: 'structure-methane',name: 'Structure Methane Zone', unit: 'ea', price: 0 },
  { id: 'handhole',         name: 'Handhole (HH)',          unit: 'ea', price: 0 },
  { id: 'transformer',      name: 'Transformer',            unit: 'ea', price: 0 },
  { id: 'pd-transformer',   name: '34.5kV PD Transformer',  unit: 'ea', price: 0 },
  { id: 'v-box',            name: 'V-Box',                  unit: 'ea', price: 0 },
  { id: 'ro-vista-switch',  name: 'RO Vista Switch',        unit: 'ea', price: 0 },
  { id: 'gfd-recloser',     name: 'GFD Recloser',           unit: 'ea', price: 0 },
  { id: 'meter-pedestal',   name: 'Meter Pedestal + J-Box', unit: 'ea', price: 0 },
  { id: 'telecom-cab',      name: 'Telecom Cab',            unit: 'ea', price: 0 },
  { id: 'pole-work',        name: 'Pole Work',              unit: 'ea', price: 0 },
];

window.RUN_COLORS = [
  '#e53935', '#1e40ff', '#16a34a', '#eab308', '#9333ea',
  '#b45360', '#111827', '#d946ef', '#0d9488', '#a16207',
];
