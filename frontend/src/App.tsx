import {
  Activity,
  CalendarDays,
  Compass,
  Database,
  Flame,
  RadioTower
} from "lucide-react"
import { NavLink, Route, Routes } from "react-router-dom"

type NavItem = {
  to: string
  label: string
  icon: typeof RadioTower
}

type PageConfig = {
  title: string
  eyebrow: string
  summary: string
  signal: "warm" | "fresh" | "danger"
}

const navItems: NavItem[] = [
  { to: "/", label: "情报台", icon: RadioTower },
  { to: "/discover", label: "发现", icon: Compass },
  { to: "/trending", label: "热度", icon: Flame },
  { to: "/calendar", label: "日历", icon: CalendarDays },
  { to: "/sources", label: "数据源", icon: Database }
]

const pages: PageConfig[] = [
  {
    title: "新片新剧雷达",
    eyebrow: "全球档期",
    summary: "今日值守：院线、流媒体、剧集档期与口碑波动",
    signal: "warm"
  },
  {
    title: "发现列表",
    eyebrow: "新增线索",
    summary: "待筛选片单、首曝预告、平台上新与区域上线记录",
    signal: "fresh"
  },
  {
    title: "热度榜",
    eyebrow: "异动监测",
    summary: "跨平台讨论、收藏趋势、评分变化与爆点回放",
    signal: "danger"
  },
  {
    title: "播出日历",
    eyebrow: "排期视图",
    summary: "首播、完结、上线窗口与重点追踪日程",
    signal: "warm"
  },
  {
    title: "数据源状态",
    eyebrow: "采集网络",
    summary: "源站健康、同步节奏、限频状态与最近巡检",
    signal: "fresh"
  }
]

function PlaceholderPage({ title, eyebrow, summary, signal }: PageConfig) {
  return (
    <main className="page">
      <section className="pageHeader" aria-labelledby="page-title">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1 id="page-title">{title}</h1>
          <p className="summary">{summary}</p>
        </div>
        <div className={`signalPanel ${signal}`} aria-label="监控状态">
          <span>ON AIR</span>
          <strong>基线</strong>
        </div>
      </section>

      <section className="opsGrid" aria-label="栏目占位">
        <div className="opsBlock">
          <span>频道</span>
          <strong>{title}</strong>
        </div>
        <div className="opsBlock">
          <span>队列</span>
          <strong>等待 Task 8 接入</strong>
        </div>
        <div className="opsBlock alert">
          <span>风险</span>
          <strong>未启动调度</strong>
        </div>
      </section>
    </main>
  )
}

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
        <Route path="/" element={<PlaceholderPage {...pages[0]} />} />
        <Route path="/discover" element={<PlaceholderPage {...pages[1]} />} />
        <Route path="/trending" element={<PlaceholderPage {...pages[2]} />} />
        <Route path="/calendar" element={<PlaceholderPage {...pages[3]} />} />
        <Route path="/sources" element={<PlaceholderPage {...pages[4]} />} />
      </Routes>
    </div>
  )
}
