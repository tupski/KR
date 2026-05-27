import React from 'react';
import { Camera, MoreHorizontal } from 'lucide-react';

/**
 * AppBottomNav — Fixed bottom navigation bar with role-based tab filtering.
 *
 * Renders primary tabs around the central "Input" button, with
 * a secondary overflow menu for less-used tabs.
 *
 * @param {object} props
 * @param {string} props.activeTab       – Currently active tab ID
 * @param {string} props.userRole        – Current user role
 * @param {Array} props.primaryTabs      – Primary tab objects ({ id, label, icon })
 * @param {Array} props.secondaryTabs    – Secondary tab objects ({ id, label, icon })
 * @param {boolean} props.showMoreMenus  – Whether overflow menu is visible
 * @param {function} props.onTabChange   – Called with tab ID on click
 * @param {function} props.onToggleMore  – Toggle overflow menu visibility
 */
export function AppBottomNav({
  activeTab,
  userRole,
  primaryTabs,
  secondaryTabs,
  showMoreMenus,
  onTabChange,
  onToggleMore,
}) {
  const currentYear = new Date().getFullYear();

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2">
      <div className="mx-auto w-full max-w-md rounded-3xl border-2 border-slate-300 bg-white/95 shadow-xl backdrop-blur">
        <div className="relative flex items-end justify-between gap-1 px-2 py-2">
          {/* Left primary tabs */}
          {primaryTabs
            .slice(0, userRole === 'karyawan' ? 1 : 2)
            .map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`flex h-12 w-14 flex-col items-center justify-center rounded-xl border ${
                    isActive
                      ? 'border-cyan-600 bg-cyan-600 text-white'
                      : 'border-slate-300 text-slate-700'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="mt-1 text-[10px]">{tab.label}</span>
                </button>
              );
            })}

          {/* Central Input button */}
          <button
            onClick={() => onTabChange('form')}
            className={`-mt-7 flex h-16 w-16 flex-col items-center justify-center rounded-2xl border-4 border-white text-white shadow-lg ${
              activeTab === 'form' ? 'bg-blue-600' : 'bg-cyan-500'
            }`}
          >
            <Camera className="h-6 w-6" />
            <span className="mt-0.5 text-[9px] font-semibold">Input</span>
          </button>

          {/* Right primary tabs */}
          {primaryTabs
            .slice(
              userRole === 'karyawan' ? 1 : 2,
              userRole === 'karyawan' ? 2 : 4
            )
            .map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`flex h-12 w-14 flex-col items-center justify-center rounded-xl border ${
                    isActive
                      ? 'border-cyan-600 bg-cyan-600 text-white'
                      : 'border-slate-300 text-slate-700'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="mt-1 text-[10px]">{tab.label}</span>
                </button>
              );
            })}

          {/* More menu toggle */}
          {secondaryTabs.length > 0 && (
            <button
              onClick={onToggleMore}
              className="flex h-12 w-10 items-center justify-center rounded-xl text-slate-700"
              aria-label="Menu lainnya"
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Overflow menu */}
        {showMoreMenus && secondaryTabs.length > 0 && (
          <div className="border-t border-slate-200 p-2">
            <div className="grid grid-cols-3 gap-1">
              {secondaryTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
                    className={`flex h-12 flex-col items-center justify-center rounded-lg text-[10px] font-semibold ${
                      isActive
                        ? 'bg-cyan-600 text-white'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    <Icon className="mb-1 h-3.5 w-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Copyright */}
      <div className="mx-auto mt-2 w-full max-w-md px-2 text-center text-[11px] text-slate-600">
        © {currentYear} - Kakarama Room. All rights reserved.
      </div>
    </div>
  );
}
