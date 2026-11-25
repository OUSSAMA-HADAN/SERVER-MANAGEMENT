// Everything behind login lives in this lazily-loaded chunk.
// The server only serves it to authenticated sessions, so visitors who are
// not logged in never receive the dashboard code or its API map.
import { Routes, Route, Navigate } from 'react-router-dom';
import DashboardLayout from './components/layout/DashboardLayout.jsx';
import OverviewPage from './pages/OverviewPage.jsx';
import ServicesPage from './pages/ServicesPage.jsx';
import DockerPage from './pages/DockerPage.jsx';
import ProcessesPage from './pages/ProcessesPage.jsx';
import TerminalPage from './pages/TerminalPage.jsx';

export default function Dashboard() {
  return (
    <Routes>
      <Route path="/" element={<DashboardLayout />}>
        <Route index element={<OverviewPage />} />
        <Route path="services" element={<ServicesPage />} />
        <Route path="docker" element={<DockerPage />} />
        <Route path="processes" element={<ProcessesPage />} />
        <Route path="terminal" element={<TerminalPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
