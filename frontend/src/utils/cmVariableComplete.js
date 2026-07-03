import { autocompletion, startCompletion } from '@codemirror/autocomplete';
import { EditorView } from '@codemirror/view';

// What this file does: builds a CodeMirror autocomplete extension that suggests
// {{variable}} keys (local + global, pre-merged by the caller), themed to match the
// app, and that opens the popup as soon as the user types the opening "{{".

const OPEN_TOKEN = /\{\{\s*[a-zA-Z0-9_-]*$/;

function makeSource(items) {
  return context => {
    const before = context.matchBefore(OPEN_TOKEN);
    if (!before) return null;

    // Start completing right after "{{" and any whitespace.
    const openIdx = before.text.indexOf('{{');
    const afterOpen = before.text.slice(openIdx + 2);
    const lead = afterOpen.match(/^\s*/)[0].length;
    const from = before.from + openIdx + 2 + lead;

    const word = context.state.sliceDoc(from, context.pos).toLowerCase();
    const options = items
      .filter(i => i.key.toLowerCase().includes(word))
      .map(i => ({
        label: i.key,
        detail: i.source,
        info: i.is_secret ? '••••••' : i.value || '',
        // Don't add "}}" if the closing braces already follow the cursor.
        apply: (view, completion, from, to) => {
          const hasCloser = view.state.sliceDoc(to, to + 2) === '}}';
          const insert = hasCloser ? i.key : `${i.key}}}`;
          view.dispatch({
            changes: { from, to, insert },
            selection: { anchor: from + i.key.length + 2 },
          });
        },
      }));

    if (options.length === 0) return null;
    // explicit:true when the user only typed "{{" (empty word) so all vars show.
    return { from, options, filter: false };
  };
}

// Open the popup the moment "{{" is typed, instead of waiting for a word char.
const triggerOnBraces = EditorView.updateListener.of(update => {
  if (!update.docChanged) return;
  const { head } = update.state.selection.main;
  if (head < 2) return;
  if (update.state.sliceDoc(head - 2, head) === '{{') {
    // Defer so the change transaction settles before starting completion.
    setTimeout(() => startCompletion(update.view), 0);
  }
});

// Themed to the app's design tokens — overrides CodeMirror's default popup look.
const completionTheme = EditorView.theme({
  '.cm-tooltip.cm-tooltip-autocomplete': {
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    background: 'var(--surface-2)',
    boxShadow: 'var(--shadow-lg)',
    overflow: 'hidden',
  },
  '.cm-tooltip-autocomplete > ul': {
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
    maxHeight: '240px',
    padding: '4px',
  },
  '.cm-tooltip-autocomplete > ul > li': {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 8px',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text)',
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    background: 'var(--surface-3)',
    color: 'var(--text)',
  },
  '.cm-completionLabel': {
    color: 'var(--accent)',
    fontWeight: '600',
  },
  '.cm-completionMatchedText': {
    color: 'var(--accent)',
    textDecoration: 'none',
    fontWeight: '700',
  },
  '.cm-completionDetail': {
    marginLeft: 'auto',
    color: 'var(--text-muted)',
    fontStyle: 'italic',
    fontSize: '9px',
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
  },
  '.cm-tooltip.cm-completionInfo': {
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    background: 'var(--surface-2)',
    color: 'var(--text-subtle)',
    padding: '6px 8px',
    fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)',
  },
});

/**
 * What it does: returns CodeMirror extensions that autocomplete variable keys.
 *
 * Args:
 *   items: merged variable list — ``[{ key, value, source, is_secret }]``.
 */
export function makeVariableCompletion(items) {
  return [
    autocompletion({
      override: [makeSource(items)],
      activateOnTyping: true,
      icons: false,
    }),
    triggerOnBraces,
    completionTheme,
  ];
}
