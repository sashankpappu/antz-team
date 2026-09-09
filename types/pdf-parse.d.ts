/**
 * pdf-parse ships no types, and its package entry point runs a self-test
 * against a file that is not published when `module.parent` is unset. We import
 * the library module directly to skip that, so the declaration matches that
 * path rather than the package root.
 */
declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfParseResult {
    text: string;
    numpages: number;
    info: unknown;
    metadata: unknown;
  }
  function pdfParse(data: Buffer | Uint8Array): Promise<PdfParseResult>;
  export = pdfParse;
}
