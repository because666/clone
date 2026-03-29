import MapContainer from '../components/MapContainer';
import { EnvironmentProvider } from '../contexts/EnvironmentContext';
import { AlertNotificationProvider } from '../components/AlertNotificationProvider';

function DashboardPage() {
  return (
    <EnvironmentProvider>
      <AlertNotificationProvider>
        <div className="relative w-screen h-screen overflow-hidden bg-slate-900">
          <MapContainer />
        </div>
      </AlertNotificationProvider>
    </EnvironmentProvider>
  );
}

export default DashboardPage;