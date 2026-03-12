import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { SettingsPage } from './routes/settings-page';
import { WorkbenchPage } from './routes/workbench-page';
import { selectCurrentRoute } from '../selectors';
import { useUiStore } from '../stores/ui';
import styles from './app-shell.module.css';

export function App() {
  const location = useLocation();
  const currentRoute = useUiStore(selectCurrentRoute);
  const setCurrentRoute = useUiStore((state) => state.setCurrentRoute);

  useEffect(() => {
    const nextRoute = location.pathname === '/settings' ? 'settings' : 'workbench';
    setCurrentRoute(nextRoute);
  }, [location.pathname, setCurrentRoute]);

  return (
    <div className={styles.windowChrome} data-route={currentRoute}>
      <main className={styles.frame}>
        <Routes>
          <Route path="/" element={<WorkbenchPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
