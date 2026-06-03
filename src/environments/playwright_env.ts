import * as fs from 'fs';
import * as path from 'path';
import { chromium, Browser, BrowserContext, Page, BrowserContextOptions } from 'playwright';
import { BaseEnvironment, EnvironmentObservation } from './base';

export interface PlaywrightEnvironmentConfig {
  startUrl?: string;
  outputDir?: string;
  browserMode?: string;
  headless?: boolean;
  devtools?: boolean;
  slowMoMs?: number;
  browserWidth?: number;
  browserHeight?: number;
  browserTimeoutMs?: number;
  browserNavigationTimeoutMs?: number;
  stepExecutionTimeoutMs?: number;
  observationTimeoutMs?: number;
  keepOpenOnExit?: boolean;
  promptBeforeClose?: boolean;
}

export class PlaywrightEnvironment extends BaseEnvironment {
  private config: PlaywrightEnvironmentConfig;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private stepIndex = 0;
  private preparedTask: Record<string, unknown> = {};
  private consoleHistory: string[] = [];
  private stepConsole: string[] = [];
  private stepJsCode = '';
  private stepJsOutput = '';

  constructor(config: PlaywrightEnvironmentConfig = {}) {
    super();
    this.config = {
      browserMode: 'local_launch',
      headless: false,
      devtools: false,
      slowMoMs: 50,
      browserWidth: 1280,
      browserHeight: 1440,
      browserTimeoutMs: 10000,
      browserNavigationTimeoutMs: 30000,
      stepExecutionTimeoutMs: 20000,
      observationTimeoutMs: 5000,
      keepOpenOnExit: false,
      promptBeforeClose: false,
      outputDir: 'outputs/default',
      ...config,
    };
  }

  async prepare(kwargs: Record<string, unknown> = {}): Promise<void> {
    this.preparedTask = { ...kwargs };
    this.stepIndex = 0;
    this.consoleHistory = [];
    this.stepConsole = [];

    const startUrl = (kwargs.startUrl as string) || this.config.startUrl || '';
    if (startUrl) this.config.startUrl = startUrl;

    fs.mkdirSync(this.config.outputDir!, { recursive: true });
    fs.mkdirSync(this.screenshotsDir(), { recursive: true });
    fs.mkdirSync(this.stepsDir(), { recursive: true });

    fs.writeFileSync(
      path.join(this.config.outputDir!, 'task.json'),
      JSON.stringify(kwargs, null, 2),
      'utf-8',
    );

    if (this.page && this.context) return;

    const launchArgs: string[] = [];
    if (this.config.devtools) {
      launchArgs.push('--auto-open-devtools-for-tabs');
    }

    this.browser = await chromium.launch({
      headless: this.config.headless,
      slowMo: this.config.slowMoMs,
      args: launchArgs,
    });

    this.context = await this.browser.newContext({
      viewport: { width: this.config.browserWidth, height: this.config.browserHeight },
    } as BrowserContextOptions);

    this.context.setDefaultTimeout(this.config.browserTimeoutMs || 10000);
    this.context.setDefaultNavigationTimeout(this.config.browserNavigationTimeoutMs || 30000);

    this.page = await this.context.newPage();
    this.attachPageListeners(this.page);

    if (startUrl) {
      await this.page.goto(startUrl, { waitUntil: 'domcontentloaded' });
    }
  }

  private screenshotsDir(): string {
    return path.join(this.config.outputDir!, 'screenshots');
  }

  private stepsDir(): string {
    return path.join(this.config.outputDir!, 'steps');
  }

  private attachPageListeners(page: Page): void {
    page.on('console', (msg) => {
      const text = msg.text();
      this.consoleHistory.push(text);
      this.stepConsole.push(text);
    });
    page.on('pageerror', (err) => {
      const line = `Page error: ${err.message}`;
      this.consoleHistory.push(line);
      this.stepConsole.push(line);
    });
  }

