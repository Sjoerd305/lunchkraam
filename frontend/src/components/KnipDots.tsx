/** Tien rondjes: gevuld = knipje gebruikt, open = nog over. Het "fysieke" beeld van de kaart. */
type Props = {
  remaining: number
  total?: number
  /** Maximale diameter in px; op smalle schermen krimpen de rondjes zodat ze altijd op één rij passen. */
  size?: number
  className?: string
}

const GAP_PX = 6

export function KnipDots({ remaining, total = 10, size = 24, className }: Props) {
  const left = Math.max(0, Math.min(total, remaining))
  const used = total - left
  return (
    <div
      className={`grid w-full ${className ?? ''}`}
      style={{
        gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))`,
        gap: GAP_PX,
        maxWidth: total * size + (total - 1) * GAP_PX,
      }}
      role="img"
      aria-label={`${left} van ${total} knipjes over`}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`box-border aspect-square w-full rounded-full border-2 border-brand-900 ${
            i < used ? 'bg-brand-900' : 'bg-white'
          }`}
        />
      ))}
    </div>
  )
}
