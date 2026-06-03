import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from './config';
import { getModel } from './models';
import { getEnvironment } from './environments';
import { getAgent } from './agents';

const DEFAULT_CONFIGS = ['base.yaml', 'model_openai.yaml'];

function timestampedOutputDir(baseDir: string | undefined, taskId: string | undefined): string {
  const base = baseDir || 'outputs';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const suffix = taskId || 'adhoc';
  return path.join(base, `${suffix}_${stamp}`);
}

export interface RunOptions {
  task?: string;
  taskId?: string;
  startUrl?: string;
  configSpec?: string[];
  outputDir?: string;
  debug?: boolean;
}

export async function runOne(options: RunOptions): Promise<Record<string, unknown>> {
  const configSpec = options.configSpec || DEFAULT_CONFIGS;

  const resolvedConfigs = configSpec
    .map(spec => resolveConfigSpec(spec))
    .filter(Boolean) as Record<string, unknown>[];
  const config = Object.assign({}, ...resolvedConfigs) as Record<string, unknown>;

  const runConfig = (config.run || {}) as Record<string, unknown>;
  const resolvedTaskId = options.taskId || (runConfig.taskId as string);
  const resolvedTask = options.task || (runConfig.task as string);
  const resolvedStartUrl = options.startUrl || (runConfig.startUrl as string);

  if (!resolvedTask) {
    throw new Error('A task is required. Use --task.');
  }

  const envConfig = (config.environment || {}) as Record<string, unknown>;
  const resolvedOutputDir = options.outputDir || timestampedOutputDir(
    envConfig.outputDir as string,
    resolvedTaskId,
  );

  const mergedConfig: Record<string, unknown> = {
    ...config,
    run: {
      task: resolvedTask,
      taskId: resolvedTaskId || '',
      startUrl: resolvedStartUrl || '',
    },
    environment: {
      ...envConfig,
      outputDir: resolvedOutputDir,
      startUrl: resolvedStartUrl || '',
      headless: options.debug ? false : (envConfig.headless !== false),
      devtools: options.debug ? true : (envConfig.devtools || false),
      keepOpenOnExit: options.debug ? true : (envConfig.keepOpenOnExit || false),
      promptBeforeClose: options.debug ? true : (envConfig.promptBeforeClose || false),
      slowMoMs: options.debug ? 250 : (envConfig.slowMoMs || 50),
    },
    agent: {
      ...((config.agent || {}) as Record<string, unknown>),
      outputPath: path.join(resolvedOutputDir, 'trajectory.json'),
    },
  };

  const modelConfig = (mergedConfig.model || {}) as Record<string, unknown>;
  const envCfg = (mergedConfig.environment || {}) as Record<string, unknown>;
  const agentCfg = (mergedConfig.agent || {}) as Record<string, unknown>;

  const model = getModel(modelConfig);
  const env = getEnvironment(envCfg);
  const agent = getAgent(model, env, agentCfg);

  console.log(`Running task in ${resolvedOutputDir}`);

  fs.mkdirSync(resolvedOutputDir, { recursive: true });
  fs.writeFileSync(path.join(resolvedOutputDir, 'merged_config.json'), JSON.stringify(mergedConfig, null, 2), 'utf-8');

  let runException: Error | null = null;
  let result: Record<string, unknown> = {};

  try {
    await env.prepare({
      task: resolvedTask,
      taskId: resolvedTaskId,
      startUrl: resolvedStartUrl,
    });
    result = await agent.run(resolvedTask, {
      taskId: resolvedTaskId || '',
      startUrl: resolvedStartUrl || '',
    });
  } catch (err: any) {
    runException = err;
    result = {
      ...result,
      exit_status: err.constructor?.name || 'Error',
      submission: '',
      final_response: '',
      run_exception: err.message,
    };
  } finally {
    try {
      await env.close();
    } catch (closeErr: any) {
      result = {
        ...result,
        exit_status: closeErr.constructor?.name || 'Error',
        submission: '',
        final_response: '',
        close_exception: closeErr.message,
      };
      if (!runException) runException = closeErr;
    }
  }

  result._output_dir = resolvedOutputDir;
  console.log((result.final_response as string) || (result.submission as string) || 'Task finished.');
  if (runException) throw runException;
  return result;
}

function resolveConfigSpec(spec: string): Record<string, unknown> | null {
  const specPath = path.resolve(spec);
  if (fs.existsSync(specPath)) {
    const content = fs.readFileSync(specPath, 'utf-8');
    return parseYamlLike(content);
  }
  return null;
}

function parseYamlLike(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const stack: { indent: number; obj: Record<string, unknown> }[] = [{ indent: -1, obj: result }];

  for (const line of yaml.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const indent = line.search(/\S/);
    const trimmed = line.trim();

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx < 0) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    let value: unknown = trimmed.slice(colonIdx + 1).trim();

    if (value === '') {
      value = undefined;
    } else if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (value === 'null') value = null;
    else if (!isNaN(Number(value))) value = Number(value);

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].obj;

    if (value === undefined) {
      const newObj: Record<string, unknown> = {};
      parent[key] = newObj;
      stack.push({ indent, obj: newObj });
    } else {
      parent[key] = value;
    }
  }

  return result;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options: RunOptions = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--task': case '-t':
        options.task = args[++i];
        break;
      case '--task-id':
        options.taskId = args[++i];
        break;
      case '--start-url':
        options.startUrl = args[++i];
        break;
      case '--config': case '-c':
        options.configSpec = (options.configSpec || []).concat(args[++i]);
        break;
      case '--output-dir': case '-o':
        options.outputDir = args[++i];
        break;
      case '--debug':
        options.debug = true;
        break;
      case '--help': case '-h':
        console.log(`Usage: webwright --task <task> [options]

Options:
  --task, -t           Natural language task (required)
  --task-id            Optional identifier for output directory
  --start-url          Optional starting URL
  --config, -c         Config file(s) (default: base.yaml, model_openai.yaml)
  --output-dir, -o     Output directory
  --debug              Launch headed browser with devtools
  --help, -h           Show this help`);
        process.exit(0);
    }
  }

  if (!options.task) {
    console.error('Error: --task is required. Use --help for usage.');
    process.exit(1);
  }

  try {
    await runOne(options);
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { main };
