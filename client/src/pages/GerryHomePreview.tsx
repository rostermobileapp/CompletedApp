import {
  Bell,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  MessageCircle,
  MoreHorizontal,
  Trophy,
  Users,
} from 'lucide-react';

const navItems = [
  { label: 'Home', icon: Trophy, active: true },
  { label: 'Schedule', icon: CalendarDays, active: false },
  { label: 'Team', icon: Users, active: false },
  { label: 'Messages', icon: MessageCircle, active: false },
];

export default function GerryHomePreview() {
  return (
    <main className="min-h-screen bg-[#e9e8e2] px-4 py-6 text-[#202124]">
      <div className="mx-auto flex min-h-[680px] w-full max-w-[430px] flex-col overflow-hidden rounded-[30px] bg-[#f6f5f0] shadow-[0_20px_60px_rgba(0,0,0,0.18)] ring-1 ring-black/10">
        <div className="border-b border-black/[0.08] bg-[#f6f5f0] px-5 pb-4 pt-5">
          <div className="mb-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-[#2563eb] text-sm font-semibold text-white">
                GZ
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#777]">
                  Home
                </p>
                <p className="text-[17px] font-semibold tracking-tight">Good evening, Gerry</p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Notifications"
              className="relative grid h-10 w-10 place-items-center rounded-full bg-white text-[#555] shadow-sm ring-1 ring-black/[0.08]"
            >
              <Bell className="h-[18px] w-[18px]" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#ef4444]" />
            </button>
          </div>

          <button
            type="button"
            className="flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3 text-left shadow-sm ring-1 ring-black/[0.08]"
          >
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#777]">League</p>
              <p className="mt-0.5 text-[16px] font-semibold">Mentor 35+ <span className="font-normal text-[#777]">·</span> RW&amp;B</p>
              <p className="mt-0.5 text-[12px] text-[#777]">Winter 2025</p>
            </div>
            <ChevronDown className="h-5 w-5 text-[#777]" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5">
          <section className="rounded-2xl bg-[#2563eb] p-4 text-white shadow-[0_8px_18px_rgba(37,99,235,0.22)]">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-blue-100">Up next</p>
              <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium">RW&amp;B</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-white/15">
                <Trophy className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[18px] font-semibold">Your next game</p>
                <p className="mt-1 text-[13px] text-blue-100">Check the schedule for game time and opponent</p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-blue-100" />
            </div>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/[0.08]">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[16px] font-semibold">Needs attention</h2>
              <span className="rounded-full bg-[#fff1d6] px-2.5 py-1 text-[11px] font-semibold text-[#9a5b00]">1 item</span>
            </div>
            <button type="button" className="flex w-full items-center gap-3 rounded-xl bg-[#faf9f5] p-3 text-left ring-1 ring-black/[0.06]">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-[#e8f0ff] text-[#2563eb]">
                <ClipboardList className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium">Review your upcoming schedule</p>
                <p className="mt-0.5 text-[12px] text-[#777]">Keep your RSVP and team availability current</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-[#999]" />
            </button>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/[0.08]">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[16px] font-semibold">Team</h2>
              <button type="button" className="text-[#2563eb]">
                <MoreHorizontal className="h-5 w-5" />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#edf2ff] text-[#2563eb]">
                <Users className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-[15px] font-semibold">RW&amp;B</p>
                <p className="text-[12px] text-[#777]">Mentor 35+ · Player</p>
              </div>
              <ChevronRight className="h-5 w-5 text-[#999]" />
            </div>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/[0.08]">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[16px] font-semibold">Schedule</h2>
              <span className="text-[12px] font-medium text-[#2563eb]">View all</span>
            </div>
            <div className="flex items-center gap-3 border-b border-black/[0.07] pb-3">
              <div className="w-12 text-center">
                <p className="text-[10px] font-semibold uppercase text-[#777]">Next</p>
                <p className="mt-1 text-[19px] font-bold text-[#2563eb]">—</p>
              </div>
              <div className="h-9 w-px bg-black/[0.08]" />
              <div>
                <p className="text-[13px] font-medium">No upcoming game details yet</p>
                <p className="mt-0.5 text-[12px] text-[#777]">Your team schedule will appear here</p>
              </div>
            </div>
          </section>
        </div>

        <nav className="grid grid-cols-4 border-t border-black/[0.08] bg-white px-2 pb-3 pt-2">
          {navItems.map(({ label, icon: Icon, active }) => (
            <button
              key={label}
              type="button"
              className={`flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-medium ${
                active ? 'text-[#2563eb]' : 'text-[#8a8a8a]'
              }`}
            >
              <Icon className="h-[19px] w-[19px]" />
              {label}
            </button>
          ))}
        </nav>
      </div>
      <p className="mx-auto mt-3 max-w-[430px] text-center text-[11px] text-[#777]">
        Development-only visual preview · Gerry’s confirmed Mentor 35+ / RW&amp;B membership
      </p>
    </main>
  );
}