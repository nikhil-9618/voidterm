export type GeneratedArtifact = {
  id: string;
  filename: string;
  language: string;
  content: string;
  bytes: number;
};

const EXTENSION_BY_LANGUAGE: Record<string, string> = {
  bash: 'sh',
  c: 'c',
  cpp: 'cpp',
  csharp: 'cs',
  css: 'css',
  dockerfile: 'Dockerfile',
  go: 'go',
  graphql: 'graphql',
  html: 'html',
  java: 'java',
  javascript: 'js',
  js: 'js',
  jsx: 'jsx',
  json: 'json',
  kotlin: 'kt',
  markdown: 'md',
  md: 'md',
  php: 'php',
  plaintext: 'txt',
  python: 'py',
  py: 'py',
  rb: 'rb',
  ruby: 'rb',
  rust: 'rs',
  scss: 'scss',
  sh: 'sh',
  shell: 'sh',
  sql: 'sql',
  swift: 'swift',
  text: 'txt',
  toml: 'toml',
  ts: 'ts',
  tsx: 'tsx',
  txt: 'txt',
  typescript: 'ts',
  xml: 'xml',
  yaml: 'yml',
  yml: 'yml',
  zsh: 'sh',
};

const MIME_BY_EXTENSION: Record<string, string> = {
  c: 'text/plain',
  cpp: 'text/plain',
  cs: 'text/plain',
  css: 'text/css',
  csv: 'text/csv',
  go: 'text/plain',
  graphql: 'text/plain',
  html: 'text/html',
  java: 'text/plain',
  js: 'text/javascript',
  jsx: 'text/jsx',
  json: 'application/json',
  kt: 'text/plain',
  md: 'text/markdown',
  php: 'text/plain',
  py: 'text/x-python',
  rb: 'text/plain',
  rs: 'text/plain',
  scss: 'text/x-scss',
  sh: 'text/x-shellscript',
  sql: 'text/plain',
  swift: 'text/plain',
  toml: 'text/plain',
  ts: 'text/typescript',
  tsx: 'text/tsx',
  txt: 'text/plain',
  xml: 'application/xml',
  yml: 'text/yaml',
};

export function extensionForLanguage(language: string): string {
  return EXTENSION_BY_LANGUAGE[language.toLowerCase()] ?? 'txt';
}

function safeFilename(input: string, fallback: string): string {
  const base = input.split(/[\\/]/).pop() ?? fallback;
  const cleaned = base
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return cleaned || fallback;
}

type FenceInfo = {
  language: string;
  explicitFilename?: string;
};

/**
 * Fenced blocks can carry a filename in the info string:
 * ```tsx filename="app/page.tsx"
 * We also accept `file=`, `title=`, and a bare path token.
 */
export function parseFenceInfo(info: string): FenceInfo {
  const cleaned = info.trim();
  if (!cleaned) return { language: 'text' };

  const tokens = cleaned.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
  const filenameMatch = cleaned.match(
    /\b(?:filename|file|title)\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s]+))/i,
  );
  const explicitFilename = filenameMatch?.[1] ?? filenameMatch?.[2] ?? filenameMatch?.[3];

  let language =
    tokens[0]?.toLowerCase().replace(/^language-/, '').replace(/[{}]/g, '') ?? 'text';
  if (!language || language.includes('=') || /[/.]/.test(language)) language = 'text';

  const barePath = tokens.find(
    (token) => !token.includes('=') && /^[\w./-]+\.[a-z0-9]{1,8}$/i.test(token),
  );

  return {
    language,
    explicitFilename: explicitFilename ?? barePath,
  };
}

export function filenameFromFence(info: string, language: string): string {
  const parsed = parseFenceInfo(info);
  const effectiveLanguage = language || parsed.language;
  const fallback = `snippet.${extensionForLanguage(effectiveLanguage)}`;
  if (!parsed.explicitFilename) return fallback;

  const name = safeFilename(parsed.explicitFilename, fallback);
  if (name.includes('.')) return name;
  return `${name}.${extensionForLanguage(effectiveLanguage)}`;
}

export function mimeForFilename(filename: string): string {
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXTENSION[extension] ?? 'text/plain';
}

function uniqueFilename(candidate: string, used: Set<string>): string {
  if (!used.has(candidate)) {
    used.add(candidate);
    return candidate;
  }

  const dot = candidate.lastIndexOf('.');
  const stem = dot > 0 ? candidate.slice(0, dot) : candidate;
  const extension = dot > 0 ? candidate.slice(dot) : '';
  let index = 2;
  let next = `${stem}-${index}${extension}`;
  while (used.has(next)) {
    index += 1;
    next = `${stem}-${index}${extension}`;
  }
  used.add(next);
  return next;
}

/**
 * Pull complete fenced blocks out of an assistant response. This is intentionally
 * permissive: a short shell block is still a useful downloadable file, and the
 * UI presents these as copyable artifacts rather than claiming they were written
 * to the user's filesystem.
 */
export function extractArtifacts(content: string, idPrefix: string): GeneratedArtifact[] {
  const artifacts: GeneratedArtifact[] = [];
  const used = new Set<string>();
  const fencePattern = /```([^\n]*)\n([\s\S]*?)```/g;

  for (const match of content.matchAll(fencePattern)) {
    const info = match[1] ?? '';
    const block = (match[2] ?? '').replace(/\n$/, '');
    if (!block.trim()) continue;

    const parsed = parseFenceInfo(info);
    const fallback = `snippet.${extensionForLanguage(parsed.language)}`;
    const candidate = parsed.explicitFilename
      ? safeFilename(parsed.explicitFilename, fallback)
      : fallback;
    const withExtension =
      candidate.includes('.') || candidate === 'Dockerfile'
        ? candidate
        : `${candidate}.${extensionForLanguage(parsed.language)}`;
    const filename = uniqueFilename(withExtension, used);

    artifacts.push({
      id: `${idPrefix}-artifact-${artifacts.length + 1}`,
      filename,
      language: parsed.language || 'text',
      content: block,
      bytes: new TextEncoder().encode(block).length,
    });

    if (artifacts.length >= 20) break;
  }

  return artifacts;
}

export function suggestedMarkdownName(content: string, messageId: string): string {
  const firstLine = content
    .split('\n')
    .map((line) => line.replace(/^#+\s*/, '').trim())
    .find((line) => line.length > 0);

  const slug = (firstLine ?? 'answer')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return `voidterm-${slug || messageId.slice(0, 8)}.md`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
