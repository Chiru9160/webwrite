export class WebwrightError extends Error {
  messages: { role: string; content: string; extra?: Record<string, unknown> }[];
  constructor(...messages: { role: string; content: string; extra?: Record<string, unknown> }[]) {
    super('Webwright flow interruption');
    this.messages = messages;
  }
}

export class LimitsExceeded extends WebwrightError {}
export class FormatError extends WebwrightError {}
export class Submitted extends WebwrightError {}
