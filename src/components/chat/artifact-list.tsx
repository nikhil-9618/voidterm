'use client';

import { Download, FileCode2, FileText, FolderDown } from 'lucide-react';
import type { GeneratedArtifact } from '@/lib/artifacts';
import { formatBytes, mimeForFilename } from '@/lib/artifacts';
import { downloadTextFile } from '@/lib/download';
import { cn } from '@/lib/utils';

function ArtifactIcon({ filename }: { filename: string }) {
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  if (['md', 'txt', 'csv', 'log'].includes(extension)) {
    return <FileText className="h-4 w-4" />;
  }
  return <FileCode2 className="h-4 w-4" />;
}

export function ArtifactList({
  artifacts,
  className,
}: {
  artifacts: GeneratedArtifact[];
  className?: string;
}) {
  if (artifacts.length === 0) return null;

  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl border border-border/80 bg-panel/55',
        className,
      )}
      aria-label="Generated files"
    >
      <div className="flex items-center gap-2 border-b border-border/70 px-3.5 py-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-md border border-accent/15 bg-accent/10 text-accent">
          <FolderDown className="h-3.5 w-3.5" />
        </span>
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
          Generated files
        </span>
        <span className="rounded-full border border-border bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-dim">
          {artifacts.length}
        </span>
        <span className="ml-auto hidden text-[10px] text-dim sm:block">
          Ready to download
        </span>
      </div>

      <div className="divide-y divide-border/60">
        {artifacts.map((artifact) => (
          <div
            key={artifact.id}
            className="group flex items-center gap-2.5 px-3.5 py-2.5 transition-colors hover:bg-elevated/45"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-bg/50 text-muted">
              <ArtifactIcon filename={artifact.filename} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-[12px] text-fg">
                {artifact.filename}
              </span>
              <span className="mt-0.5 block text-[10px] text-dim">
                {artifact.language} · {formatBytes(artifact.bytes)}
              </span>
            </span>
            <button
              type="button"
              onClick={() =>
                downloadTextFile(
                  artifact.filename,
                  artifact.content,
                  mimeForFilename(artifact.filename),
                )
              }
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border bg-bg/60 px-2 text-[10px] font-medium text-muted transition-colors hover:border-accent/40 hover:text-fg"
              aria-label={`Download ${artifact.filename}`}
            >
              <Download className="h-3 w-3" />
              <span className="hidden sm:inline">Download</span>
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
