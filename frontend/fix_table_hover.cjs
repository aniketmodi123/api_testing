const fs = require('fs');

let css = fs.readFileSync('src/styles/global.css', 'utf8');
if (!css.includes('tr:hover')) {
  css += `\n
tr {
  transition: background-color 0.15s ease;
}

tr:hover {
  background-color: var(--surface-3);
}

.tableRow:hover, .listRow:hover, .kvRow:hover {
  background-color: var(--surface-3);
  border-radius: var(--radius-sm);
}

kbd {
  background-color: var(--surface-2);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 2px 6px;
  font-family: var(--font-mono);
  font-size: 11px;
}
`;
  fs.writeFileSync('src/styles/global.css', css);
  console.log('Added table hover styles');
}
