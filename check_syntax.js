const fs = require('fs');
const acorn = require('acorn');

const code = fs.readFileSync('frontend/js/app.js', 'utf8');
try {
  acorn.parse(code, { ecmaVersion: 2022 });
  console.log('No syntax errors');
} catch (e) {
  console.error(e.message, 'at line', e.loc.line, 'col', e.loc.column);
}
