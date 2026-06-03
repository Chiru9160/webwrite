import { BaseModel } from '../models/base';
import { BaseEnvironment } from '../environments/base';
import { DefaultAgent } from './default';

const AGENT_REGISTRY: Record<string, new (model: BaseModel, env: BaseEnvironment, config: Record<string, unknown>) => DefaultAgent> = {
  default: DefaultAgent as unknown as new (model: BaseModel, env: BaseEnvironment, config: Record<string, unknown>) => DefaultAgent,
};

export function getAgentClass(spec: string): new (model: BaseModel, env: BaseEnvironment, config: Record<string, unknown>) => DefaultAgent {
  const klass = AGENT_REGISTRY[spec];
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

  throw new Error(`Unknown agent: ${spec}. Available: ${Object.keys(AGENT_REGISTRY).join(', ')}`);
}

export function getAgent(
  model: BaseModel,
  env: BaseEnvironment,
  config: Record<string, unknown>,
  defaultType = 'default',
): DefaultAgent {
  const copied = { ...config };
  const agentClass = (copied.agentClass as string) || defaultType;
  delete copied.agentClass;
  const Klass = getAgentClass(agentClass);
  return new Klass(model, env, copied);
}

export { DefaultAgent };