  async execute(action: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.stepIndex++;
    this.stepConsole = [];
    this.stepJsOutput = '';
    this.stepJsCode = (action.python_code as string) || (action.js_code as string) || '';

    this.persistStepCode(this.stepJsCode);

    let success = true;
    let exceptionText = '';

    try {
      if (this.stepJsCode.trim()) {
        const timeoutMs = this.config.stepExecutionTimeoutMs || 20000;
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Step execution timed out')), timeoutMs),
        );
        await Promise.race([
          this.runJsCode(this.stepJsCode),
          timeoutPromise,
        ]);
      }
      await this.waitForObservationReady();
    } catch (err: unknown) {
      success = false;
      exceptionText = err instanceof Error ? (err.stack || err.message) : String(err);
    }

    const observation = await this.captureObservation(success, exceptionText);

    return {
      output: this.stepJsOutput,
      returncode: success ? 0 : 1,
      exception_info: exceptionText,
      observation,
    };
  }

  private persistStepCode(code: string): void {
    fs.writeFileSync(
      path.join(this.stepsDir(), `step_${String(this.stepIndex).padStart(4, '0')}.js`),
      code,
      'utf-8',
    );
    fs.appendFileSync(
      path.join(this.config.outputDir!, 'script.js'),
      `\n\n// Step ${this.stepIndex}\n${code}\n`,
      'utf-8',
    );
  }

  private async runJsCode(jsCode: string): Promise<void> {
    if (!this.page || !this.context || !this.browser) {
      throw new Error('Browser environment was not prepared.');
    }

    const context = this.context;
    const page = this.page;
    const browser = this.browser;
    const task = this.preparedTask;

    const asyncFn = new Function(
      'page', 'context', 'browser', 'task',
      `return (async () => {\n${jsCode}\n})();`,
    );

    const result = await asyncFn(page, context, browser, task);
    if (result !== undefined) {
      this.stepJsOutput = String(result);
    }
  }

  private async waitForObservationReady(): Promise<void> {
    if (!this.page) return;
    try {
      await this.page.waitForLoadState('domcontentloaded', { timeout: this.config.observationTimeoutMs || 5000 });
    } catch {}
  }

  private async captureObservation(success: boolean, exceptionText: string): Promise<EnvironmentObservation> {
    const page = this.page;
    let url = '';
    let title = '';
    let ariaSnapshot = '';
    let screenshotPath = '';

    if (page) {
      try { url = page.url(); } catch { url = this.config.startUrl || ''; }
      try { title = await page.title(); } catch {}
      try {
        ariaSnapshot = await page.locator('body').ariaSnapshot({ timeout: this.config.observationTimeoutMs || 5000 });
      } catch {}
      try {
        screenshotPath = path.join(this.screenshotsDir(), `step_${String(this.stepIndex).padStart(4, '0')}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
      } catch { screenshotPath = ''; }
    }

    return {
      success,
      exception: exceptionText,
      url: url || this.config.startUrl || '',
      title,
      screenshotPath,
      ariaSnapshot,
      pythonCode: this.stepJsCode,
      pythonOutput: this.stepJsOutput,
      consoleOutput: this.stepConsole.slice(-20).join('\n'),
      recentConsole: this.consoleHistory.slice(-50).join('\n'),
    };
  }

  getTemplateVars(): Record<string, unknown> {
    return {
      startUrl: this.config.startUrl || '',
      outputDir: this.config.outputDir || '',
      browserMode: this.config.browserMode || 'local_launch',
    };
  }

  serialize(): Record<string, unknown> {
    return {
      environment: {
        config: { ...this.config },
        environment_type: this.constructor.name,
      },
    };
  }

  async close(): Promise<void> {
    if (this.config.promptBeforeClose) {
      const readline = await import('readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      await new Promise<void>((resolve) => {
        rl.question('Press Enter to close the browser...', () => { rl.close(); resolve(); });
      });
    }
    if (this.config.keepOpenOnExit) return;

    try {
      if (this.context) await this.context.close();
      if (this.browser) await this.browser.close();
    } finally {
      this.page = null;
      this.context = null;
      this.browser = null;
    }
  }
}
