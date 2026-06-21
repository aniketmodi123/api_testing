const fs = require('fs');

let css = fs.readFileSync('src/styles/global.css', 'utf8');
if (!css.includes('.cm-property')) {
  css += `\n
/* CodeMirror Global Custom Theme Override */
.cm-editor {
  background-color: var(--surface-2) !important;
  color: var(--text) !important;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}

.cm-editor.cm-focused {
  outline: none !important;
  border-color: var(--accent) !important;
}

.cm-gutters {
  background-color: var(--surface-1) !important;
  color: var(--text-muted) !important;
  border-right: 1px solid var(--border) !important;
}

.cm-activeLine, .cm-activeLineGutter {
  background-color: var(--surface-3) !important;
}

/* Syntax Highlighting */
.cm-property, .tok-propertyName {
  color: var(--json-key) !important;
}

.cm-string, .cm-string-2, .tok-string {
  color: var(--json-string) !important;
}

.cm-number, .tok-number {
  color: var(--json-number) !important;
}

.cm-boolean, .cm-keyword, .tok-keyword, .tok-bool {
  color: var(--json-boolean) !important;
}

.cm-atom, .tok-null {
  color: var(--json-null) !important;
}
`;
  fs.writeFileSync('src/styles/global.css', css);
  console.log('Added CodeMirror to global CSS');
}
