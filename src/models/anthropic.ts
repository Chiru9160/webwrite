import { BaseModel, ModelMessage } from './base';

export class AnthropicModel extends BaseModel {
  private apiKey: string;

  constructor(config: Partial<Record<string, unknown>>) {
    super(config as Record<string, unknown>);
    this.apiKey = (config.apiKey as string) || process.env['ANTHROPIC_API_KEY'] || '';
  }

  async query(messages: ModelMessage[]): Promise<ModelMessage> {
    const url = this.config.endpoint || 'https://api.anthropic.com/v1/messages';
    const modelName = this.config.modelName;

    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system' && m.role !== 'exit');

    const apiMessages = nonSystemMessages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user' as const,
      content: m.content,
    }));

    const body: Record<string, unknown> = {
      model: modelName,
      max_tokens: this.config.maxOutputTokens || 4000,
      messages: apiMessages,
    };

    if (systemMessages.length > 0) {
      body.system = systemMessages.map(m => ({ type: 'text', text: m.content }));
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout((this.config.requestTimeoutSeconds || 120) * 1000),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${text}`);
    }

    const respData = (await response.json()) as {
      content: { type: string; text: string }[];
      usage: { input_tokens: number; output_tokens: number };
    };

    const content = respData.content?.map(c => c.text).join('') || '';

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(content);
    } catch {}

    return {
      role: 'assistant',
      content,
      extra: {
        raw_response: respData,
        usage: respData.usage,
        done: parsed.done === true,
        final_response: parsed.final_response || '',
        thought: parsed.thought || '',
        bash_command: parsed.bash_command || '',
        actions: parsed.bash_command ? [{ bash_command: parsed.bash_command, command: parsed.bash_command }] : [],
      },
    };
  }
}
