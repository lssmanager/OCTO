/**
 * @octo/prompts — Prompt templates and registry
 * Full implementation: see issue #4 (F0-003)
 */
export const PROMPTS_PACKAGE_VERSION = '0.0.1' as const;

export interface PromptTemplate {
  readonly id: string;
  readonly name: string;
  readonly template: string;
  readonly variables: ReadonlyArray<string>;
}

export type PromptRegistry = ReadonlyMap<string, PromptTemplate>;
