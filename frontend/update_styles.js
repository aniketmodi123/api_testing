const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src/styles/global.css');

let content = fs.readFileSync(file, 'utf8');

// We use regex to replace everything from :root { to }
// But we actually have multiple blocks. We can replace from :root { all the way until `/* [data-theme="light"] {` or so.
// Let's just create a completely new file preserving what we need.

// Instead of regex, let's just write a script to replace the color variables completely.
