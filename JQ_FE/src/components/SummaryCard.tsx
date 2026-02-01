import { LucideIcon } from 'lucide-react';
import { Card, CardContent } from './ui/card';

interface SummaryCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  color: 'gray' | 'blue' | 'green' | 'red' | 'purple' | 'amber';
  subtitle?: string;
}

const colorClasses = {
  gray: 'bg-gray-100 text-gray-700',
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-green-100 text-green-700',
  red: 'bg-red-100 text-red-700',
  purple: 'bg-purple-100 text-purple-700',
  amber: 'bg-amber-100 text-amber-700',
};

export function SummaryCard({ title, value, icon: Icon, color, subtitle }: SummaryCardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-gray-600 mb-1">{title}</p>
            <p className="text-3xl font-semibold">{value}</p>
            {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
          </div>
          <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
