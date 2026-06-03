import * as fs from 'fs';
import * as path from 'path';
import { BaseModel, ModelMessage } from '../models/base';
import { BaseEnvironment } from '../environments/base';
import { FormatError, LimitsExceeded } from '../exceptions';

export interface AgentConfig {
  system_template: string;
  instance_template: string;
  step_limit?: number;
  debug_log?: boolean;
  attach_instance_template_after_observation?: boolean;
  attach_plan_md_after_observation?: boolean;
  require_self_reflection_success?: boolean;
  summary_every_n_steps?: number;
  keep_last_n_observations?: number;
  output_path?: string;
}

const DEFAULT_SYSTEM_TEMPLATE = `You are an AI assistant that completes browser-based tasks.
You respond with JSON containing: thought, python_code (async Playwright code), done, final_response.`;

const DEFAULT_INSTANCE_TEMPLATE = `Task: {{ task }}
{{ start_url ? 'Start URL: ' + start_url : '' }}
Output directory: {{ output_dir }}`;

export class DefaultAgent {
  protected config: AgentConfig;
  protected messages: ModelMessage[] = [];
  protected model: BaseModel;
  protected env: BaseEnvironment;
  protected extraTemplateVars: Record<string, unknown> = {};
  protected nCalls = 0;
  protected nFormatErrors = 0;

  constructor(model: BaseModel, env: BaseEnvironment, config: Partial<AgentConfig> = {}) {
    this.model = model;
    this.env = env;
    this.config = {
      system_template: DEFAULT_SYSTEM_TEMPLATE,
      instance_template: DEFAULT_INSTANCE_TEMPLATE,
      step_limit: 15,
      debug_log: true,
      attach_instance_template_after_observation: false,
      attach_plan_md_after_observation: false,
      require_self_reflection_success: false,
      summary_every_n_steps: 0,
      keep_last_n_observations: -1,
      ...config,
    };
  }

