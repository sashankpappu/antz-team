import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * The output template is fixed.
 *
 * Sections and their order live in templates/*.md, and rendering is pure
 * substitution — the model is never handed the document and asked to write it.
 * It fills named fields (see lib/render/prose.ts) and nothing else, so it
 * cannot drop a section it had nothing to say about, invent one, or reorder
 * them between two renders of the same workspace.
 */

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

export class MissingTemplateFieldError extends Error {
  constructor(public readonly fields: string[], template: string) {
    super(
      `Template "${template}" has placeholders with no value: ${fields.join(', ')}. ` +
        `A fixed template means every field is filled — with "not yet established" ` +
        `if that is the honest answer.`,
    );
    this.name = 'MissingTemplateFieldError';
  }
}

export type TemplateValues = Record<string, string>;

/**
 * Substitute every placeholder. Throws on an unfilled one rather than leaving
 * `{{trigger}}` in a document that goes to a developer.
 */
export function fill(template: string, values: TemplateValues, name = 'template'): string {
  const missing = new Set<string>();

  const output = template.replace(PLACEHOLDER, (_, key: string) => {
    const value = values[key];
    if (value === undefined) {
      missing.add(key);
      return '';
    }
    return value;
  });

  if (missing.size > 0) throw new MissingTemplateFieldError([...missing], name);
  return output;
}

/** Placeholder names a template expects, in order of first appearance. */
export function fieldsOf(template: string): string[] {
  return [...new Set([...template.matchAll(PLACEHOLDER)].map((m) => m[1]))];
}

const TEMPLATE_DIR = path.join(process.cwd(), 'templates');
const cache = new Map<string, string>();

export async function loadTemplate(name: 'brd' | 'architecture'): Promise<string> {
  const cached = cache.get(name);
  if (cached) return cached;
  const text = await readFile(path.join(TEMPLATE_DIR, `${name}.md`), 'utf-8');
  cache.set(name, text);
  return text;
}

/** Markdown table helpers. Renders escape cell content; claims are user text. */
export function table(headers: string[], rows: string[][]): string {
  const head = `| ${headers.join(' | ')} |`;
  const rule = `|${headers.map(() => '---').join('|')}|`;
  if (rows.length === 0) {
    return [head, rule, `| ${headers.map(() => '—').join(' | ')} |`].join('\n');
  }
  const body = rows.map((row) => `| ${row.map(cell).join(' | ')} |`);
  return [head, rule, ...body].join('\n');
}

/**
 * Make a value safe inside a markdown table cell. A pipe in a claim ("SAP |
 * shortage tracker") would otherwise split the row and shift every column.
 */
export function cell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim() || '—';
}

/** The marker for something the store cannot yet answer. Used consistently. */
export const UNKNOWN = '_not yet established_';
