interface DoWhatRuntimeInfo {
  readonly coreSessionToken: string | null;
  readonly coreSessionTokenPath: string;
  readonly readFreshSessionToken?: () => string | null;
  readonly platform: string;
  readonly versions: {
    readonly chrome: string;
    readonly electron: string;
    readonly node: string;
  };
}

interface Window {
  readonly doWhatRuntime: DoWhatRuntimeInfo;
}
