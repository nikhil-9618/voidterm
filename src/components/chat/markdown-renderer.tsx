'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { Check, Copy, Download, TerminalSquare } from 'lucide-react';
import { filenameFromFence, mimeForFilename, parseFenceInfo } from '@/lib/artifacts';
import { downloadTextFile } from '@/lib/download';
import { cn } from '@/lib/utils';

function safeUrlTransform(url: string): string {
  // React Markdown's default transform blocks dangerous protocols. Restrict the
  // remaining schemes to ordinary web navigation so model output cannot create
  // data:, file:, or custom-protocol links.
  const normalized = defaultUrlTransform(url);
  if (!normalized) return '';
  const protocol = /^([a-z][a-z0-9+.-]*):/i.exec(normalized)?.[1]?.toLowerCase();
  if (protocol && !['http', 'https', 'mailto'].includes(protocol)) return '';
  return normalized;
}

const codeTheme: { [key: string]: CSSProperties } = {
  'code[class*="language-"]': {
    color: '#E6EDF3',
    fontFamily: 'var(--font-mono)',
    fontSize: '12.5px',
    lineHeight: '1.65',
    direction: 'ltr',
    textAlign: 'left',
    whiteSpace: 'pre',
    wordSpacing: 'normal',
    wordBreak: 'normal',
    tabSize: 2,
    hyphens: 'none',
  },
  'pre[class*="language-"]': {
    color: '#E6EDF3',
    fontFamily: 'var(--font-mono)',
    fontSize: '12.5px',
    lineHeight: '1.65',
    margin: 0,
    padding: 0,
    background: 'transparent',
    overflow: 'auto',
  },
  comment: { color: '#5C6B7F', fontStyle: 'italic' },
  prolog: { color: '#5C6B7F' },
  doctype: { color: '#5C6B7F' },
  cdata: { color: '#5C6B7F' },
  punctuation: { color: '#8B98A9' },
  property: { color: '#7FD6FF' },
  tag: { color: '#FF7B72' },
  boolean: { color: '#FFB454' },
  number: { color: '#FFB454' },
  constant: { color: '#79C0FF' },
  selector: { color: '#D2A8FF' },
  'attr-name': { color: '#FFB454' },
  string: { color: '#7EE787' },
  char: { color: '#7EE787' },
  builtin: { color: '#79C0FF' },
  inserted: { color: '#7EE787' },
  operator: { color: '#8B98A9' },
  entity: { color: '#FFB454' },
  url: { color: '#7FD6FF' },
  atrule: { color: '#D2A8FF' },
  'attr-value': { color: '#7EE787' },
  keyword: { color: '#FF7B72' },
  function: { color: '#D2A8FF' },
  'class-name': { color: '#FFB454' },
  regex: { color: '#7EE787' },
  important: { color: '#FF7B72', fontWeight: 'bold' },
  variable: { color: '#79C0FF' },
  bold: { fontWeight: 'bold' },
  italic: { fontStyle: 'italic' },
  deleted: { color: '#FF7B72' },
  namespace: { opacity: 0.7 },
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function CodeBlock({
  language,
  code,
  meta,
  streaming,
}: {
  language: string;
  code: string;
  meta: string;
  streaming: boolean;
}) {
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedLine, setCopiedLine] = useState<number | null>(null);
  const [copyError, setCopyError] = useState(false);
  const lines = code.split('\n');
  const filename = filenameFromFence(meta, language);
  const hasExplicitName = Boolean(parseFenceInfo(meta).explicitFilename);

  const copyAll = async () => {
    const ok = await copyText(code);
    setCopiedAll(ok);
    setCopyError(!ok);
    if (ok) window.setTimeout(() => setCopiedAll(false), 1_400);
  };

  const copyLine = async (lineNumber: number) => {
    // Do not hijack a deliberate text selection.
    if (window.getSelection()?.toString()) return;
    const ok = await copyText(lines[lineNumber - 1] ?? '');
    if (!ok) {
      setCopyError(true);
      return;
    }
    setCopiedLine(lineNumber);
    window.setTimeout(() => setCopiedLine(null), 1_200);
  };

  if (streaming) {
    // Syntax highlighting an unfinished file is expensive and not useful.
    // Paint the raw code until the block is complete, then highlight it.
    return (
      <figure className="my-4 overflow-hidden rounded-xl border border-border bg-[#0b0b10]">
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-zinc-400">
            <TerminalSquare className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{hasExplicitName ? filename : language || 'text'}</span>
          </span>
          <span className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-zinc-500">
            streaming
          </span>
        </div>
        <pre className="max-h-[420px] overflow-auto p-3 font-mono text-[12.5px] leading-[1.65] text-zinc-200">
          <code>{code}</code>
        </pre>
      </figure>
    );
  }

  return (
    <figure className="group/code my-4 overflow-hidden rounded-xl border border-border bg-[#0b0b10]">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-zinc-400">
          <TerminalSquare className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{hasExplicitName ? filename : language || 'text'}</span>
          {hasExplicitName ? (
            <span className="shrink-0 text-zinc-500">{language}</span>
          ) : null}
          {copiedLine ? (
            <span className="text-emerald-400">Line {copiedLine} copied</span>
          ) : copyError ? (
            <span className="text-red-400">Clipboard blocked</span>
          ) : null}
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => downloadTextFile(filename, code, mimeForFilename(filename))}
            title={`Download ${filename}`}
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">File</span>
          </button>
          <button
            type="button"
            onClick={() => void copyAll()}
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-100"
          >
            {copiedAll ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copiedAll ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <SyntaxHighlighter
          language={language || 'text'}
          style={codeTheme}
          showLineNumbers
          wrapLines
          lineProps={(lineNumber) => ({
            className: 'code-line',
            title: 'Click to copy line',
            onClick: () => void copyLine(lineNumber),
          })}
          customStyle={{
            margin: 0,
            padding: '10px 0',
            background: 'transparent',
            fontSize: '12.5px',
            lineHeight: '1.65',
          }}
          codeTagProps={{ style: { fontFamily: 'var(--font-mono)' } }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </figure>
  );
}

function createComponents(streaming: boolean): Components {
  return {
    // The default <pre> wrapper would nest our figure inside a <pre>; unwrap it.
    pre: ({ children }) => <>{children}</>,
    code({ className, children, node }) {
      const languageMatch = /language-([\w-]+)/.exec(className ?? '');
      const raw = String(children);
      const isBlock = Boolean(languageMatch) || raw.includes('\n');
      const meta =
        (node as { data?: { meta?: string } } | undefined)?.data?.meta ?? '';

      if (isBlock) {
        return (
          <CodeBlock
            language={languageMatch?.[1] ?? 'text'}
            code={raw.replace(/\n$/, '')}
            meta={meta}
            streaming={streaming}
          />
        );
      }

      return <code className={className}>{children}</code>;
    },
    a({ href, children }) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer nofollow ugc">
          {children}
        </a>
      );
    },
    img({ src, alt }) {
      return (
        <img
          src={src ?? ''}
          alt={alt ?? ''}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
        />
      );
    },
    table({ children }) {
      return (
        <div className="my-3 max-w-full overflow-x-auto">
          <table>{children}</table>
        </div>
      );
    },
    input({ checked, disabled, type }) {
      if (type === 'checkbox') {
        return (
          <span className="mr-1 inline-block text-accent" aria-hidden="true">
            {checked ? '✓' : '○'}
          </span>
        );
      }
      return <input type={type} checked={checked} disabled={disabled} readOnly />;
    },
  };
}

export function MarkdownRenderer({
  content,
  className,
  streaming = false,
}: {
  content: string;
  className?: string;
  streaming?: boolean;
}) {
  const components = useMemo(() => createComponents(streaming), [streaming]);

  return (
    <div className={cn('prose-terminal', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
        urlTransform={safeUrlTransform}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
