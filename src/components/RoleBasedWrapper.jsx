import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { hasAccessToMenuItem, getRoleHierarchyLevel } from '../lib/MenuConfig';

const RoleBasedWrapper = ({
  children,
  requiredRole,
  requiredPermission,
  fallbackPath = '/dashboard',
  showUnauthorized = true
}) => {
  const { user, userRole, loading } = useAuth();
  const location = useLocation();

  // Show loading state while auth is being determined
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Check role-based access
  if (requiredRole) {
    const userLevel = getRoleHierarchyLevel(userRole);
    const requiredLevel = getRoleHierarchyLevel(requiredRole);

    if (userLevel < requiredLevel) {
      console.warn(`[RoleBasedWrapper] Access Denied. Required: ${requiredRole}, User: ${userRole}, Path: ${location.pathname}`);
      if (showUnauthorized) {
        return (
          <div className="min-h-screen flex items-center justify-center">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
              <p className="text-gray-600 mb-4">
                You don't have permission to access this page.
              </p>
              <p className="text-sm text-gray-500">
                Required role: {requiredRole} | Your role: {userRole}
              </p>
            </div>
          </div>
        );
      }
      return <Navigate to={fallbackPath} replace />;
    }
  }

  // Check permission-based access
  if (requiredPermission) {
    if (!hasAccessToMenuItem(requiredPermission, userRole)) {
      if (showUnauthorized) {
        return (
          <div className="min-h-screen flex items-center justify-center">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
              <p className="text-gray-600 mb-4">
                You don't have permission to access this feature.
              </p>
              <p className="text-sm text-gray-500">
                Required permission: {requiredPermission}
              </p>
            </div>
          </div>
        );
      }
      return <Navigate to={fallbackPath} replace />;
    }
  }

  // User has access, render children
  return children;
};

export default RoleBasedWrapper;