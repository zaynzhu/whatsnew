import { type FormEvent, useEffect, useRef, useState } from "react"
import {
  Activity,
  CalendarDays,
  Compass,
  Database,
  Flame,
  RadioTower,
  Search,
  Settings,
  Telescope
} from "lucide-react"
import { NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { apiGet } from "./api/client"
import { CalendarPage } from "./pages/CalendarPage"
import { DashboardPage } from "./pages/DashboardPage"
import { DiscoverPage } from "./pages/DiscoverPage"
import { MediaDetailPage } from "./pages/MediaDetailPage"
import { PreviewPage } from "./pages/PreviewPage"
import { SettingsPage } from "./pages/SettingsPage"
import { SourceRunsPage } from "./pages/SourceRunsPage"
import { SourcesPage } from "./pages/SourcesPage"
import { TrendingPage } from "./pages/TrendingPage"

type NavItem = {
  to: string
  label: string
  icon: typeof RadioTower
}

const navItems: NavItem[] = [
  { to: "/", label: "情报台", icon: RadioTower },
  { to: "/discover", label: "发现", icon: Compass },
  { to: "/trending", label: "热度", icon: Flame },
  { to: "/preview", label: "前瞻", icon: Telescope },
  { to: "/calendar", label: "日历", icon: CalendarDays },
  { to: "/sources", label: "数据源", icon: Database },
  { to: "/settings", label: "设置", icon: Settings }
]

export function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [searchValue, setSearchValue] = useState(() => {
    return new URLSearchParams(location.search).get("q") ?? ""
  })
  const environmentQuery = useQuery({
    queryKey: ["health-environment"],
    queryFn: () => apiGet<{ environment?: string }>("/api/health"),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false
  })
  const isSandbox = environmentQuery.data?.environment === "china_sandbox"

  useEffect(() => {
    setSearchValue(new URLSearchParams(location.search).get("q") ?? "")
  }, [location.search])

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
    }

    window.addEventListener("keydown", focusSearch)
    return () => window.removeEventListener("keydown", focusSearch)
  }, [])

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = searchValue.trim()
    navigate(query ? `/discover?q=${encodeURIComponent(query)}` : "/discover")
  }

  return (
    <div className="appShell">
      <header className="commandBar">
        <NavLink className="brand" to="/" aria-label="WhatsNew 首页">
          <Activity aria-hidden="true" size={22} />
          <strong>WhatsNew</strong>
        </NavLink>
        {isSandbox ? <span className="sandboxBadge">国内源沙盒</span> : null}

        <form className="commandSearch" role="search" onSubmit={submitSearch}>
          <Search aria-hidden="true" size={16} />
          <input
            ref={searchInputRef}
            type="search"
            placeholder="搜索作品、数据源…"
            aria-label="全局搜索"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
          />
          <kbd className="commandSearchHint" aria-hidden="true">⌘K</kbd>
        </form>
      </header>

      <div className="appContent">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/discover" element={<DiscoverPage />} />
          <Route path="/trending" element={<TrendingPage />} />
          <Route path="/preview" element={<PreviewPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/sources" element={<SourcesPage />} />
          <Route path="/sources/runs" element={<SourceRunsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/media/:id" element={<MediaDetailPage />} />
        </Routes>
      </div>

      <nav className="dock" aria-label="主导航">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/"} className="dockItem">
            <Icon aria-hidden="true" size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
