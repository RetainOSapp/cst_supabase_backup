import { Routes, Route, Navigate } from "react-router-dom";
import { AuthGuard } from "./components/AuthGuard.tsx";
import { Header } from "./components/Header.tsx";
import { Login } from "./pages/Login.tsx";
import { Tables } from "./pages/Tables.tsx";
import { TableDetail } from "./pages/TableDetail.tsx";
import { SyncLog } from "./pages/SyncLog.tsx";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <AuthGuard>
            <div className="min-h-screen flex flex-col">
              <Header />
              <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 sm:px-6 lg:px-8">
                <Routes>
                  <Route index element={<Tables />} />
                  <Route path="tables/:glideTableId" element={<TableDetail />} />
                  <Route path="logs" element={<SyncLog />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </main>
            </div>
          </AuthGuard>
        }
      />
    </Routes>
  );
}
