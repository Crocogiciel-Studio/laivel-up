import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider.js';
import { RequireAuth } from './auth/RequireAuth.js';
import { LoginPage } from './auth/LoginPage.js';
import { OrgProvider } from './org/OrgProvider.js';
import { Shell } from './layout/Shell.js';
import { OrgSettingsPage } from './pages/OrgSettingsPage.js';
import { AcceptInvitePage } from './pages/AcceptInvitePage.js';
import { ProfilesPage } from './pages/ProfilesPage.js';
import { GridsPage } from './pages/GridsPage.js';
import { RunsPage } from './pages/RunsPage.js';

export function App(): ReactNode {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/invite/:token"
            element={
              <RequireAuth>
                <OrgProvider>
                  <AcceptInvitePage />
                </OrgProvider>
              </RequireAuth>
            }
          />
          <Route
            element={
              <RequireAuth>
                <OrgProvider>
                  <Shell />
                </OrgProvider>
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="/profiles" replace />} />
            <Route path="/profiles" element={<ProfilesPage />} />
            <Route path="/grids" element={<GridsPage />} />
            <Route path="/runs" element={<RunsPage />} />
            <Route path="/org" element={<OrgSettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
