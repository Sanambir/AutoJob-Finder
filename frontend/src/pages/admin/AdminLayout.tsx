import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LogoMark } from '../../components/Logo'
import { useAuthStore } from '../../store/auth'

const NAV = [
  { to: '/admin',          icon: 'dashboard',            label: 'Dashboard', end: true },
  { to: '/admin/users',    icon: 'group',                label: 'Users' },
  { to: '/admin/jobs',     icon: 'work',                 label: 'Jobs' },
  { to: '/admin/system',   icon: 'monitor_heart',        label: 'System' },
  { to: '/admin/activity', icon: 'history',              label: 'Activity' },
]

export default function AdminLayout() {
  const navigate  = useNavigate()
  const logout    = useAuthStore(s => s.logout)
  const user      = useAuthStore(s => s.user)

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0a0a]">
      {/* Admin sidebar */}
      <aside className="w-56 bg-[#0e0e0e] border-r border-white/[0.06] flex flex-col flex-shrink-0">
        {/* Header */}
        <div className="px-5 py-5 border-b border-white/[0.04]">
          <div className="flex items-center gap-3 mb-1">
            <LogoMark size={22} />
            <span className="text-white font-black text-sm tracking-tight">WorkfinderX</span>
          </div>
          <span className="px-2 py-0.5 bg-white/10 text-white/60 text-[9px] font-black uppercase tracking-widest rounded">
            Admin Panel
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 flex flex-col gap-0.5">
          {NAV.map(({ to, icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                 ${isActive
                   ? 'bg-white/10 text-white'
                   : 'text-white/40 hover:text-white hover:bg-white/5'
                 }`
              }
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-white/[0.04] flex flex-col gap-1">
          <NavLink
            to="/feed"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/40 hover:text-white hover:bg-white/5 transition-all"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
            Back to App
          </NavLink>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/30 hover:text-red-400 hover:bg-red-950/20 transition-all w-full text-left"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>logout</span>
            Sign Out
          </button>
          <div className="px-3 pt-2">
            <p className="text-white/20 text-[10px] truncate">{user?.email}</p>
          </div>
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}
