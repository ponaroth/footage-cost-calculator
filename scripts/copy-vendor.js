// Copies the browser builds of the export libraries into src/vendor so the
// app works both in Electron and when src/index.html is opened in a browser.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const files = [
  ['node_modules/jspdf/dist/jspdf.umd.min.js', 'src/vendor/jspdf.umd.min.js'],
  ['node_modules/exceljs/dist/exceljs.min.js', 'src/vendor/exceljs.min.js'],
];
for (const [from, to] of files) {
  fs.copyFileSync(path.join(root, from), path.join(root, to));
  console.log('copied', to);
}
