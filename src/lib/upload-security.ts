/**
 * Upload validation that does not trust the browser's MIME type or filename.
 * We accept a small allowlist of images, PDF, and UTF-8 text/source files, and
 * derive the stored content type and extension from the bytes themselves.
 */

export type InspectedUpload = {
  mime: string;
  extension: string;
  fileName: string;
};

const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.json',
  '.log',
  '.csv',
  '.yaml',
  '.yml',
  '.ts',
  '.tsx',
  '.js',
  '.py',
  '.sh',
  '.sql',
]);

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, start: number, value: string): boolean {
  if (bytes.length < start + value.length) return false;
  return value.split('').every((character, index) => bytes[start + index] === character.charCodeAt(0));
}

function isUtf8Text(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function safeStem(input: string): string {
  return (
    input
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.{2,}/g, '.')
      .replace(/^[_\-.]+|[_\-.]+$/g, '')
      .slice(0, 80) || 'file'
  );
}

function result(baseName: string, originalExtension: string, mime: string, extension: string): InspectedUpload {
  const stem = safeStem(baseName.slice(0, baseName.length - originalExtension.length));
  return { mime, extension, fileName: `${stem}${extension}` };
}

export function inspectUpload(originalName: string, bytes: Uint8Array): InspectedUpload | null {
  if (bytes.length === 0) return null;

  const baseName = originalName.split(/[\\/]/).pop() ?? 'file';
  const lowerName = baseName.toLowerCase();
  const dot = lowerName.lastIndexOf('.');
  const extension = dot > 0 ? lowerName.slice(dot) : '';

  // Images are identified by their magic bytes, not the declared image/* type.
  if (extension === '.png' && startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return result(baseName, extension, 'image/png', '.png');
  }
  if (extension === '.jpg' || extension === '.jpeg') {
    if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
      return result(baseName, extension, 'image/jpeg', '.jpg');
    }
    return null;
  }
  if (extension === '.gif' && (ascii(bytes, 0, 'GIF87a') || ascii(bytes, 0, 'GIF89a'))) {
    return result(baseName, extension, 'image/gif', '.gif');
  }
  if (extension === '.webp' && ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WEBP')) {
    return result(baseName, extension, 'image/webp', '.webp');
  }

  // SVG, HTML, XML and executable formats are deliberately not accepted.
  // PDFs are only accepted with the standard PDF header.
  if (extension === '.pdf' && ascii(bytes, 0, '%PDF-')) {
    return result(baseName, extension, 'application/pdf', '.pdf');
  }

  // Source and text files are stored as text/plain so a browser can never
  // interpret an uploaded file as active HTML/script on this origin.
  if (TEXT_EXTENSIONS.has(extension) && isUtf8Text(bytes)) {
    if (extension === '.json') {
      try {
        JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        return null;
      }
      return result(baseName, extension, 'application/json', '.json');
    }
    return result(baseName, extension, 'text/plain', extension);
  }

  return null;
}