  protected getTemplateVars(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      ...this.config,
      ...this.env.getTemplateVars(),
      ...this.model.getTemplateVars(),
      n_model_calls: this.nCalls,
      ...this.extraTemplateVars,
      ...extra,
    };
  }

  protected renderTemplate(template: string): string {
    const vars = this.getTemplateVars();
    return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key) => {
      const val = vars[key];
      return val !== undefined ? String(val) : _match;
    });
  }

  addMessages(...messages: ModelMessage[]): ModelMessage[] {
    this.messages.push(...messages);
    this.pruneOldObservationAriaSnapshots();
    return messages;
  }

  protected pruneOldObservationAriaSnapshots(): void {
    const n = this.config.keep_last_n_observations || -1;
    if (n <= 0) return;

    const obsIndices = this.messages
      .map((m, i) => (m.extra?.observation ? i : -1))
      .filter(i => i >= 0);

    if (obsIndices.length <= n) return;

    const placeholder = '(ARIA snapshot pruned; see most recent observation)';
    for (const idx of obsIndices.slice(0, obsIndices.length - n)) {
      const msg = this.messages[idx];
      const obs = msg.extra?.observation as Record<string, unknown> | undefined;
      if (!obs?.aria_snapshot) continue;

      const aria = obs.aria_snapshot as string;
      if (typeof msg.content === 'string' && msg.content.includes(aria)) {
        msg.content = msg.content.replace(aria, placeholder);
      }
      obs.aria_snapshot = '';
    }
  }

  async run(task: string, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    this.extraTemplateVars = { task, ...extra };
    this.messages = [];
    this.nCalls = 0;
    this.nFormatErrors = 0;

    this.addMessages(
      { role: 'system', content: this.renderTemplate(this.config.system_template) },
      { role: 'user', content: this.renderTemplate(this.config.instance_template) },
    );

    while (true) {
      try {
        await this.step();
      } catch (err: unknown) {
        if (err instanceof FormatError) {
          this.nFormatErrors++;
          const formatErr = err as FormatError;
          this.addMessages(...formatErr.messages as ModelMessage[]);
        } else {
          throw err;
        }
      } finally {
        this.save();
      }

      if (this.messages.length > 0 && this.messages[this.messages.length - 1].role === 'exit') break;

      if (
        (this.config.summary_every_n_steps || 0) > 0 &&
        this.nCalls > 0 &&
        this.nCalls % (this.config.summary_every_n_steps || Infinity) === 0
      ) {
        await this.compactHistory();
        this.save();
      }
    }

    return this.messages[this.messages.length - 1].extra || {};
  }

  async step(): Promise<void> {
    const message = await this.query();
    await this.executeActions(message);
  }

  async query(): Promise<ModelMessage> {
    if ((this.config.step_limit || 0) > 0 && this.config.step_limit! <= this.nCalls) {
      throw new LimitsExceeded(
        { role: 'exit', content: 'Step limit exceeded.', extra: { exit_status: 'LimitsExceeded', submission: '' } },
      );
    }

    const message = await this.model.query(this.messages);
    this.nCalls++;
    this.addMessages(message);
    return message;
  }

  async executeActions(message: ModelMessage): Promise<void> {
    const extra = message.extra || {};
    if (extra.done) {
      this.writeDebugStepArtifact(message, []);
      this.addMessages({
        role: 'exit',
        content: (extra.final_response as string) || 'Task completed.',
        extra: {
          exit_status: 'Submitted',
          submission: extra.final_response || '',
          final_response: extra.final_response || '',
        },
      });
      return;
    }

    const actions = (extra.actions as Record<string, unknown>[]) || [];
    const outputs: Record<string, unknown>[] = [];
    for (const action of actions) {
      const output = await this.env.execute(action);
      outputs.push(output);
    }

    this.writeDebugStepArtifact(message, outputs);

    const observationMessages = this.formatObservationMessages(outputs);
    this.addMessages(...observationMessages);
  }

  protected formatObservationMessages(outputs: Record<string, unknown>[]): ModelMessage[] {
    return outputs.map(output => {
      const obs = (output.observation || {}) as Record<string, unknown>;
      const lines = [
        `Observation:`,
        `Status: ${obs.success ? 'ok' : 'error'}`,
        `URL: ${obs.url || ''}`,
        `Title: ${obs.title || ''}`,
      ];
      if (obs.exception) lines.push(`Exception:\n${obs.exception}`);
      if (obs.consoleOutput) lines.push(`Console output:\n${obs.consoleOutput}`);
      if (obs.ariaSnapshot) lines.push(`ARIA snapshot:\n${obs.ariaSnapshot}`);
      if (obs.screenshotPath) lines.push(`Screenshot: ${obs.screenshotPath}`);

      return {
        role: 'user' as const,
        content: lines.join('\n'),
        extra: { observation: obs },
      };
    });
  }

  protected writeDebugStepArtifact(_message: ModelMessage, _outputs: Record<string, unknown>[]): void {
    if (!this.config.debug_log) return;
    const dd = this.debugDir();
    if (!dd) return;

    const stepsDir = path.join(dd, 'steps');
    fs.mkdirSync(stepsDir, { recursive: true });
  }

  protected debugDir(): string | null {
    return this.config.output_path
      ? path.join(path.dirname(this.config.output_path), 'debug')
      : null;
  }

  protected async compactHistory(): Promise<void> {
    if (this.messages.length === 0) return;
    const systemIdx = this.messages.findIndex(m => m.role === 'system');
    if (systemIdx < 0) return;

    const systemMsg = this.messages[systemIdx];
    const summaryRequest: ModelMessage = {
      role: 'user',
      content: 'Please provide a concise summary of all progress so far, including what has been accomplished and what remains.',
      extra: { interrupt_type: 'HistoryCompactionRequest' },
    };

    const summaryMessages = [...this.messages, summaryRequest];

    try {
      const response = await this.model.query(summaryMessages);
      const summaryText = (response.content || '').trim() || '(empty summary)';

      this.messages = [
        systemMsg,
        {
          role: 'user',
          content: `## Compacted History Summary\n(context was compacted after step ${this.nCalls}; earlier turns replaced by the summary below)\n\n${summaryText}\n\n## End of Compacted Summary`,
          extra: { interrupt_type: 'HistoryCompactionSummary' },
        },
      ];
    } catch {}
  }

  serialize(...extraDicts: Record<string, unknown>[]): Record<string, unknown> {
    const lastMessage = this.messages.length > 0 ? this.messages[this.messages.length - 1] : { extra: {} as Record<string, unknown> };
    const lastExtra = (lastMessage.extra || {}) as Record<string, unknown>;

    const base: Record<string, unknown> = {
      info: {
        config: {
          agent: { ...this.config },
          agent_type: this.constructor.name,
        },
        version: '0.1.0',
        exit_status: lastExtra.exit_status || '',
        submission: lastExtra.submission || '',
        api_calls: this.nCalls,
        format_errors: this.nFormatErrors,
      },
      messages: this.messages.map(m => ({
        ...m,
        content: typeof m.content === 'string' ? m.content : m.content,
      })),
      trajectory_format: 'webwright-0.1',
      ...this.model.serialize(),
      ...this.env.serialize(),
    };

    for (const d of extraDicts) {
      Object.assign(base, d);
    }
    return base;
  }

  save(pathStr?: string, ...extraDicts: Record<string, unknown>[]): Record<string, unknown> {
    const data = this.serialize(...extraDicts);
    const outputPath = pathStr || this.config.output_path;
    if (outputPath) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf-8');
    }
    return data;
  }
}
