import { BaseEnvironment } from './base';
import { PlaywrightEnvironment } from './playwright_env';

const ENV_REGISTRY: Record<string, new (config: Record<string, unknown>) => BaseEnvironment> = {
  local_browser: PlaywrightEnvironment as unknown as new (config: Record<string, unknown>) => BaseEnvironment,
  playwright: PlaywrightEnvironment as unknown as new (config: Record<string, unknown>) => BaseEnvironment,
};

export function getEnvironmentClass(spec: string): new (config: Record<string, unknown>) => BaseEnvironment {
  const klass = ENV_REGISTRY[spec];
  if (klass) return klass;

  const parts = spec.split('.');
  if (parts.length >= 2) {
    const moduleName = parts.slice(0, -1).join('.');
    const className = parts[parts.length - 1];
    try {
      const mod = require(moduleName);
      return mod[className];
    } catch {}
  }

  throw new Error(`Unknown environment: ${spec}. Available: ${Object.keys(ENV_REGISTRY).join(', ')}`);
}

export function getEnvironment(config: Record<string, unknown>, defaultType = 'local_browser'): BaseEnvironment {
  const copied = { ...config };
  const envClass = (copied.environmentClass as string) || defaultType;
  delete copied.environmentClass;
  const Klass = getEnvironmentClass(envClass);
  return new Klass(copied);
}

export { BaseEnvironment, PlaywrightEnvironment };
