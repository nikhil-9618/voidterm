import { suggestedMarkdownName } from './artifacts';

export function downloadTextFile(
  filename: string,
  content: string,
  mimeType = 'text/plain',
): void {
  if (typeof document === 'undefined') return;

  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function downloadAnswerMarkdown(
  content: string,
  messageId: string,
): void {
  downloadTextFile(
    suggestedMarkdownName(content, messageId),
    content,
    'text/markdown',
  );
}
