import React from 'react';
import { Outlet } from 'react-router-dom';
import HeaderLayout from './HeaderLayout';
import BottomNavigation from './BottomNavigation';
import { useAuth } from '../contexts/AuthContext';

const MainLayout = () => {
  const { user, userRole } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Sticky Header */}
      <HeaderLayout user={user} userRole={userRole} />

      {/* Main Content Area */}
      <main className="flex-1 pb-20"> {/* pb-20 to account for bottom nav */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Outlet />
        </div>
      </main>

      {/* Bottom Navigation */}
      <BottomNavigation userRole={userRole} />
    </div>
  );
};

export default MainLayout;