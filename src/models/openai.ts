import { BaseModel, ModelMessage } from './base';

export class OpenAIModel extends BaseModel {
  private apiKey: string;

  constructor(config: Partial<Record<string, unknown>>) {
    super(config as Record<string, unknown>);
    this.apiKey = (config.apiKey as string) || process.env['OPENAI_API_KEY'] || '';
  }

  async query(messages: ModelMessage[]): Promise<ModelMessage> {
    const url = this.config.endpoint || 'https://api.openai.com/v1/chat/completions';
    const modelName = this.config.modelName;

    const apiMessages = messages
      .filter(m => m.role !== 'exit')
      .map(m => ({
        role: m.role,
        content: m.content,
      }));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages: apiMessages,
        max_tokens: this.config.maxOutputTokens,
      }),
      signal: AbortSignal.timeout((this.config.requestTimeoutSeconds || 120) * 1000),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${text}`);
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    const content = data.choices[0]?.message?.content || '';

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(content);
    } catch {}

    return {
      role: 'assistant',
      content,
      extra: {
        raw_response: data,
        usage: data.usage,
        done: parsed.done === true,
        final_response: parsed.final_response || '',
        thought: parsed.thought || '',
        bash_command: parsed.bash_command || '',
        actions: parsed.bash_command ? [{ bash_command: parsed.bash_command, command: parsed.bash_command }] : [],
      },
    };
  }
}
