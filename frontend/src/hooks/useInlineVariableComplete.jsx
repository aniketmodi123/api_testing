import { useCallback, useRef, useState } from 'react';
import { useVariableSuggestions } from './useVariableSuggestions';

// What this file does: drives a {{variable}} autocomplete dropdown for plain
// <input>/<textarea> elements — detects an open token at the caret, filters the
// merged variable list, and inserts the chosen key on selection.

const TOKEN_CHARS = /^[a-zA-Z0-9_\- ]*$/;

/**
 * What it does: locates an unclosed ``{{`` token ending at the caret.
 *
 * Returns:
 *   { start, query }: byte offset of the ``{{`` and the typed text after it.
 *   null: when the caret is not inside an open, valid variable token.
 */
export function findOpenToken(text, caret) {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf('{{');
  if (start === -1) return null;
  const inner = before.slice(start + 2);
  if (inner.includes('}}')) return null;
  if (!TOKEN_CHARS.test(inner)) return null;
  return { start, query: inner.trim() };
}

/**
 * What it does: produces the text and caret position after inserting a variable.
 */
export function insertVariable(text, caret, start, key) {
  const after = text.slice(caret);
  const rest = after.startsWith('}}') ? after.slice(2) : after;
  const newText = `${text.slice(0, start)}{{${key}}}${rest}`;
  const newCaret = start + 2 + key.length + 2;
  return { newText, newCaret };
}

/**
 * What it does: manages autocomplete state for a single text field.
 *
 * Args:
 *   elRef: ref to the <input>/<textarea> DOM node.
 *   value: current text value of the field.
 *   applyValue: (newText, newCaret) => void — commits the inserted text and
 *               restores the caret in the host component.
 */
export function useInlineVariableComplete({ elRef, value, applyValue }) {
  const suggestions = useVariableSuggestions();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const startRef = useRef(0);

  const close = useCallback(() => setOpen(false), []);

  // Recompute open-state and filtered items from the current caret position.
  // Read the live DOM value so detection isn't a keystroke behind the React prop.
  const refresh = useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    const token = findOpenToken(el.value ?? '', el.selectionStart ?? 0);
    if (!token) {
      setOpen(false);
      return;
    }
    const q = token.query.toLowerCase();
    const filtered = q
      ? suggestions.filter(s => s.key.toLowerCase().includes(q))
      : suggestions;
    if (filtered.length === 0) {
      setOpen(false);
      return;
    }
    startRef.current = token.start;
    setItems(filtered);
    setActiveIndex(0);
    setOpen(true);
  }, [elRef, value, suggestions]);

  const selectItem = useCallback(
    item => {
      const el = elRef.current;
      if (!el || !item) return;
      const text = el.value ?? value ?? '';
      const caret = el.selectionStart ?? text.length;
      const { newText, newCaret } = insertVariable(text, caret, startRef.current, item.key);
      applyValue(newText, newCaret);
      setOpen(false);
    },
    [elRef, value, applyValue]
  );

  const handleKeyDown = useCallback(
    e => {
      if (!open) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(i => (i + 1) % items.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(i => (i - 1 + items.length) % items.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectItem(items[activeIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    },
    [open, items, activeIndex, selectItem]
  );

  return { open, items, activeIndex, setActiveIndex, refresh, selectItem, handleKeyDown, close };
}
