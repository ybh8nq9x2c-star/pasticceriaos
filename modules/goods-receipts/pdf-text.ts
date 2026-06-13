// =============================================================================
// modules/goods-receipts/pdf-text.ts
// Estrazione testo da PDF lato server (pdf-parse). Import diretto della lib
// interna per evitare il noto bug del wrapper in modalità debug con i bundler.
// Il pacchetto è dichiarato in next.config `serverComponentsExternalPackages`.
// =============================================================================

import 'server-only';
import { BusinessRuleError } from '@/lib/errors';

interface PdfParseResult {
  text: string;
  numpages: number;
}

type PdfParseFn = (data: Buffer) => Promise<PdfParseResult>;

export async function extractPdfText(file: File): Promise<string> {
  if (file.type && file.type !== 'application/pdf') {
    throw new BusinessRuleError('Il documento deve essere un PDF.');
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length === 0) throw new BusinessRuleError('Il file è vuoto.');

  let pdfParse: PdfParseFn;
  try {
    const mod = (await import('pdf-parse/lib/pdf-parse.js')) as unknown as
      | PdfParseFn
      | { default: PdfParseFn };
    pdfParse = typeof mod === 'function' ? mod : mod.default;
  } catch (err) {
    console.error('[goods-receipts] pdf-parse non disponibile', err);
    throw new BusinessRuleError(
      'Lettura PDF non disponibile su questo server. Aggiungi le righe manualmente.',
    );
  }

  try {
    const result = await pdfParse(buffer);
    return result.text ?? '';
  } catch (err) {
    console.error('[goods-receipts] estrazione testo PDF fallita', err);
    throw new BusinessRuleError(
      'PDF non leggibile (scansione o formato non supportato). Puoi comunque registrare il ricevimento manualmente.',
    );
  }
}
