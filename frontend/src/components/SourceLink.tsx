import { ExternalLink } from "lucide-react"
import { sourceLabel } from "../utils/sourceLabel"

type SourceLinkProps = {
  source: string
  sourceUrl: string | null
  prefix?: string | null
}

export function SourceLink({ source, sourceUrl, prefix = "来源" }: SourceLinkProps) {
  const label = sourceLabel(source)
  const text = prefix ? `${prefix} ${label}` : label

  if (!sourceUrl) return <span>{text}</span>

  return (
    <a
      className="sourceLink"
      href={sourceUrl}
      target="_blank"
      rel="noreferrer"
      aria-label={`打开 ${label} 来源`}
      title="打开来源"
    >
      <span>{text}</span>
      <ExternalLink aria-hidden="true" size={13} />
    </a>
  )
}
