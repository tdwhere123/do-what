import {
  createCoreEventClient,
  HttpCoreEventSource,
  type CoreEventClient,
  type CoreEventSource,
} from '../core-event-client';
import {
  HttpCoreApiAdapter,
  type CoreApiAdapter,
} from '../core-http-client';
import { CoreSessionGuard } from '../core-session-guard';
import { NormalizedEventBus } from '../events';
import {
  createMockCoreApiAdapter,
  MockCoreEventSource,
  MockTemplateRegistryAdapter,
} from '../mocks';
import type { TemplateRegistryAdapter } from '../template-registry/template-registry-adapter';
import { getRuntimeCoreConfig, type RuntimeCoreConfig } from './runtime-config';

export interface AppServices {
  readonly config: RuntimeCoreConfig;
  readonly coreApi: CoreApiAdapter;
  readonly eventBus: NormalizedEventBus;
  readonly eventClient: CoreEventClient;
  readonly sessionGuard: CoreSessionGuard;
  readonly templateRegistry: TemplateRegistryAdapter;
}

let cachedAppServices: AppServices | null = null;

export function createAppServices(config = getRuntimeCoreConfig()): AppServices {
  const templateRegistry = new MockTemplateRegistryAdapter();
  const eventBus = new NormalizedEventBus();
  const sessionGuard = new CoreSessionGuard();

  let coreApi: CoreApiAdapter;
  let eventSource: CoreEventSource;

  if (config.transportMode === 'http') {
    coreApi = new HttpCoreApiAdapter(config, templateRegistry);
    eventSource = new HttpCoreEventSource(config);
  } else {
    coreApi = createMockCoreApiAdapter({
      scenario: config.mockScenario,
    });
    eventSource = new MockCoreEventSource({
      scenario: config.mockScenario,
    });
  }

  return {
    config,
    coreApi,
    eventBus,
    eventClient: createCoreEventClient({
      eventBus,
      eventSource,
      sessionGuard,
    }),
    sessionGuard,
    templateRegistry,
  };
}

export function setAppServicesForTesting(services: AppServices | null): void {
  cachedAppServices = services;
}

export function resetAppServices(): void {
  cachedAppServices = null;
}

export function getAppServices(): AppServices {
  cachedAppServices ??= createAppServices();
  return cachedAppServices;
}
