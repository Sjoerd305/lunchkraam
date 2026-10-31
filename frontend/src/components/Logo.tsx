/**
 * Het merkteken: een boterham waar per gebruikt knipje een hap uit gaat.
 * `bites` = 0..10 (knipjes gebruikt op de actieve tostikaart). Zonder kaart: hele boterham.
 * `variant="mark"` is het vaste merkteken met één hap (favicon, tab-icoon, labels).
 */

/** Volgorde van de happen: afwisselend links/rechts rond de rand, de laatste uit het midden. */
const BITES: ReadonlyArray<readonly [number, number]> = [
  [18.5, 6.5],
  [4.5, 16.5],
  [20.5, 12],
  [5.5, 6.5],
  [16.5, 21.5],
  [3.5, 11.5],
  [7.5, 21.5],
  [20.5, 17.5],
  [12, 3],
  [12, 12.5],
]

const BREAD_PATH =
  'M4 10a4 4 0 0 1 3.2-5.8A3.6 3.6 0 0 1 12 3a3.6 3.6 0 0 1 4.8 1.2A4 4 0 0 1 20 10v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z'

const MAX_BITES = BITES.length

type Props = {
  /** Aantal happen (0–10). Wordt afgekapt op het bereik. */
  bites?: number
  /** `mark`: één vaste hap, los van een kaart. */
  variant?: 'dynamic' | 'mark'
  /** Kleur van het brood (default amber). */
  bread?: string
  /** Kleur van de happen = achtergrond waar het logo op staat. */
  background?: string
  size?: number
  className?: string
  title?: string
}

export function Logo({
  bites = 0,
  variant = 'dynamic',
  bread = '#F2B733',
  background = '#0B2154',
  size = 24,
  className,
  title,
}: Props) {
  const n = variant === 'mark' ? 1 : Math.max(0, Math.min(MAX_BITES, Math.round(bites)))
  const r = variant === 'mark' ? 3.6 : 2.9
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={bread}
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <path d={BREAD_PATH} />
      {BITES.slice(0, n).map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill={background} />
      ))}
    </svg>
  )
}

/** Logo in het navy vierkant, zoals in de header. */
export function LogoBadge({ bites, variant, size = 40, title }: { bites?: number; variant?: 'dynamic' | 'mark'; size?: number; title?: string }) {
  const radius = Math.round(size / 4)
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center bg-brand-900"
      style={{ width: size, height: size, borderRadius: radius }}
    >
      <Logo bites={bites} variant={variant} size={Math.round(size * 0.65)} title={title} />
    </span>
  )
}
