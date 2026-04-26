import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthGuard } from '@/components/layout/AuthGuard'
import Landing from '@/pages/Landing'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import CreateStudy from '@/pages/CreateStudy'
import StudyBuilder from '@/pages/StudyBuilder'
import StudyWorkspace from '@/pages/StudyWorkspace'
import StudyShare from '@/pages/StudyShare'
import StudyResults from '@/pages/StudyResults'
import RespondentForm from '@/pages/RespondentForm'
import AdminDashboard from '@/pages/AdminDashboard'
import { StudyEditRedirect, StudyLegacyRedirect } from '@/pages/StudyIdRedirect'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/s/:shareSlug" element={<RespondentForm />} />
        <Route
          path="/form/:id/preview"
          element={
            <AuthGuard>
              <RespondentForm />
            </AuthGuard>
          }
        />

        {/* Protected routes */}
        <Route
          path="/dashboard"
          element={
            <AuthGuard>
              <Dashboard />
            </AuthGuard>
          }
        />
        <Route
          path="/admin"
          element={
            <AuthGuard>
              <AdminDashboard />
            </AuthGuard>
          }
        />
        <Route
          path="/admin/users"
          element={
            <AuthGuard>
              <AdminDashboard />
            </AuthGuard>
          }
        />
        <Route
          path="/admin/forms"
          element={
            <AuthGuard>
              <AdminDashboard />
            </AuthGuard>
          }
        />
        <Route
          path="/admin/responses"
          element={
            <AuthGuard>
              <AdminDashboard />
            </AuthGuard>
          }
        />
        <Route
          path="/admin/waitlist"
          element={
            <AuthGuard>
              <AdminDashboard />
            </AuthGuard>
          }
        />
        <Route
          path="/admin/health"
          element={
            <AuthGuard>
              <AdminDashboard />
            </AuthGuard>
          }
        />
        <Route
          path="/form/new"
          element={
            <AuthGuard>
              <CreateStudy />
            </AuthGuard>
          }
        />
        <Route
          path="/form/new/build"
          element={
            <AuthGuard>
              <StudyBuilder />
            </AuthGuard>
          }
        />

        {/* Typeform-style workspace: Content | Share | Results */}
        <Route
          path="/form/:id"
          element={
            <AuthGuard>
              <StudyWorkspace />
            </AuthGuard>
          }
        >
          <Route index element={<Navigate to="content" replace relative="path" />} />
          <Route path="content" element={<StudyBuilder />} />
          <Route path="share" element={<StudyShare />} />
          <Route path="results" element={<StudyResults />} />
        </Route>

        {/* Legacy URLs */}
        <Route
          path="/study/:id/edit"
          element={
            <AuthGuard>
              <StudyEditRedirect />
            </AuthGuard>
          }
        />
        <Route path="/study/new" element={<Navigate to="/form/new" replace />} />
        <Route path="/study/new/build" element={<Navigate to="/form/new/build" replace />} />
        <Route
          path="/study/:id/*"
          element={
            <AuthGuard>
              <StudyLegacyRedirect />
            </AuthGuard>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
