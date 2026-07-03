import styles from './DiffView.module.css';

/**
 * Side-by-side diff of two JSON objects.
 * Lines present in left but not right = removed (red).
 * Lines present in right but not left = added (green).
 * Matching lines = neutral.
 */

function toLines(obj) {
  try {
    return JSON.stringify(obj, null, 2).split('\n');
  } catch {
    return [String(obj)];
  }
}

function computeDiff(leftLines, rightLines) {
  // Simple LCS-based line diff
  const m = leftLines.length;
  const n = rightLines.length;

  // Build LCS table (length only, then traceback)
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (leftLines[i - 1] === rightLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Traceback
  const leftResult = [];
  const rightResult = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && leftLines[i - 1] === rightLines[j - 1]) {
      leftResult.unshift({ text: leftLines[i - 1], type: 'same' });
      rightResult.unshift({ text: rightLines[j - 1], type: 'same' });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      leftResult.unshift({ text: '', type: 'empty' });
      rightResult.unshift({ text: rightLines[j - 1], type: 'added' });
      j--;
    } else {
      leftResult.unshift({ text: leftLines[i - 1], type: 'removed' });
      rightResult.unshift({ text: '', type: 'empty' });
      i--;
    }
  }
  return { leftResult, rightResult };
}

export default function DiffView({ expected, actual }) {
  const leftLines = toLines(expected);
  const rightLines = toLines(actual);
  const { leftResult, rightResult } = computeDiff(leftLines, rightLines);

  const hasDiff = leftResult.some((l, i) => l.type !== 'same' || rightResult[i].type !== 'same');

  if (!hasDiff) {
    return (
      <div className={styles.noDiff}>
        Expected and actual match exactly.
      </div>
    );
  }

  return (
    <div className={styles.diffContainer}>
      <div className={styles.side}>
        <div className={styles.sideHeader}>Expected</div>
        <pre className={styles.code}>
          {leftResult.map((line, idx) => (
            <div key={idx} className={`${styles.line} ${styles[line.type]}`}>
              {line.type === 'removed' ? '− ' : '  '}{line.text}
            </div>
          ))}
        </pre>
      </div>
      <div className={styles.divider} />
      <div className={styles.side}>
        <div className={styles.sideHeader}>Actual</div>
        <pre className={styles.code}>
          {rightResult.map((line, idx) => (
            <div key={idx} className={`${styles.line} ${styles[line.type]}`}>
              {line.type === 'added' ? '+ ' : '  '}{line.text}
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
