import React, { useState, useEffect } from 'react';
import {
  Shield, Users, Settings, Activity, Building2, 
  History, BarChart3, DoorOpen, LayoutGrid, Server
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { toast } from 'sonner';

// Admin Components
import UserManagementModern from './admin/UserManagementModern';
import LocationRoomManager from './admin/LocationRoomManager';
import ActivityLogViewer from './admin/ActivityLogViewer';
import GlobalSettings from './GlobalSettings';

// API modules
import { usersApi } from '../api/users.api.js';
import { locationsApi } from '../api/locations.api.js';
import { activityLogsApi } from '../api/activityLogs.api.js';

const SuperAdminDashboard = () => {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalLocations: 0,
    totalRooms: 0,
    recentLogs: []
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  const fetchStats = async () => {
    try {
      setLoading(true);
      
      // Fetch all stats in parallel
      const [usersRes, locationsRes, logsRes] = await Promise.all([
        usersApi.list({ limit: 1000 }),
        locationsApi.list(),
        activityLogsApi.list({ limit: 5 })
      ]);

      // Calculate total rooms from locations
      let totalRooms = 0;
      if (locationsRes?.data) {
        totalRooms = locationsRes.data.reduce((acc, loc) => acc + (loc.room_count || 0), 0);
      }

      setStats({
        totalUsers: usersRes?.data?.length || 0,
        totalLocations: locationsRes?.data?.length || 0,
        totalRooms,
        recentLogs: logsRes?.data || []
      });
    } catch (error) {
      console.error(error);
      toast.error('Gagal memuat statistik');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      {/* Header Premium */}
      <div className="bg-gradient-to-r from-blue-600 to-cyan-500 p-8 rounded-2xl text-white shadow-xl relative overflow-hidden mt-4">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <Settings className="h-32 w-32" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
              <Shield className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Super Admin Dashboard</h1>
              <p className="text-blue-100">System Administration & Management</p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-600 font-medium">Total Users</p>
                <h2 className="text-3xl font-bold text-blue-900">{stats.totalUsers}</h2>
              </div>
              <div className="p-3 bg-blue-200 rounded-xl">
                <Users className="h-6 w-6 text-blue-700" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-emerald-600 font-medium">Locations</p>
                <h2 className="text-3xl font-bold text-emerald-900">{stats.totalLocations}</h2>
              </div>
              <div className="p-3 bg-emerald-200 rounded-xl">
                <Building2 className="h-6 w-6 text-emerald-700" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-0 shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-600 font-medium">Total Rooms</p>
                <h2 className="text-3xl font-bold text-purple-900">{stats.totalRooms}</h2>
              </div>
              <div className="p-3 bg-purple-200 rounded-xl">
                <DoorOpen className="h-6 w-6 text-purple-700" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5 bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm p-1">
          <TabsTrigger value="overview" className="rounded-xl data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            <LayoutGrid className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="users" className="rounded-xl data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            <Users className="h-4 w-4 mr-2" />
            Users
          </TabsTrigger>
          <TabsTrigger value="inventory" className="rounded-xl data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            <Building2 className="h-4 w-4 mr-2" />
            Inventory
          </TabsTrigger>
          <TabsTrigger value="logs" className="rounded-xl data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            <History className="h-4 w-4 mr-2" />
            Logs
          </TabsTrigger>
          <TabsTrigger value="settings" className="rounded-xl data-[state=active]:bg-blue-600 data-[state=active]:text-white">
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </TabsTrigger>
        </TabsList>

        {/* --- Overview Tab --- */}
        <TabsContent value="overview">
          <Card className="bg-white/80 backdrop-blur-sm shadow-lg rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-blue-600" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {stats.recentLogs.length === 0 ? (
                  <p className="text-center text-slate-400 py-8">No recent activity</p>
                ) : (
                  stats.recentLogs.map((log, index) => (
                    <div key={log.id || index} className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <Activity className="h-4 w-4 text-blue-600" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">{log.action || log.description}</p>
                        <p className="text-sm text-slate-500">{log.created_at ? new Date(log.created_at).toLocaleString('id-ID') : ''}</p>
                      </div>
                      {log.user_name && (
                        <Badge variant="secondary" className="bg-slate-200 text-slate-700">
                          {log.user_name}
                        </Badge>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* --- User Management Tab --- */}
        <TabsContent value="users">
          <UserManagementModern />
        </TabsContent>

        {/* --- Inventory Tab --- */}
        <TabsContent value="inventory">
          <LocationRoomManager />
        </TabsContent>

        {/* --- Logs Tab --- */}
        <TabsContent value="logs">
          <ActivityLogViewer />
        </TabsContent>

        {/* --- Settings Tab --- */}
        <TabsContent value="settings">
          <GlobalSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
};

const ChevronRight = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

export default SuperAdminDashboard;
