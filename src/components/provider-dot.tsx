import { PROVIDER_META } from '@/lib/ai/models';
import type { ProviderId } from '@/lib/ai/types';
import { cn } from '@/lib/utils';

export function ProviderDot({
  provider,
  className,
}: {
  provider: ProviderId;
  className?: string;
}) {
  return (
    <span
      className={cn('inline-block h-1.5 w-1.5 shrink-0 rounded-full', className)}
      style={{ backgroundColor: PROVIDER_META[provider].color }}
      aria-hidden="true"
    />
  );
}
