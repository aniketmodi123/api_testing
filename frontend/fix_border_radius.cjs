const fs = require('fs');

let css = fs.readFileSync('src/styles/global.css', 'utf8');

// The user specified "Border radius: 8–10px." Let's update radius vars in :root
css = css.replace(/--radius:\s*6px;/g, '--radius: 8px;');
css = css.replace(/--radius-sm:\s*4px;/g, '--radius-sm: 6px;');
css = css.replace(/--radius-md:\s*8px;/g, '--radius-md: 10px;');
css = css.replace(/--radius-lg:\s*12px;/g, '--radius-lg: 12px;');

fs.writeFileSync('src/styles/global.css', css);
console.log('Fixed border radius globally');
