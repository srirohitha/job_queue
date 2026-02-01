import { useState } from 'react';
import { Bell, LogIn, LogOut, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Avatar, AvatarFallback } from './ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useAuth } from '../context/AuthContext';

export function Header() {
  const { user, login, register, logout, isBootstrapping } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const initials = user?.username ? user.username.slice(0, 2).toUpperCase() : 'NA';
  const displayName = user?.username || 'Not signed in';
  const displayEmail = user?.email || 'Sign in to load jobs';

  const handleAuthSubmit = async () => {
    if (!form.username || !form.password) {
      toast.error('Username and password are required');
      return;
    }
    if (authMode === 'register' && !form.email) {
      toast.error('Email is required for registration');
      return;
    }

    setIsSubmitting(true);
    try {
      if (authMode === 'login') {
        await login(form.username, form.password);
      } else {
        await register(form.username, form.email, form.password);
      }
      setAuthOpen(false);
      setForm({ username: '', email: '', password: '' });
    } catch (error: any) {
      toast.error(error?.message || 'Authentication failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <header className="h-16 border-b bg-white flex items-center justify-between px-4 md:px-6 sticky top-0 z-10">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">Q</span>
          </div>
          <h1 className="font-semibold text-lg md:text-xl hidden sm:block">Job Queue Platform</h1>
          <h1 className="font-semibold text-lg md:text-xl sm:hidden">Queue</h1>
        </div>
      </div>
      
      <div className="flex items-center gap-2 md:gap-4">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
        </Button>
        
        <div className="hidden sm:flex items-center gap-3 px-3 py-1.5 rounded-lg border">
          <div className="text-right">
            <p className="text-sm font-medium">{displayName}</p>
            <p className="text-xs text-gray-500">{displayEmail}</p>
          </div>
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-blue-100 text-blue-700">
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>
        
        <Avatar className="h-9 w-9 sm:hidden">
          <AvatarFallback className="bg-blue-100 text-blue-700">
            {initials}
          </AvatarFallback>
        </Avatar>

        {!user ? (
          <Dialog open={authOpen} onOpenChange={setAuthOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <LogIn className="h-4 w-4 mr-2" />
                Sign In
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[420px]">
              <DialogHeader>
                <DialogTitle>Account Access</DialogTitle>
                <DialogDescription>Sign in or create a new account.</DialogDescription>
              </DialogHeader>
              <Tabs
                value={authMode}
                onValueChange={(value) => setAuthMode(value as 'login' | 'register')}
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="login">Sign In</TabsTrigger>
                  <TabsTrigger value="register">Register</TabsTrigger>
                </TabsList>
                <TabsContent value="login" className="space-y-3 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-username">Username</Label>
                    <Input
                      id="login-username"
                      value={form.username}
                      onChange={(e) => setForm({ ...form, username: e.target.value })}
                      placeholder="Enter username"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <Input
                      id="login-password"
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder="Enter password"
                    />
                  </div>
                </TabsContent>
                <TabsContent value="register" className="space-y-3 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="register-username">Username</Label>
                    <Input
                      id="register-username"
                      value={form.username}
                      onChange={(e) => setForm({ ...form, username: e.target.value })}
                      placeholder="Choose a username"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-email">Email</Label>
                    <Input
                      id="register-email"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="Enter email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-password">Password</Label>
                    <Input
                      id="register-password"
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      placeholder="Create password"
                    />
                  </div>
                </TabsContent>
              </Tabs>
              <DialogFooter>
                <Button
                  onClick={handleAuthSubmit}
                  disabled={isSubmitting || isBootstrapping}
                  className="w-full"
                >
                  {authMode === 'login' ? (
                    <>
                      <LogIn className="h-4 w-4 mr-2" />
                      Sign In
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Create Account
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            title="Logout"
            onClick={logout}
          >
            <LogOut className="h-5 w-5" />
          </Button>
        )}
      </div>
    </header>
  );
}