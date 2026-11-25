// Everything behind login lives in this lazily-loaded chunk.
// The server only serves it to authenticated sessions, so visitors who are
// not logged in never receive the dashboard code or its API map.
import { Navigate, Route, Routes } from 'react-router-dom';
import { MetricsProvider } from './lib/metrics.jsx';
import DashboardLayout from './components/layout/DashboardLayout.jsx';
import OverviewPage from './pages/OverviewPage.jsx';
import ServicesPage from './pages/ServicesPage.jsx';
import DockerPage from './pages/DockerPage.jsx';
import ProcessesPage from './pages/ProcessesPage.jsx';

export default function Dashboard() {
  return (
    <MetricsProvider>
      <Routes>
        <Route path="/" element={<DashboardLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="services" element={<ServicesPage />} />
          <Route path="docker" element={<DockerPage />} />
          <Route path="processes" element={<ProcessesPage />} />
          {/* The terminal stays mounted in the layout so shells survive page switches. */}
          <Route path="terminal" element={null} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </MetricsProvider>
  );
}
