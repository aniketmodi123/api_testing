const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(filePath));
    } else {
      if (filePath.endsWith('.css') || filePath.endsWith('.jsx')) {
        results.push(filePath);
      }
    }
  });
  return results;
}

const files = walk('src');
for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // Replace colors not tied to standard fallbacks. We will be careful.
  content = content.replace(/#f44336/g, 'var(--error)');
  content = content.replace(/#4caf50/g, 'var(--success)');
  content = content.replace(/#f59e0b/g, 'var(--warning)');
  content = content.replace(/#ef4444/g, 'var(--error)');
  content = content.replace(/#888888/gi, 'var(--text-muted)');
  content = content.replace(/color:\s*#fff(fff)?;/gi, 'color: var(--text);');
  content = content.replace(/#22c55e/g, 'var(--success)');

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
  }
}
console.log('Done fixing colors!');
