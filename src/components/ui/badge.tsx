import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-sans text-[11px] font-medium leading-none transition-colors',
  {
    variants: {
      variant: {
        default: 'border-border bg-elevated text-muted',
        accent: 'border-accent/25 bg-accent/10 text-accent',
        amber: 'border-amber/25 bg-amber/10 text-amber',
        muted: 'border-transparent bg-elevated text-dim',
        danger: 'border-danger/25 bg-danger/10 text-danger',
        success: 'border-success/25 bg-success/10 text-success',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
