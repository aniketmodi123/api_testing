const fs = require('fs');

function replaceColors(file) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(/#1e1e1e/g, 'var(--surface-2)');
  content = content.replace(/#d4d4d4/g, 'var(--text)');
  content = content.replace(/#555/g, 'var(--border)');
  content = content.replace(/#3c3c3c/g, 'var(--surface-3)');
  content = content.replace(/#2b2b2b/g, 'var(--surface-2)');
  content = content.replace(/#f0f0f0/g, 'var(--text)');
  content = content.replace(/#4c8bf5/g, 'var(--accent)');
  content = content.replace(/#e3f2fd/g, 'var(--info-dim)');
  content = content.replace(/#2196f3/g, 'var(--info)');
  content = content.replace(/#1976d2/g, 'var(--info)');
  content = content.replace(/#aaa/g, 'var(--text-muted)');
  fs.writeFileSync(file, content, 'utf8');
}

replaceColors('src/components/ApiForm/ApiForm.module.css');
if (fs.existsSync('src/components/ApiForm/ApiForm.jsx')) {
  let jsx = fs.readFileSync('src/components/ApiForm/ApiForm.jsx', 'utf8');
  jsx = jsx.replace(/#e3f2fd/g, 'var(--info-dim)');
  jsx = jsx.replace(/#2196f3/g, 'var(--info)');
  jsx = jsx.replace(/#1976d2/g, 'var(--info)');
  fs.writeFileSync('src/components/ApiForm/ApiForm.jsx', jsx, 'utf8');
}

