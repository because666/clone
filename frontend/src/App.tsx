import { useState } from 'react';
import MapContainer from './components/MapContainer';
import DashboardOverlay from './components/DashboardOverlay';
import { WindSpeedProvider } from './contexts/WindSpeedContext';
import { AlertNotificationProvider } from './components/AlertNotificationProvider';
import { WeatherProvider } from './contexts/WeatherContext';

function App() {
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);

  return (
    <WindSpeedProvider>
      <AlertNotificationProvider>
        <WeatherProvider>
          <div className="relative w-screen h-screen overflow-hidden bg-slate-900">
            <DashboardOverlay 
                hideRightPanels={isRightPanelOpen} 
                onOpenAlgoLab={() => setIsRightPanelOpen(true)}
            />
            <MapContainer 
                onRightPanelToggle={setIsRightPanelOpen} 
                isRightPanelOpen={isRightPanelOpen}
            />
          </div>
        </WeatherProvider>
      </AlertNotificationProvider>
    </WindSpeedProvider>
  );
}


export default App;

