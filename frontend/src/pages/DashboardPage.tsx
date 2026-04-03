import MapContainer from '../components/MapContainer';
import { EnvironmentProvider } from '../contexts/EnvironmentContext';

function DashboardPage() {
  return (
    <EnvironmentProvider>
      <div className="relative w-screen h-screen overflow-hidden bg-slate-900">
        <MapContainer />
      </div>
    </EnvironmentProvider>
  );
}

export default DashboardPage;