import { useQuery } from "@tanstack/react-query"
import { useSearchParams } from "react-router-dom"
import { apiGet } from "../api/client"
import type { MediaListResponse } from "../api/types"
import { MediaCard } from "../components/MediaCard"

export function DiscoverPage() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get("q")?.trim() ?? ""
  const path = query ? `/api/media?q=${encodeURIComponent(query)}` : "/api/media"
  const { data, isError, isLoading } = useQuery({
    queryKey: ["media", query],
    queryFn: () => apiGet<MediaListResponse>(path)
  })

  if (isLoading) return <main className="page">加载中...</main>
  if (isError) return <main className="page">发现列表加载失败</main>

  const items = data?.items ?? []

  return (
    <main className="page">
      <section className="pageHeader simple" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">新增线索</p>
          <h1 id="page-title">发现列表</h1>
          <p className="summary">
            {query ? `“${query}”的匹配结果` : "按热度和上线信号排序，快速筛出值得继续追踪的作品。"}
          </p>
        </div>
      </section>

      <div className="mediaGrid">
        {items.length > 0 ? items.map((item) => <MediaCard key={item.id} item={item} />) : (
          <p className="emptyText">{query ? `没有找到与“${query}”匹配的作品` : "暂无作品"}</p>
        )}
      </div>
    </main>
  )
}
