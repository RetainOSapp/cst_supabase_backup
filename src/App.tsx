import { Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense, type ReactNode } from "react";
import { AuthGuard } from "./components/AuthGuard.tsx";
import { AppShell } from "./components/Header.tsx";
import { AccountProvider, useAccountContext } from "./lib/accountContext.tsx";
import { Login } from "./pages/Login.tsx";
import { Tables } from "./pages/Tables.tsx";
import { TableDetail } from "./pages/TableDetail.tsx";
import { SyncLog } from "./pages/SyncLog.tsx";
import { ComingSoonPage } from "./components/ComingSoon.tsx";

const Dashboard = lazy(() =>
  import("./pages/Dashboard.tsx").then((module) => ({
    default: module.Dashboard,
  })),
);
const CsmReports = lazy(() =>
  import("./pages/CsmReports.tsx").then((module) => ({
    default: module.CsmReports,
  })),
);
const DailyPulse = lazy(() =>
  import("./pages/DailyPulse.tsx").then((module) => ({
    default: module.DailyPulse,
  })),
);
const Clients = lazy(() =>
  import("./pages/Clients.tsx").then((module) => ({
    default: module.Clients,
  })),
);
const ClientDetail = lazy(() =>
  import("./pages/ClientDetail.tsx").then((module) => ({
    default: module.ClientDetail,
  })),
);
const Tasks = lazy(() =>
  import("./pages/Tasks.tsx").then((module) => ({
    default: module.Tasks,
  })),
);
const Pipeline = lazy(() =>
  import("./pages/Pipeline.tsx").then((module) => ({
    default: module.Pipeline,
  })),
);
const CallAi = lazy(() =>
  import("./pages/CallAi.tsx").then((module) => ({
    default: module.CallAi,
  })),
);
const Resources = lazy(() =>
  import("./pages/Resources.tsx").then((module) => ({
    default: module.Resources,
  })),
);
const SaasClients = lazy(() =>
  import("./pages/SaasClients.tsx").then((module) => ({
    default: module.SaasClients,
  })),
);
const SaasClientDetail = lazy(() =>
  import("./pages/SaasClientDetail.tsx").then((module) => ({
    default: module.SaasClientDetail,
  })),
);

const CallIntelligenceDevelopmentPreview = import.meta.env.DEV
  ? lazy(() =>
      import(
        "./components/call-ai/CallIntelligenceDevelopmentPreview.tsx"
      ).then((module) => ({
        default: module.CallIntelligenceDevelopmentPreview,
      }))
    )
  : null;

function NoPermission() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
      <h1 className="text-lg font-semibold text-gray-900">You do not have access here</h1>
      <p className="mt-2 text-sm text-gray-600">
        This area is not available for your current RetainOS role.
      </p>
    </div>
  );
}

function PageLoading() {
  return (
    <div className="flex min-h-64 items-center justify-center">
      <div className="flex items-center gap-3 text-sm font-medium text-gray-500">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-indigo-600" />
        Loading page...
      </div>
    </div>
  );
}

function RequireCapability({
  allowed,
  children,
}: {
  allowed: boolean;
  children: ReactNode;
}) {
  return allowed ? <>{children}</> : <NoPermission />;
}

function DefaultRoute() {
  const { capabilities } = useAccountContext();
  if (capabilities.canAccessDashboard) return <Navigate to="/dashboard" replace />;
  if (capabilities.canAccessClients) return <Navigate to="/clients" replace />;
  if (capabilities.canAccessTasks) return <Navigate to="/tasks" replace />;
  if (capabilities.canAccessAdminHub) return <Navigate to="/admin" replace />;
  if (capabilities.canAccessSaasClients) return <Navigate to="/saas-clients" replace />;
  return <NoPermission />;
}

function AdminHub() {
  const { effectiveCompanyId } = useAccountContext();

  if (!effectiveCompanyId) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center text-amber-900">
        Select a company before opening Admin Hub.
      </div>
    );
  }

  return <SaasClientDetail companyIdOverride={effectiveCompanyId} mode="admin" />;
}

