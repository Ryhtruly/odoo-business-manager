const fs = require('fs');
const code = fs.readFileSync('frontend/js/app.js', 'utf8');
let inStr = false;
let lastLine = -1;
const lines = code.split('\n');
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    if (line[j] === '`') {
      if (j > 0 && line[j-1] === '\\') continue;
      inStr = !inStr;
      if (inStr) lastLine = i + 1;
    }
  }
}
if (inStr) console.log('Unclosed backtick starting at line: ' + lastLine);
else console.log('All backticks matched');
