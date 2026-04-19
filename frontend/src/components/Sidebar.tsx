import { NavLink } from 'react-router-dom'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth'
import { apiFetch } from '../api/client'
import { LogoMark } from './Logo'
import type { ActivityLog } from '../types'

const NAV = [
  { to: '/feed',    icon: 'dashboard',   label: 'Feed' },
  { to: '/search',  icon: 'search',      label: 'Search' },
  { to: '/saved',   icon: 'bookmark',    label: 'Saved' },
  { to: '/board',   icon: 'view_kanban', label: 'Board' },
  { to: '/config',  icon: 'tune',        label: 'Config' },
]

export default function Sidebar() {
  const user = useAuthStore(s => s.user)
  const [notifOpen, setNotifOpen] = useState(false)

  const { data: notifs = [], refetch: refetchNotifs } = useQuery({
    queryKey: ['activity'],
    queryFn: () => apiFetch<ActivityLog[]>('/activity?limit=30'),
    refetchInterval: 30_000,
  })

  const unread = notifs.length

  async function clearNotifs() {
    await apiFetch('/activity', { method: 'DELETE' })
    refetchNotifs()
  }

  return (
    <aside className="w-16 md:w-20 bg-[#0e0e0e] border-r border-white/5 flex flex-col items-center py-6 z-50 flex-shrink-0">
      {/* Logo */}
      <div className="mb-10">
        <LogoMark size={28} />
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-2 flex-1 w-full px-3">
        {NAV.map(({ to, icon, label }) => (
          <NavLink
            key={to}
            to={to}
            title={label}
            className={({ isActive }) =>
              `relative flex items-center justify-center h-10 w-full rounded-xl transition-all
               ${isActive ? 'text-white bg-white/10' : 'text-zinc-600 hover:bg-white/5 hover:text-white'}`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-white rounded-r-full -ml-3" />
                )}
                <span className="material-symbols-outlined" style={{ fontSize: 22 }}>{icon}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom controls */}
      <div className="flex flex-col gap-3 items-center">
        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setNotifOpen(o => !o)}
            className="w-10 h-10 flex items-center justify-center text-zinc-600 hover:text-white transition-colors relative"
            title="Notifications"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>notifications</span>
            {unread > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-white text-black text-[9px] font-black rounded-full flex items-center justify-center">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute bottom-12 left-12 w-80 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <span className="text-white text-xs font-semibold">Activity</span>
                <button onClick={clearNotifs} className="text-white/40 hover:text-white text-xs transition-colors">Clear all</button>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifs.length === 0
                  ? <p className="text-white/30 text-xs text-center py-6">No recent activity</p>
                  : notifs.map(n => (
                    <div key={n.id} className="px-4 py-3 border-b border-white/[0.03] hover:bg-white/[0.02]">
                      <p className="text-white/80 text-xs">{n.message}</p>
                      <p className="text-white/30 text-[10px] mt-0.5">
                        {new Date(n.created_at.endsWith('Z') ? n.created_at : n.created_at + 'Z').toLocaleString()}
                      </p>
                    </div>
                  ))
                }
              </div>
            </div>
          )}
        </div>

        {/* Admin link (admins only) */}
        {user?.is_admin && (
          <NavLink
            to="/admin"
            title="Admin Panel"
            className={({ isActive }) =>
              `w-10 h-10 flex items-center justify-center transition-colors rounded-xl
               ${isActive ? 'text-white bg-white/10' : 'text-zinc-600 hover:text-white hover:bg-white/5'}`
            }
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>admin_panel_settings</span>
          </NavLink>
        )}

        {/* User avatar → profile page */}
        <NavLink
          to="/profile"
          title={`Profile (${user?.email ?? ''})`}
          className={({ isActive }) =>
            `w-8 h-8 rounded-full border flex items-center justify-center text-xs font-black transition-all
             ${isActive
               ? 'bg-white text-black border-white'
               : 'bg-white/10 border-white/10 text-white/60 hover:text-white hover:bg-white/20'
             }`
          }
        >
          {user?.name?.[0]?.toUpperCase() ?? 'U'}
        </NavLink>
      </div>
    </aside>
  )
}
