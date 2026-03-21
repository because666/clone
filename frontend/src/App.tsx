import MapContainer from './components/MapContainer';
import DashboardOverlay from './components/DashboardOverlay';
import { WindSpeedProvider } from './contexts/WindSpeedContext';
import { AlertNotificationProvider } from './components/AlertNotificationProvider';
import { WeatherProvider } from './contexts/WeatherContext';

function App() {
  return (
    <WindSpeedProvider>
      <AlertNotificationProvider>
        <WeatherProvider>
          <div className="relative w-screen h-screen overflow-hidden bg-slate-900">
            <DashboardOverlay />
            <MapContainer />
          </div>
        </WeatherProvider>
      </AlertNotificationProvider>
    </WindSpeedProvider>
  );
}


export default App;

