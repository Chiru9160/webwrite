import * as fs from 'fs';
import * as path from 'path';

export interface Config {
  model?: {
    modelClass?: string;
    modelName?: string;
    endpoint?: string;
    requestTimeoutSeconds?: number;
    maxOutputTokens?: number;
    attachObservationScreenshot?: boolean;
    observationTemplate?: string;
    formatErrorTemplate?: string;
  };
  environment?: {
    environmentClass?: string;
    startUrl?: string;
    outputDir?: string;
    commandTimeoutSeconds?: number;
    shell?: string;
    credentialsFile?: string;
    browserMode?: string;
    taskMetadataFilename?: string;
    finalScriptName?: string;
    outputTruncationChars?: number;
    finalScriptPreviewChars?: number;
    recentFilesLimit?: number;
    env?: Record<string, string>;
  };
  run?: {
    task?: string;
    taskId?: string;
    startUrl?: string;
  };
  agent?: {
    agentClass?: string;
    debugLog?: boolean;
    outputPath?: string;
    stepLimit?: number;
    requireSelfReflectionSuccess?: boolean;
    summaryEveryNSteps?: number;
    keepLastNObservations?: number;
    systemTemplate?: string;
    instanceTemplate?: string;
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadConfig(specs: string[]): Record<string, any> {
  let merged: Record<string, unknown> = {};
  for (const spec of specs) {
    const filePath = path.resolve(spec);
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseYamlLike(content);
    merged = deepMerge(merged, parsed);
  }
  return merged as Record<string, unknown>;
}

function parseYamlLike(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let current: Record<string, unknown> = result;
  const stack: { key: string; obj: Record<string, unknown> }[] = [];

  for (const line of yaml.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const indent = line.search(/\S/);
    const trimmed = line.trim();

    if (trimmed.endsWith(':')) {
      const key = trimmed.slice(0, -1);
      const newObj: Record<string, unknown> = {};

      while (stack.length > 0 && stack[stack.length - 1].key.length >= indent) {
        stack.pop();
      }

      if (stack.length === 0) {
        result[key] = newObj;
        stack.push({ key: '', obj: result });
        current = newObj;
        stack.push({ key: key, obj: result });
      } else {
        const parent = stack[stack.length - 1].obj;
        parent[key] = newObj;
        current = newObj;
        stack.push({ key: key, obj: parent });
      }
    } else if (trimmed.includes(':')) {
      const sepIdx = trimmed.indexOf(':');
      const key = trimmed.slice(0, sepIdx).trim();
      let value: unknown = trimmed.slice(sepIdx + 1).trim();

      if (value === '') value = '';
      else if (value === 'true') value = true;
      else if (value === 'false') value = false;
      else if (value === 'null') value = null;
      else if (!isNaN(Number(value))) value = Number(value);

      if (stack.length > 0) {
        stack[stack.length - 1].obj[key] = value;
      } else {
        result[key] = value;
      }
    }
  }

  return result;
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) && target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      result[key] = deepMerge(target[key] as Record<string, unknown>, source[key] as Record<string, unknown>);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
