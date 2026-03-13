import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { getAppServices } from '../lib/runtime/app-services';
import { selectCurrentRoute } from '../selectors';
import { useUiStore } from '../stores/ui';
import { CoreOfflineScreen } from './core-offline-screen';
import { SettingsPage } from './routes/settings-page';
import { WorkbenchPage } from './routes/workbench-page';
import styles from './app-shell.module.css';

export function App() {
  const location = useLocation();
  const bootstrapStatus = useUiStore((state) => state.bootstrapStatus);
  const currentRoute = useUiStore(selectCurrentRoute);
  const setCurrentRoute = useUiStore((state) => state.setCurrentRoute);
  const transportMode = getAppServices().config.transportMode;
  const showOfflineScreen = transportMode === 'http' && bootstrapStatus === 'offline';

  useEffect(() => {
    const nextRoute = location.pathname === '/settings' ? 'settings' : 'workbench';
    setCurrentRoute(nextRoute);
  }, [location.pathname, setCurrentRoute]);

  return (
    <div className={styles.windowChrome} data-route={currentRoute}>
      <main className={styles.frame}>
        {showOfflineScreen ? (
          <CoreOfflineScreen />
        ) : (
          <Routes>
            <Route path="/" element={<WorkbenchPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </main>
    </div>
  );
}