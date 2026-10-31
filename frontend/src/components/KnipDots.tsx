/** Tien rondjes: gevuld = knipje gebruikt, open = nog over. Het "fysieke" beeld van de kaart. */
type Props = {
  remaining: number
  total?: number
  size?: number
  className?: string
}

export function KnipDots({ remaining, total = 10, size = 24, className }: Props) {
  const left = Math.max(0, Math.min(total, remaining))
  const used = total - left
  return (
    <div
      className={`flex flex-wrap gap-1.5 ${className ?? ''}`}
      role="img"
      aria-label={`${left} van ${total} knipjes over`}
    >
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`box-border rounded-full border-2 border-brand-900 ${i < used ? 'bg-brand-900' : 'bg-white'}`}
          style={{ width: size, height: size }}
        />
      ))}
    </div>
  )
}
