import settingsEmptyUrl from './empty/settings-empty.svg';
import workbenchEmptyUrl from './empty/workbench-empty.svg';
import dotGrainUrl from './decorative/dot-grain.svg';
import waveLineUrl from './decorative/wave-line.svg';

export const EMPTY_ASSET_URLS = {
  settings: settingsEmptyUrl,
  workbench: workbenchEmptyUrl,
} as const;

export const DECORATIVE_ASSET_URLS = {
  dotGrain: dotGrainUrl,
  waveLine: waveLineUrl,
} as const;
