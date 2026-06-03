export interface EnvironmentObservation {
  success: boolean;
  exception: string;
  url: string;
  title: string;
  screenshotPath: string;
  ariaSnapshot: string;
  pythonCode: string;
  pythonOutput: string;
  consoleOutput: string;
  recentConsole: string;
}

export interface EnvironmentConfig {
  startUrl?: string;
  outputDir?: string;
}

export abstract class BaseEnvironment {
  abstract prepare(kwargs: Record<string, unknown>): Promise<void>;
  abstract execute(action: Record<string, unknown>): Promise<Record<string, unknown>>;
  abstract getTemplateVars(): Record<string, unknown>;
  abstract serialize(): Record<string, unknown>;
  abstract close(): Promise<void>;
}
