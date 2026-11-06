import { cn } from '@/lib/utils';

type LogoVariant = 'full' | 'compact' | 'mark';

const VIEWBOXES: Record<LogoVariant, string> = {
  full: '0 0 560 150',
  compact: '0 0 560 132',
  mark: '0 0 128 128',
};

const DIMENSIONS: Record<LogoVariant, { width: number; height: number }> = {
  full: { width: 560, height: 150 },
  compact: { width: 560, height: 132 },
  mark: { width: 128, height: 128 },
};

export function BrandLogo({
  variant = 'compact',
  className,
  idPrefix = 'voidterm',
  title = 'VOIDTERM — intelligence in every command',
}: {
  variant?: LogoVariant;
  className?: string;
  idPrefix?: string;
  title?: string;
}) {
  const gradientId = `${idPrefix}-silver`;
  const titleId = `${idPrefix}-title`;
  const dimensions = DIMENSIONS[variant];

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={VIEWBOXES[variant]}
      width={dimensions.width}
      height={dimensions.height}
      fill="none"
      role="img"
      aria-labelledby={titleId}
      className={cn('block h-8 w-auto shrink-0', className)}
    >
      <title id={titleId}>{title}</title>

      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--logo-silver-start)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--logo-silver-end)' }} />
        </linearGradient>
      </defs>

      <g transform={variant === 'mark' ? 'translate(0 -9)' : undefined}>
        <rect
          x="8"
          y="17"
          width="112"
          height="112"
          rx="25"
          fill="var(--logo-tile)"
          stroke="var(--logo-tile-border)"
          strokeWidth="1.5"
        />

        <path
          d="M34 41H94Q103 41 103 50V82Q103 91 94 91H68L47 107V91H34Q25 91 25 82V50Q25 41 34 41Z"
          stroke={`url(#${gradientId})`}
          strokeWidth="4"
          strokeLinejoin="round"
        />

        <path
          d="M43 57L57 67L43 77"
          stroke="var(--logo-contrast)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <path
          d="M67 77H84"
          stroke="var(--logo-contrast)"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </g>

      {variant !== 'mark' ? (
        <g fill={`url(#${gradientId})`}>
          <path d="M143 40H157L174 91L191 40H205L180 110H168Z" />
          <path
            fillRule="evenodd"
            d="M215 40H244L257 53V97L244 110H215L202 97V53ZM218 55V95L223 99H236L242 93V57L236 51H223Z"
          />
          <path d="M267 40H281V110H267Z" />
          <path
            fillRule="evenodd"
            d="M291 40H321L335 54V96L321 110H291ZM305 53V97H316L321 92V58L316 53Z"
          />
          <path d="M350 40H400V53H382V110H368V53H350Z" />
          <path d="M410 40H455V53H424V68H449V81H424V97H455V110H410Z" />
          <path
            fillRule="evenodd"
            d="M465 40H495L508 53V76L495 89H479V110H465ZM479 53V76H489L494 71V58L489 53Z"
          />
          <path d="M487 82H501L514 110H499Z" />
          <path d="M514 40H528L534 65L540 40H553V110H540V70L534 91L528 70V110H514Z" />
        </g>
      ) : null}

      {variant === 'full' ? (
        <>
          <path d="M143 123H553" stroke="var(--logo-rule)" />
          <text
            x="348"
            y="140"
            fill="var(--logo-tagline)"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize="9"
            fontWeight="600"
            letterSpacing="3"
            textAnchor="middle"
          >
            INTELLIGENCE IN EVERY COMMAND
          </text>
        </>
      ) : null}
    </svg>
  );
}
