
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import AppLayout from "./layouts/AppLayout";
import DashboardPage from "./pages/DashboardPage";
import SubjectsPage from "./pages/SubjectsPage";
import DocumentsPage from "./pages/DocumentsPage";
import AiTutorPage from "./pages/AiTutorPage";
import QuizzesPage from "./pages/QuizzesPage";
import QuizTakePage from "./pages/QuizTakePage";
import QuizResultPage from "./pages/QuizResultPage";
import LearningProgressPage from "./pages/LearningProgressPage";

import AuthPage from "./pages/AuthPage";
import PdfViewerPage from "./pages/PdfViewerPage";
import AdminSubjectsPage from "./pages/AdminSubjectsPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import AdminUsersPage from "./pages/AdminUsersPage";
import AccountRecoveryPage from "./pages/AccountRecoveryPage";
import AccountSettingsPage from "./pages/AccountSettingsPage";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import "./App.css";

function Private({ children }: { children: React.ReactNode }) {
  const { user, checking } = useAuth();
  if (checking) return <p style={{ padding: 32 }}>Đang kiểm tra đăng nhập…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return user?.role === "Admin" ? <>{children}</> : <Navigate to="/app" replace />;
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/app" replace />} />

        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/confirm-email" element={<AccountRecoveryPage mode="confirm" />} />
        <Route path="/forgot-password" element={<AccountRecoveryPage mode="forgot" />} />
        <Route path="/reset-password" element={<AccountRecoveryPage mode="reset" />} />
        <Route path="/resend-confirmation" element={<AccountRecoveryPage mode="resend" />} />
        <Route path="/app/pdf/:id" element={<Private><PdfViewerPage /></Private>} />
        <Route path="/app" element={<Private><AppLayout /></Private>}>
          <Route index element={<DashboardPage />} />

          <Route
            path="subjects"
            element={<SubjectsPage />}
          />

          <Route
            path="documents"
            element={<DocumentsPage />}
          />

          <Route
            path="ai-tutor"
            element={<AiTutorPage />}
          />

          <Route
            path="quizzes"
            element={<QuizzesPage />}
          />

          <Route path="attempts/:attemptId/take" element={<QuizTakePage />} />
          <Route path="results/:attemptId" element={<QuizResultPage />} />

          <Route path="progress" element={<LearningProgressPage />} />
          <Route path="account" element={<AccountSettingsPage />} />
          <Route path="admin" element={<AdminOnly><AdminDashboardPage /></AdminOnly>} />
          <Route path="admin/users" element={<AdminOnly><AdminUsersPage /></AdminOnly>} />
          <Route path="admin/subjects" element={<AdminOnly><AdminSubjectsPage /></AdminOnly>} />
        </Route>

        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return <AuthProvider><AppRoutes /></AuthProvider>;
}
