import { BaseModel } from './base';
import { OpenAIModel } from './openai';
import { AnthropicModel } from './anthropic';

const MODEL_REGISTRY: Record<string, new (config: Record<string, unknown>) => BaseModel> = {
  openai: OpenAIModel as unknown as new (config: Record<string, unknown>) => BaseModel,
  anthropic: AnthropicModel as unknown as new (config: Record<string, unknown>) => BaseModel,
};

export function getModelClass(spec: string): new (config: Record<string, unknown>) => BaseModel {
  const klass = MODEL_REGISTRY[spec];
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

  throw new Error(`Unknown model: ${spec}. Available: ${Object.keys(MODEL_REGISTRY).join(', ')}`);
}

export function getModel(config: Record<string, unknown>, defaultType = 'openai'): BaseModel {
  const copied = { ...config };
  const modelClass = (copied.modelClass as string) || defaultType;
  delete copied.modelClass;
  const Klass = getModelClass(modelClass);
  return new Klass(copied);
}

export { BaseModel, OpenAIModel, AnthropicModel };
