import fs from 'node:fs';
import path from 'node:path';
import { DOWHAT_DIR } from '../config.js';

export const SOUL_CONFIG_PATH = path.join(DOWHAT_DIR, 'soul-config.json');

export interface SoulCompilerConfig {
  default_max_tokens?: number;
  enabled?: boolean;
  trigger_delay_ms?: number;
}

export interface SoulCustomApiConfig {
  api_key?: string;
  base_url?: string;
  extra_headers?: Record<string, string>;
  model?: string;
  provider_type?: 'anthropic-compatible' | 'openai-compatible';
}

export interface SoulDailyBudgetConfig {
  max_dollars?: number;
  max_tokens?: number;
}

export interface SoulOfficialApiConfig {
  api_key?: string;
  base_url?: string;
  model?: string;
}

export interface SoulConfig {
  compiler?: SoulCompilerConfig;
  custom_api?: SoulCustomApiConfig;
  daily_budget?: SoulDailyBudgetConfig;
  official_api?: SoulOfficialApiConfig;
}

function resolveConfigPath(configPath?: string): string {
  return configPath ?? process.env.DOWHAT_SOUL_CONFIG_PATH ?? SOUL_CONFIG_PATH;
}

function parseConfig(content: string): SoulConfig {
  try {
    const parsed = JSON.parse(content) as SoulConfig;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function readSoulConfig(configPath = SOUL_CONFIG_PATH): SoulConfig {
  try {
    const resolvedPath = resolveConfigPath(configPath);
    if (!fs.existsSync(resolvedPath)) {
      return {};
    }
    return parseConfig(fs.readFileSync(resolvedPath, 'utf8'));
  } catch (error) {
    console.warn('[soul][config] failed to read soul config, using defaults', error);
    return {};
  }
}

export function writeSoulConfig(
  config: SoulConfig,
  configPath = SOUL_CONFIG_PATH,
): void {
  const resolvedPath = resolveConfigPath(configPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, JSON.stringify(config, null, 2), 'utf8');
}
