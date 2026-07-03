const fs = require('fs');

let css = fs.readFileSync('src/styles/global.css', 'utf8');
css = css.replace(/box-shadow: 0 10px 30px rgba\(0, 0, 0, 0\.08\);/g, 'box-shadow: none;');
fs.writeFileSync('src/styles/global.css', css);
console.log('Fixed card shadows');
