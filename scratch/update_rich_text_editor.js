const fs = require('fs');

const editorPath = 'apps/lms/app/components/notes/VisualRichTextEditor.tsx';
let editorContent = fs.readFileSync(editorPath, 'utf8');

const targetSection = `{/* Soft Highlighter */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleHighlight();
          }}
          className={btnClass(false)}
          title="Highlight Takeaway"
          aria-label="Highlight takeaway"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: compact ? 2 : 4 }}>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          {compact ? 'Highlight' : 'Highlight'}
        </button>

        <span className={styles.toolDivider} />

        {/* Bullet List */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            executeCommand('insertUnorderedList');
          }}
          className={btnClass(isBullet)}
          title="Bullet List"
          aria-label="Bullet list"
        >
          {compact ? '• List' : '• Bullet List'}
        </button>

        {/* Numbered List */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            executeCommand('insertOrderedList');
          }}
          className={btnClass(isNumbered)}
          title="Numbered List"
          aria-label="Numbered list"
        >
          {compact ? '1. List' : '1. Numbered List'}
        </button>

        <span className={styles.toolDivider} />

        {/* Clear formatting */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleClearFormat();
          }}
          className={btnClass(false)}
          title="Clear formatting"
          aria-label="Clear formatting"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 3 }}>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          Clear
        </button>`;

const replacementSection = `<span className={styles.mobileRowBreak} />

        {/* Soft Highlighter */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleHighlight();
          }}
          className={\`\${btnClass(false)} \${styles.highlightBtn}\`}
          title="Highlight Takeaway"
          aria-label="Highlight takeaway"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: compact ? 2 : 4 }}>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          {compact ? 'Highlight' : 'Highlight'}
        </button>

        <span className={styles.toolDivider} />

        {/* Bullet List */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            executeCommand('insertUnorderedList');
          }}
          className={btnClass(isBullet)}
          title="Bullet List"
          aria-label="Bullet list"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: compact ? 2 : 4 }}>
            <line x1="8" y1="6" x2="21" y2="6"/>
            <line x1="8" y1="12" x2="21" y2="12"/>
            <line x1="8" y1="18" x2="21" y2="18"/>
            <line x1="3" y1="6" x2="3.01" y2="6"/>
            <line x1="3" y1="12" x2="3.01" y2="12"/>
            <line x1="3" y1="18" x2="3.01" y2="18"/>
          </svg>
          {compact ? 'List' : 'Bullet List'}
        </button>

        <span className={styles.mobileRowBreak} />

        {/* Numbered List */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            executeCommand('insertOrderedList');
          }}
          className={btnClass(isNumbered)}
          title="Numbered List"
          aria-label="Numbered list"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: compact ? 2 : 4 }}>
            <line x1="10" y1="6" x2="21" y2="6"/>
            <line x1="10" y1="12" x2="21" y2="12"/>
            <line x1="10" y1="18" x2="21" y2="18"/>
            <path d="M4 6h1v4"/>
            <path d="M4 10h2"/>
            <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>
          </svg>
          {compact ? 'List' : 'Numbered List'}
        </button>

        <span className={styles.toolDivider} />

        {/* Clear formatting */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleClearFormat();
          }}
          className={btnClass(false)}
          title="Clear formatting"
          aria-label="Clear formatting"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 3 }}>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          Clear
        </button>`;

// Normalize CRLF
const normalizedContent = editorContent.replace(/\r\n/g, '\n');
const normalizedTarget = targetSection.replace(/\r\n/g, '\n');

if (!normalizedContent.includes(normalizedTarget)) {
  console.error('targetSection not found in VisualRichTextEditor.tsx');
  process.exit(1);
}

const updatedContent = normalizedContent.replace(normalizedTarget, replacementSection);
fs.writeFileSync(editorPath, updatedContent, 'utf8');
console.log('Successfully updated VisualRichTextEditor.tsx with toolbar mobileRowBreak and list icons');

