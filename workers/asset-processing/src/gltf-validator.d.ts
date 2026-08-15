declare module 'gltf-validator' {
  export type ValidationReport = {
    uri?: string;
    mimeType?: string;
    validatorVersion?: string;
    issues: {
      numErrors: number;
      numWarnings: number;
      numInfos: number;
      numHints: number;
      messages: unknown[];
      truncated?: boolean;
    };
    info?: unknown;
  };

  const validator: {
    validateBytes(
      bytes: Uint8Array,
      options?: { uri?: string; format?: 'glb' | 'gltf'; maxIssues?: number },
    ): Promise<ValidationReport>;
  };

  export default validator;
}
