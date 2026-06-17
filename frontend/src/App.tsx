import {
  Activity,
  CalendarDays,
  Compass,
  Database,
  Flame,
  RadioTower
} from "lucide-react"
import { NavLink, Route, Routes } from "react-router-dom"
import { CalendarPage } from "./pages/CalendarPage"
import { DashboardPage } from "./pages/DashboardPage"
import { DiscoverPage } from "./pages/DiscoverPage"
import { MediaDetailPage } from "./pages/MediaDetailPage"
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
  { to: "/calendar", label: "日历", icon: CalendarDays },
  { to: "/sources", label: "数据源", icon: Database }
]

export function App() {
  return (
    <div className="appShell">
      <aside className="sidebar">
        <div className="brand" aria-label="WhatsNew">
          <Activity aria-hidden="true" size={24} />
          <div>
            <strong>WhatsNew</strong>
            <span>新片新剧监控</span>
          </div>
        </div>

        <nav className="navList" aria-label="主导航">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === "/"} className="navLink">
              <Icon aria-hidden="true" size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/discover" element={<DiscoverPage />} />
        <Route path="/trending" element={<TrendingPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/sources" element={<SourcesPage />} />
        <Route path="/media/:id" element={<MediaDetailPage />} />
      </Routes>
    </div>
  )
}
