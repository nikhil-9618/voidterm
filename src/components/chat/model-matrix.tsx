'use client';

import { useEffect, useRef, useState } from 'react';
import type * as React from 'react';
import { Check } from 'lucide-react';
import { MODELS, PROVIDER_META } from '@/lib/ai/models';
import { ProviderDot } from '@/components/provider-dot';
import { cn } from '@/lib/utils';

function costLabel(cost: number): string {
  if (cost === 0) return 'Free';
  if (cost < 0.001) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(3)}`;
}

function SpeedBars({ speed }: { speed: number }) {
  return (
    <span
      className="flex items-center gap-[2px]"
      title={`Relative speed ${speed}/5`}
      aria-label={`Relative speed ${speed} of 5`}
    >
      {Array.from({ length: 5 }, (_, index) => (
        <span
          key={index}
          className={cn(
            'h-[3px] w-[5px] rounded-full',
            index < speed ? 'bg-accent' : 'bg-border-strong',
          )}
        />
      ))}
    </span>
  );
}

export function ModelMatrix({
  value,
  onChange,
  onClose,
}: {
  value: string;
  onChange: (model: string) => void;
  onClose: () => void;
}) {
  const initialIndex = Math.max(
    0,
    MODELS.findIndex((spec) => spec.model === value),
  );
  const [selected, setSelected] = useState(initialIndex);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const item = itemRefs.current[selected];
    item?.focus({ preventScroll: true });
    item?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const choose = (index: number) => {
    const spec = MODELS[index];
    if (!spec) return;
    onChange(spec.model);
    onClose();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    let next = selected;

    switch (event.key) {
      case 'ArrowDown':
        next = Math.min(MODELS.length - 1, selected + 1);
        break;
      case 'ArrowUp':
        next = Math.max(0, selected - 1);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = MODELS.length - 1;
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        choose(selected);
        return;
      default:
        return;
    }

    event.preventDefault();
    setSelected(next);
  };

  return (
    <div
      className="w-[min(360px,calc(100vw-2rem))] p-2"
      onKeyDown={handleKeyDown}
      role="listbox"
      aria-label="Choose a model"
    >
      <div className="px-2 pb-2 pt-1">
        <div className="text-xs font-medium text-dim">Choose a model</div>
        <div className="mt-0.5 flex items-center gap-1 text-[10px] text-dim/80">
          <SpeedBars speed={5} />
          <span>relative first-token speed</span>
        </div>
      </div>

      <div className="max-h-[min(60vh,420px)] overflow-y-auto">
        {MODELS.map((spec, index) => {
          const isCurrent = spec.model === value;
          const isFocused = index === selected;

          return (
            <button
              key={`${spec.provider}:${spec.model}`}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              type="button"
              role="option"
              aria-selected={isCurrent}
              tabIndex={isFocused ? 0 : -1}
              onClick={() => choose(index)}
              onMouseEnter={() => setSelected(index)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                isFocused ? 'bg-elevated' : 'hover:bg-elevated/60',
              )}
            >
              <ProviderDot provider={spec.provider} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-fg">
                  {spec.label}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-dim">
                  {PROVIDER_META[spec.provider].name} · {spec.contextK >= 1000
                    ? `${(spec.contextK / 1000).toFixed(1)}M context`
                    : `${spec.contextK}K context`}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-[11px] text-dim">{costLabel(spec.costPer1kOut)}</span>
                <SpeedBars speed={spec.speed} />
              </span>
              {isCurrent ? <Check className="h-3.5 w-3.5 shrink-0 text-accent" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
