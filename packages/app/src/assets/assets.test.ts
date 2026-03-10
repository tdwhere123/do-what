import { describe, expect, it } from 'vitest';
import { DECORATIVE_ASSET_URLS, EMPTY_ASSET_URLS } from './index';

describe('svg assets', () => {
  it('exports stable empty-state asset URLs from the app package', () => {
    expect(EMPTY_ASSET_URLS.workbench).toContain('.svg');
    expect(EMPTY_ASSET_URLS.settings).toContain('.svg');
  });

  it('exports decorative SVG assets from the formal runtime directory', () => {
    expect(DECORATIVE_ASSET_URLS.dotGrain).toContain('.svg');
    expect(DECORATIVE_ASSET_URLS.waveLine).toContain('.svg');
  });
});
