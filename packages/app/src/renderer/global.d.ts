interface DoWhatRuntimeInfo {
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
