import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider.js';
import { RequireAuth } from './auth/RequireAuth.js';
import { LoginPage } from './auth/LoginPage.js';
import { OrgProvider } from './org/OrgProvider.js';
import { Shell } from './layout/Shell.js';
import { Placeholder } from './pages/Placeholder.js';
import { OrgSettingsPage } from './pages/OrgSettingsPage.js';
import { AcceptInvitePage } from './pages/AcceptInvitePage.js';

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
            <Route
              path="/profiles"
              element={
                <Placeholder
                  title="Profiles"
                  issue="58"
                  blurb="Enter a developer's dossier through a form over the five sections."
                />
              }
            />
            <Route
              path="/grids"
              element={
                <Placeholder
                  title="Grids"
                  issue="59"
                  blurb="Compose a grid by dropping criteria into axes and tuning them."
                />
              }
            />
            <Route
              path="/runs"
              element={
                <Placeholder
                  title="Runs"
                  issue="60"
                  blurb="Run a profile against a grid and track a developer over time."
                />
              }
            />
            <Route path="/org" element={<OrgSettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
