// Tipi minimi per l'entrypoint interno di pdf-parse (il wrapper principale ha
// un side-effect di debug incompatibile coi bundler; si importa la lib diretta).
declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfParseResult {
    text: string;
    numpages: number;
    info?: unknown;
  }
  function pdfParse(data: Buffer): Promise<PdfParseResult>;
  export default pdfParse;
}
