import { create } from 'zustand';

type RouteId = 'workbench' | 'settings';

interface UiShellState {
  readonly currentRoute: RouteId;
  setCurrentRoute: (route: RouteId) => void;
}

export const useUiShellStore = create<UiShellState>((set) => ({
  currentRoute: 'workbench',
  setCurrentRoute: (currentRoute) => set({ currentRoute }),
}));
