import { LayoutDashboard, Briefcase, AlertTriangle, BarChart3, Settings } from 'lucide-react';
import { cn } from './ui/utils';

interface MobileNavProps {
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

export function MobileNav({ currentView, onViewChange }: MobileNavProps) {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t z-20">
      <div className="flex items-center justify-around">
        {menuItems.slice(0, 4).map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={cn(
                'flex flex-col items-center gap-1 py-3 px-4 flex-1 transition-colors',
                isActive 
                  ? 'text-blue-600' 
                  : 'text-gray-600'
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs font-medium">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
