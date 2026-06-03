export interface ModelMessage {
  role: 'system' | 'user' | 'assistant' | 'exit';
  content: string;
  extra?: Record<string, unknown>;
}

export interface ModelConfig {
  modelClass: string;
  modelName: string;
  endpoint?: string;
  apiKey?: string;
  requestTimeoutSeconds?: number;
  maxOutputTokens?: number;
  attachObservationScreenshot?: boolean;
  observationTemplate?: string;
  formatErrorTemplate?: string;
}

export abstract class BaseModel {
  protected config: ModelConfig;

  constructor(config: Partial<ModelConfig>) {
    this.config = {
      modelClass: config.modelClass || 'openai',
      modelName: config.modelName || 'gpt-4o',
      requestTimeoutSeconds: config.requestTimeoutSeconds || 120,
      maxOutputTokens: config.maxOutputTokens || 4000,
      attachObservationScreenshot: config.attachObservationScreenshot ?? false,
      observationTemplate: config.observationTemplate || '',
      formatErrorTemplate: config.formatErrorTemplate || '',
    };
  }

  abstract query(messages: ModelMessage[]): Promise<ModelMessage>;

  formatMessage(role: ModelMessage['role'], content: string, extra?: Record<string, unknown>): ModelMessage {
    return { role, content, extra };
  }

  getTemplateVars(): Record<string, unknown> {
    return {};
  }

  serialize(): Record<string, unknown> {
    return { model: { config: { ...this.config, apiKey: '<redacted>' } } };
  }
}
