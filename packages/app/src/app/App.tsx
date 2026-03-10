import { useEffect } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { SettingsPage } from './routes/settings-page';
import { WorkbenchPage } from './routes/workbench-page';
import { useUiShellStore } from '../stores/ui-shell-store';
import styles from './app-shell.module.css';

function ShellNavigation(): JSX.Element {
  return (
    <nav className={styles.nav}>
      <NavLink
        end
        to="/"
        className={({ isActive }) =>
          isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink
        }
      >
        Workbench
      </NavLink>
      <NavLink
        to="/settings"
        className={({ isActive }) =>
          isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink
        }
      >
        Settings
      </NavLink>
    </nav>
  );
}

export function App(): JSX.Element {
  const location = useLocation();
  const currentRoute = useUiShellStore((state) => state.currentRoute);
  const setCurrentRoute = useUiShellStore((state) => state.setCurrentRoute);

  useEffect(() => {
    const nextRoute = location.pathname === '/settings' ? 'settings' : 'workbench';
    setCurrentRoute(nextRoute);
  }, [location.pathname, setCurrentRoute]);

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>T001B Scaffold</p>
          <h1 className={styles.title}>do-what UI runtime skeleton</h1>
        </div>
        <div className={styles.routeBadge}>Active route: {currentRoute}</div>
      </header>

      <ShellNavigation />

      <main className={styles.main}>
        <Routes>
          <Route path="/" element={<WorkbenchPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
