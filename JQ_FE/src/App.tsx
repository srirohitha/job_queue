import { useState } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/SidebarNav';
import { MobileNav } from './components/MobileNav';
import { Dashboard } from './components/Dashboard';
import { JobsView } from './components/JobsView';
import { DLQView } from './components/DLQView';
import { MetricsView } from './components/MetricsView';
import { SettingsView } from './components/SettingsView';
import { Toaster } from './components/ui/sonner';
import { AuthProvider } from './context/AuthContext';
import { JobProvider } from './context/JobContext';

export default function App() {
  const [currentView, setCurrentView] = useState('dashboard');

  const renderView = () => {
    switch (currentView) {
      case 'dashboard':
        return <Dashboard />;
      case 'jobs':
        return <JobsView />;
      case 'dlq':
        return <DLQView />;
      case 'metrics':
        return <MetricsView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <AuthProvider>
      <JobProvider>
        <div className="h-screen flex flex-col bg-gray-100">
          <Header />
          <div className="flex flex-1 overflow-hidden pb-16 md:pb-0">
            <Sidebar currentView={currentView} onViewChange={setCurrentView} />
            <main className="flex-1 overflow-auto">
              {renderView()}
            </main>
          </div>
          <MobileNav currentView={currentView} onViewChange={setCurrentView} />
          <Toaster />
        </div>
      </JobProvider>
    </AuthProvider>
  );
}