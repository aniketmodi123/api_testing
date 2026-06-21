import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
} from '@codemirror/view';

// What this file does: provides a CodeMirror extension that colors {{variable}} tokens
// the same accent style used by the URL bar, so variables stand out inside body editors.

const TOKEN_RE = /\{\{\s*[a-zA-Z_][a-zA-Z0-9_-]*\s*\}\}/g;

const tokenMark = Decoration.mark({ class: 'cm-variable-token' });

const matcher = new MatchDecorator({
  regexp: TOKEN_RE,
  decoration: () => tokenMark,
});

const tokenPlugin = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = matcher.createDeco(view);
    }
    update(update) {
      this.decorations = matcher.updateDeco(update, this.decorations);
    }
  },
  { decorations: instance => instance.decorations }
);

// Scoped to the editor — resolves --accent from the surrounding CSS cascade.
const tokenTheme = EditorView.baseTheme({
  '.cm-variable-token': {
    color: 'var(--accent)',
    fontWeight: '600',
  },
  // Accent caret so it stays visible on the editor's gray background.
  '&': {
    caretColor: 'var(--accent)',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--accent)',
    borderLeftWidth: '2px',
  },
});

// Nested array — CodeMirror flattens it when spread into `extensions`.
export const variableHighlight = [tokenPlugin, tokenTheme];
