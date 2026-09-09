import Anthropic from '@anthropic-ai/sdk';
import { config } from '@/lib/config';

export class ModelNotConfiguredError extends Error {
  constructor() {
    super(
      'ANTHROPIC_API_KEY is not set. Extraction, question generation and ' +
        'rendering all need it.',
    );
    this.name = 'ModelNotConfiguredError';
  }
}

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!config.anthropicApiKey) throw new ModelNotConfiguredError();
  client ??= new Anthropic({ apiKey: config.anthropicApiKey });
  return client;
}

export function isModelConfigured(): boolean {
  return Boolean(config.anthropicApiKey);
}

export { MODEL } from '@/lib/config';
