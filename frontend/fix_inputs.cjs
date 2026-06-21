const fs = require('fs');

let css = fs.readFileSync('src/styles/global.css', 'utf8');
if (!css.includes('.input:focus')) {
  css += `\n
.input:focus, textarea:focus, select:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}
`;
  fs.writeFileSync('src/styles/global.css', css);
  console.log('Added input focus styles');
}
