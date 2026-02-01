import { LayoutDashboard, Briefcase, AlertTriangle, BarChart3, Settings } from 'lucide-react';
import { cn } from './ui/utils';

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
}

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'jobs', label: 'Jobs', icon: Briefcase },
  { id: 'dlq', label: 'DLQ', icon: AlertTriangle },
  { id: 'metrics', label: 'Metrics', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function Sidebar({ currentView, onViewChange }: SidebarProps) {
  return (
    <aside className="w-64 border-r bg-gray-50 flex-col hidden md:flex">
      <nav className="flex-1 p-4 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-700 hover:bg-gray-200'
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t bg-white">
        <div className="text-xs text-gray-500 space-y-1">
          <p>Version 2.1.0</p>
          <p>© 2026 Job Queue Platform</p>
        </div>
      </div>
    </aside>
  );
}
