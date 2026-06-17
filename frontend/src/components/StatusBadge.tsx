type StatusBadgeProps = {
  children: string
}

export function StatusBadge({ children }: StatusBadgeProps) {
  return <span className={`statusBadge ${children}`}>{children}</span>
}
