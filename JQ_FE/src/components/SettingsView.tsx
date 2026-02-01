import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Separator } from './ui/separator';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Settings, User, Bell, Lock, Database, Zap, Mail, Shield, Edit2 } from 'lucide-react';
import { toast } from 'sonner';

interface AccountDetails {
  companyName: string;
  email: string;
  fullName: string;
  phone: string;
  timezone: string;
}

export function SettingsView() {
  const [accountDetails, setAccountDetails] = useState<AccountDetails>({
    companyName: 'Acme Corporation',
    email: 'admin@acme.com',
    fullName: 'John Administrator',
    phone: '+1 (555) 123-4567',
    timezone: 'America/New_York'
  });

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState<AccountDetails>(accountDetails);

  // Notification settings
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [jobCompleteNotif, setJobCompleteNotif] = useState(true);
  const [jobFailedNotif, setJobFailedNotif] = useState(true);
  const [dlqNotif, setDlqNotif] = useState(true);
  const [weeklyReport, setWeeklyReport] = useState(false);

  // System settings
  const [autoRetry, setAutoRetry] = useState(true);
  const [maxRetries, setMaxRetries] = useState('3');
  const [pollingInterval, setPollingInterval] = useState('5');
  const [batchSize, setBatchSize] = useState('1000');

  const handleSaveAccountDetails = () => {
    setAccountDetails(editForm);
    setIsEditDialogOpen(false);
    toast.success('Account details updated successfully');
  };

  const handleSaveNotifications = () => {
    toast.success('Notification preferences saved');
  };

  const handleSaveSystemSettings = () => {
    toast.success('System settings updated');
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Settings</h2>
        <p className="text-gray-600">Manage your account and application preferences</p>
      </div>

      <Tabs defaultValue="account" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
          <TabsTrigger value="account">
            <User className="h-4 w-4 mr-2" />
            Account
          </TabsTrigger>
          <TabsTrigger value="notifications">
            <Bell className="h-4 w-4 mr-2" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="system">
            <Settings className="h-4 w-4 mr-2" />
            System
          </TabsTrigger>
          <TabsTrigger value="security">
            <Shield className="h-4 w-4 mr-2" />
            Security
          </TabsTrigger>
        </TabsList>

        {/* Account Tab */}
        <TabsContent value="account" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Account Information</CardTitle>
                  <CardDescription>Your company and personal details</CardDescription>
                </div>
                <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Edit2 className="h-4 w-4 mr-2" />
                      Edit Details
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                      <DialogTitle>Edit Account Details</DialogTitle>
                      <DialogDescription>
                        Update your account information below
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="edit-company">Company Name</Label>
                        <Input
                          id="edit-company"
                          value={editForm.companyName}
                          onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-fullname">Full Name</Label>
                        <Input
                          id="edit-fullname"
                          value={editForm.fullName}
                          onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-email">Email Address</Label>
                        <Input
                          id="edit-email"
                          type="email"
                          value={editForm.email}
                          onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-phone">Phone Number</Label>
                        <Input
                          id="edit-phone"
                          value={editForm.phone}
                          onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-timezone">Timezone</Label>
                        <Select 
                          value={editForm.timezone} 
                          onValueChange={(value) => setEditForm({ ...editForm, timezone: value })}
                        >
                          <SelectTrigger id="edit-timezone">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
                            <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
                            <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
                            <SelectItem value="America/Los_Angeles">Pacific Time (PT)</SelectItem>
                            <SelectItem value="Europe/London">London (GMT)</SelectItem>
                            <SelectItem value="Europe/Paris">Paris (CET)</SelectItem>
                            <SelectItem value="Asia/Tokyo">Tokyo (JST)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleSaveAccountDetails}>
                        Save Changes
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label className="text-xs text-gray-500">Company Name</Label>
                  <p className="text-base font-medium mt-1">{accountDetails.companyName}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Full Name</Label>
                  <p className="text-base font-medium mt-1">{accountDetails.fullName}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Email Address</Label>
                  <p className="text-base font-medium mt-1">{accountDetails.email}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Phone Number</Label>
                  <p className="text-base font-medium mt-1">{accountDetails.phone}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Timezone</Label>
                  <p className="text-base font-medium mt-1">{accountDetails.timezone}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Account Status</Label>
                  <div className="mt-1">
                    <Badge variant="outline" className="border-green-600 text-green-600">Active</Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Usage & Quota</CardTitle>
              <CardDescription>Your current plan and resource usage</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm">Jobs This Month</span>
                  <span className="text-sm font-medium">142 / 1000</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-blue-600 h-2 rounded-full" style={{ width: '14.2%' }}></div>
                </div>
              </div>
              
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm">Storage Used</span>
                  <span className="text-sm font-medium">2.4 GB / 10 GB</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-purple-600 h-2 rounded-full" style={{ width: '24%' }}></div>
                </div>
              </div>
              
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm">API Calls</span>
                  <span className="text-sm font-medium">45,230 / 100,000</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-green-600 h-2 rounded-full" style={{ width: '45.2%' }}></div>
                </div>
              </div>

              <Separator className="my-4" />

              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Professional Plan</p>
                  <p className="text-sm text-gray-600">$99/month</p>
                </div>
                <Button variant="outline">Upgrade Plan</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-blue-600" />
                Email Notifications
              </CardTitle>
              <CardDescription>Configure how you receive email notifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Enable Email Notifications</Label>
                  <p className="text-sm text-gray-600">Receive updates via email</p>
                </div>
                <Switch checked={emailNotifications} onCheckedChange={setEmailNotifications} />
              </div>

              <Separator />

              <div className="space-y-4 opacity-100" style={{ opacity: emailNotifications ? 1 : 0.5 }}>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Job Completed</Label>
                    <p className="text-sm text-gray-600">Notify when a job finishes successfully</p>
                  </div>
                  <Switch 
                    checked={jobCompleteNotif} 
                    onCheckedChange={setJobCompleteNotif}
                    disabled={!emailNotifications}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Job Failed</Label>
                    <p className="text-sm text-gray-600">Notify when a job fails or reaches max retries</p>
                  </div>
                  <Switch 
                    checked={jobFailedNotif} 
                    onCheckedChange={setJobFailedNotif}
                    disabled={!emailNotifications}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>DLQ Items</Label>
                    <p className="text-sm text-gray-600">Notify when items are sent to dead letter queue</p>
                  </div>
                  <Switch 
                    checked={dlqNotif} 
                    onCheckedChange={setDlqNotif}
                    disabled={!emailNotifications}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Weekly Summary Report</Label>
                    <p className="text-sm text-gray-600">Receive a weekly digest of job statistics</p>
                  </div>
                  <Switch 
                    checked={weeklyReport} 
                    onCheckedChange={setWeeklyReport}
                    disabled={!emailNotifications}
                  />
                </div>
              </div>

              <Separator />

              <Button onClick={handleSaveNotifications}>Save Preferences</Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* System Tab */}
        <TabsContent value="system" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-yellow-600" />
                Job Processing
              </CardTitle>
              <CardDescription>Configure job queue behavior and processing rules</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Automatic Retry</Label>
                  <p className="text-sm text-gray-600">Automatically retry failed jobs</p>
                </div>
                <Switch checked={autoRetry} onCheckedChange={setAutoRetry} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="max-retries">Maximum Retry Attempts</Label>
                <Select value={maxRetries} onValueChange={setMaxRetries}>
                  <SelectTrigger id="max-retries">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 retry</SelectItem>
                    <SelectItem value="2">2 retries</SelectItem>
                    <SelectItem value="3">3 retries</SelectItem>
                    <SelectItem value="5">5 retries</SelectItem>
                    <SelectItem value="10">10 retries</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="polling-interval">Polling Interval (seconds)</Label>
                <Select value={pollingInterval} onValueChange={setPollingInterval}>
                  <SelectTrigger id="polling-interval">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">2 seconds</SelectItem>
                    <SelectItem value="5">5 seconds</SelectItem>
                    <SelectItem value="10">10 seconds</SelectItem>
                    <SelectItem value="30">30 seconds</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="batch-size">Batch Processing Size</Label>
                <Select value={batchSize} onValueChange={setBatchSize}>
                  <SelectTrigger id="batch-size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="100">100 rows</SelectItem>
                    <SelectItem value="500">500 rows</SelectItem>
                    <SelectItem value="1000">1,000 rows</SelectItem>
                    <SelectItem value="5000">5,000 rows</SelectItem>
                    <SelectItem value="10000">10,000 rows</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              <Button onClick={handleSaveSystemSettings}>Save Settings</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-purple-600" />
                Data Retention
              </CardTitle>
              <CardDescription>Manage how long job data is stored</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="retention-completed">Completed Jobs</Label>
                <Select defaultValue="30">
                  <SelectTrigger id="retention-completed">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                    <SelectItem value="365">1 year</SelectItem>
                    <SelectItem value="forever">Forever</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="retention-failed">Failed Jobs</Label>
                <Select defaultValue="90">
                  <SelectTrigger id="retention-failed">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                    <SelectItem value="365">1 year</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="retention-dlq">DLQ Items</Label>
                <Select defaultValue="365">
                  <SelectTrigger id="retention-dlq">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                    <SelectItem value="365">1 year</SelectItem>
                    <SelectItem value="forever">Forever</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-red-600" />
                Password & Authentication
              </CardTitle>
              <CardDescription>Manage your login credentials and security settings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs text-gray-500 mb-2 block">Last Password Change</Label>
                <p className="text-base">January 15, 2026</p>
              </div>
              
              <Separator />
              
              <Button>Change Password</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Two-Factor Authentication</CardTitle>
              <CardDescription>Add an extra layer of security to your account</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">2FA Status</Label>
                  <p className="text-sm text-gray-600">Currently disabled</p>
                </div>
                <Badge variant="outline" className="border-gray-400">Disabled</Badge>
              </div>
              
              <Separator />
              
              <Button variant="outline">Enable 2FA</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>API Keys</CardTitle>
              <CardDescription>Manage API keys for programmatic access</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Production Key</span>
                  <Badge>Active</Badge>
                </div>
                <code className="text-xs text-gray-600 font-mono">sk_live_••••••••••••••••</code>
              </div>
              
              <div className="p-3 border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Development Key</span>
                  <Badge variant="outline">Active</Badge>
                </div>
                <code className="text-xs text-gray-600 font-mono">sk_test_••••••••••••••••</code>
              </div>
              
              <Separator />
              
              <Button variant="outline">Generate New Key</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
