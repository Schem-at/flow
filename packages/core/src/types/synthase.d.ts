/**
 * Type declarations for the synthase module
 */

declare module '@flow/synthase' {
  export interface ExecuteOptions {
    contextProviders?: Record<string, unknown>;
    limits?: {
      timeout?: number;
      maxRecursionDepth?: number;
      maxImportedScripts?: number;
    };
  }

  export interface ValidateOptions {
    contextProviders?: Record<string, unknown>;
  }

  export interface ValidationResult {
    io: {
      inputs: Record<string, { name: string; type: string; required?: boolean }>;
      outputs: Record<string, { name: string; type: string }>;
    };
    dependencies?: string[];
  }

  export function execute(
    code: string,
    inputs: Record<string, unknown>,
    options: ExecuteOptions
  ): Promise<Record<string, unknown>>;

  export function validate(
    code: string,
    options: ValidateOptions
  ): Promise<ValidationResult>;

  export function createReusable(
    code: string,
    options: ValidateOptions
  ): Promise<{
    execute: (inputs?: Record<string, unknown>) => Promise<Record<string, unknown>>;
    io: ValidationResult['io'];
  }>;
}

