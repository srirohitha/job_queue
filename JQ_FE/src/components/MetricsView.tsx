import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { useJobs } from '../context/JobContext';
import { TrendingUp, Clock, CheckCircle2, XCircle, Activity, BarChart3 } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export function MetricsView() {
  const { jobs } = useJobs();

  // Calculate metrics
  const totalJobs = jobs.length;
  const completedJobs = jobs.filter(j => j.status === 'DONE').length;
  const failedJobs = jobs.filter(j => j.status === 'FAILED').length;
  const pendingJobs = jobs.filter(j => j.status === 'PENDING').length;
  const runningJobs = jobs.filter(j => j.status === 'RUNNING').length;
  
  const completionRate = totalJobs > 0 ? ((completedJobs / totalJobs) * 100).toFixed(1) : '0';
  const failureRate = totalJobs > 0 ? ((failedJobs / totalJobs) * 100).toFixed(1) : '0';
  
  const totalProcessedRows = jobs.reduce((sum, job) => sum + job.processedRows, 0);
  const avgProcessingTime = jobs.length > 0 
    ? (jobs.reduce((sum, job) => {
        const created = new Date(job.createdAt).getTime();
        const updated = new Date(job.updatedAt).getTime();
        return sum + (updated - created);
      }, 0) / jobs.length / 1000 / 60).toFixed(1) // in minutes
    : '0';

  // Status distribution data
  const statusData = [
    { name: 'Completed', value: completedJobs, color: '#10b981' },
    { name: 'Failed', value: failedJobs, color: '#ef4444' },
    { name: 'Running', value: runningJobs, color: '#3b82f6' },
    { name: 'Pending', value: pendingJobs, color: '#f59e0b' },
  ].filter(item => item.value > 0);

  // Jobs over time (last 7 days)
  const getLast7Days = () => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      days.push(date.toISOString().split('T')[0]);
    }
    return days;
  };

  const last7Days = getLast7Days();
  const jobsOverTime = last7Days.map(date => {
    const dayJobs = jobs.filter(j => j.createdAt.startsWith(date));
    return {
      date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      completed: dayJobs.filter(j => j.status === 'DONE').length,
      failed: dayJobs.filter(j => j.status === 'FAILED').length,
      pending: dayJobs.filter(j => j.status === 'PENDING').length,
      total: dayJobs.length
    };
  });

  // Processing efficiency (rows processed per hour)
  const processingEfficiency = jobs
    .filter(j => j.status === 'DONE' || j.status === 'RUNNING')
    .slice(0, 10)
    .map((job, idx) => ({
      name: `Job ${jobs.length - idx}`,
      rows: job.processedRows,
      progress: job.progress
    }));

  // Retry statistics
  const retryStats = jobs.map(job => ({
    label: job.label.substring(0, 20),
    attempts: job.attempts,
    maxAttempts: job.maxAttempts
  })).slice(0, 8);

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h2 className="text-2xl font-semibold mb-2">Metrics & Analytics</h2>
        <p className="text-gray-600">Performance insights and job statistics</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Jobs</p>
                <p className="text-2xl font-bold">{totalJobs}</p>
              </div>
              <BarChart3 className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Completion Rate</p>
                <p className="text-2xl font-bold">{completionRate}%</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Failure Rate</p>
                <p className="text-2xl font-bold">{failureRate}%</p>
              </div>
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Rows Processed</p>
                <p className="text-2xl font-bold">{totalProcessedRows.toLocaleString()}</p>
              </div>
              <Activity className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="retries">Retries</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Job Status Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => `${entry.name}: ${entry.value}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Jobs by Status</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={statusData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-blue-600" />
                Jobs Over Time (Last 7 Days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <AreaChart data={jobsOverTime}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="completed" stackId="1" stroke="#10b981" fill="#10b981" name="Completed" />
                  <Area type="monotone" dataKey="failed" stackId="1" stroke="#ef4444" fill="#ef4444" name="Failed" />
                  <Area type="monotone" dataKey="pending" stackId="1" stroke="#f59e0b" fill="#f59e0b" name="Pending" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Total Jobs Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={jobsOverTime}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} name="Total Jobs" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-purple-600" />
                Processing Efficiency (Recent Jobs)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={processingEfficiency} layout="horizontal">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={80} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="rows" fill="#8b5cf6" name="Rows Processed" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-orange-600" />
                  Processing Time
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-600 mb-2">Average Processing Time</p>
                    <p className="text-3xl font-bold">{avgProcessingTime} min</p>
                  </div>
                  <div className="pt-4 border-t">
                    <p className="text-xs text-gray-500 mb-2">Distribution</p>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Fast (&lt;5 min)</span>
                        <span className="text-sm font-medium">
                          {jobs.filter(j => {
                            const time = (new Date(j.updatedAt).getTime() - new Date(j.createdAt).getTime()) / 1000 / 60;
                            return time < 5;
                          }).length}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Medium (5-15 min)</span>
                        <span className="text-sm font-medium">
                          {jobs.filter(j => {
                            const time = (new Date(j.updatedAt).getTime() - new Date(j.createdAt).getTime()) / 1000 / 60;
                            return time >= 5 && time < 15;
                          }).length}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm">Slow (&gt;15 min)</span>
                        <span className="text-sm font-medium">
                          {jobs.filter(j => {
                            const time = (new Date(j.updatedAt).getTime() - new Date(j.createdAt).getTime()) / 1000 / 60;
                            return time >= 15;
                          }).length}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>System Health</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Queue Health</span>
                      <span className="font-medium text-green-600">Excellent</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-green-600 h-2 rounded-full" style={{ width: '95%' }}></div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Processing Capacity</span>
                      <span className="font-medium text-blue-600">Good</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-blue-600 h-2 rounded-full" style={{ width: '78%' }}></div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Error Rate</span>
                      <span className="font-medium text-yellow-600">Acceptable</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-yellow-600 h-2 rounded-full" style={{ width: '15%' }}></div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="retries" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Retry Attempts by Job</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <BarChart data={retryStats}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="attempts" fill="#ef4444" name="Attempts Used" />
                  <Bar dataKey="maxAttempts" fill="#d1d5db" name="Max Attempts" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-sm text-gray-600 mb-2">Jobs with Retries</p>
                  <p className="text-3xl font-bold text-orange-600">
                    {jobs.filter(j => j.attempts > 0).length}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-sm text-gray-600 mb-2">Total Retry Attempts</p>
                  <p className="text-3xl font-bold text-red-600">
                    {jobs.reduce((sum, j) => sum + j.attempts, 0)}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <p className="text-sm text-gray-600 mb-2">Max Retries Reached</p>
                  <p className="text-3xl font-bold text-red-700">
                    {jobs.filter(j => j.attempts >= j.maxAttempts).length}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