function AccountShell() {
  const { capabilities, status, accessIssue } = useAccountContext();

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#59abf0]" />
      </div>
    );
  }

  if (status === "no_access") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-gray-900">Access not configured</h1>
          <p className="mt-2 text-sm text-gray-600">
            {accessIssue ?? "Your account does not have RetainOS access yet."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <Suspense fallback={<PageLoading />}>
          <Routes>
            <Route index element={<DefaultRoute />} />
            <Route
              path="tables"
              element={
                <RequireCapability allowed={capabilities.canAccessTables}>
                  <Tables />
                </RequireCapability>
              }
            />
            <Route
              path="tables/:glideTableId"
              element={
                <RequireCapability allowed={capabilities.canAccessTables}>
                  <TableDetail />
                </RequireCapability>
              }
            />
            <Route
              path="logs"
              element={
                <RequireCapability allowed={capabilities.canAccessTables}>
                  <SyncLog />
                </RequireCapability>
              }
            />
            <Route
              path="dashboard"
              element={
                <RequireCapability allowed={capabilities.canAccessDashboard}>
                  <Dashboard />
                </RequireCapability>
              }
            />
            <Route
              path="csm-reports"
              element={
                <RequireCapability allowed={capabilities.canAccessCsmReports}>
                  <CsmReports />
                </RequireCapability>
              }
            />
            <Route
              path="daily-pulse"
              element={
                <RequireCapability allowed={capabilities.canAccessClients}>
                  <DailyPulse />
                </RequireCapability>
              }
            />
            <Route
              path="clients"
              element={
                <RequireCapability allowed={capabilities.canAccessClients}>
                  <Clients />
                </RequireCapability>
              }
            />
            <Route
              path="clients/:clientId"
              element={
                <RequireCapability allowed={capabilities.canAccessClients}>
                  <ClientDetail />
                </RequireCapability>
              }
            />
            <Route
              path="tasks"
              element={
                <RequireCapability allowed={capabilities.canAccessTasks}>
                  <Tasks />
                </RequireCapability>
              }
            />
            <Route
              path="pipeline"
              element={
                <RequireCapability allowed={capabilities.canAccessPipeline}>
                  <Pipeline />
                </RequireCapability>
              }
            />
            <Route
              path="call-ai"
              element={
                <RequireCapability allowed={capabilities.canAccessCallAi}>
                  <CallAi />
                </RequireCapability>
              }
            />
            <Route
              path="resources"
              element={
                <RequireCapability allowed={capabilities.canAccessResources}>
                  <Resources />
                </RequireCapability>
              }
            />
            <Route
              path="groups"
              element={
                <RequireCapability allowed={capabilities.canAccessClients}>
                  <ComingSoonPage
                    title="Groups"
                    description="Group cohorts, shared client journeys, and group-level management will be added in a later rollout phase."
                  />
                </RequireCapability>
              }
            />
            <Route
              path="admin"
              element={
                <RequireCapability allowed={capabilities.canAccessAdminHub}>
                  <AdminHub />
                </RequireCapability>
              }
            />
            <Route
              path="saas-clients"
              element={
                <RequireCapability allowed={capabilities.canAccessSaasClients}>
                  <SaasClients />
                </RequireCapability>
              }
            />
            <Route
              path="saas-clients/:companyId"
              element={
                <RequireCapability allowed={capabilities.canAccessSaasClients}>
                  <SaasClientDetail />
                </RequireCapability>
              }
            />
            <Route path="*" element={<DefaultRoute />} />
          </Routes>
        </Suspense>
      </main>
    </AppShell>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/__dev/call-intelligence"
        element={
          import.meta.env.DEV && CallIntelligenceDevelopmentPreview ? (
            <Suspense fallback={null}>
              <CallIntelligenceDevelopmentPreview />
            </Suspense>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/*"
        element={
          <AuthGuard>
            <AccountProvider>
              <AccountShell />
            </AccountProvider>
          </AuthGuard>
        }
      />
    </Routes>
  );
}
