const fs = require('fs');

const text = fs.readFileSync('frontend/js/app.js', 'utf8');
const lines = text.split('\n');

let braces = 0;
let inStr = false, strChar = '';

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    const c = line[j];
    const prev = j > 0 ? line[j-1] : '';
    if (prev === '\\') continue;
    
    if (!inStr) {
      if (c === '"' || c === "'") { inStr = true; strChar = c; }
      else if (c === '`') { inStr = true; strChar = '`'; }
      else if (c === '{') braces++;
      else if (c === '}') braces--;
    } else {
      if (c === strChar) { inStr = false; strChar = ''; }
    }
  }
  
  // Report significant changes or when going negative
  if (braces < 0) {
    console.log(`Line ${i+1}: braces went NEGATIVE (${braces}): ${line.trim().substring(0,100)}`);
    break;
  }
}

console.log('Final brace count:', braces);
