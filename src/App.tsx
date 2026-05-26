import { Routes, Route, Navigate } from "react-router-dom";
import { AuthGuard } from "./components/AuthGuard.tsx";
import { Header } from "./components/Header.tsx";
import { AccountProvider } from "./lib/accountContext.tsx";
import { Login } from "./pages/Login.tsx";
import { Tables } from "./pages/Tables.tsx";
import { TableDetail } from "./pages/TableDetail.tsx";
import { SyncLog } from "./pages/SyncLog.tsx";
import { Dashboard } from "./pages/Dashboard.tsx";
import { Clients } from "./pages/Clients.tsx";
import { ClientDetail } from "./pages/ClientDetail.tsx";
import { Tasks } from "./pages/Tasks.tsx";
import { SaasClients } from "./pages/SaasClients.tsx";
import { SaasClientDetail } from "./pages/SaasClientDetail.tsx";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <AuthGuard>
            <AccountProvider>
              <div className="min-h-screen flex flex-col">
                <Header />
                <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 sm:px-6 lg:px-8">
                  <Routes>
                    <Route index element={<Tables />} />
                    <Route
                      path="tables/:glideTableId"
                      element={<TableDetail />}
                    />
                    <Route path="logs" element={<SyncLog />} />
                    <Route path="dashboard" element={<Dashboard />} />
                    <Route path="clients" element={<Clients />} />
                    <Route path="clients/:clientId" element={<ClientDetail />} />
                    <Route path="tasks" element={<Tasks />} />
                    <Route path="saas-clients" element={<SaasClients />} />
                    <Route
                      path="saas-clients/:companyId"
                      element={<SaasClientDetail />}
                    />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </main>
              </div>
            </AccountProvider>
          </AuthGuard>
        }
      />
    </Routes>
  );
}
