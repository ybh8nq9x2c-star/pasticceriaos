// =============================================================================
// modules/recipe-import/actions.ts
// Server Actions thin per l'import ricette. analyze (file/testo → preview) e
// import (payload confermato → creazione batch).
// =============================================================================

'use server';

import { revalidatePath } from 'next/cache';
import { getErrorMessage } from '@/lib/errors';
import { formField, type ActionState } from '@/lib/utils';
import * as service from './service';
import type { AnalyzeResult, ImportSourceKind, ImportSummary } from './types';

export type AnalyzeState = ActionState & { result?: AnalyzeResult };

export async function analyzeImportAction(
  _prev: AnalyzeState,
  formData: FormData,
): Promise<AnalyzeState> {
  const kindRaw = formField(formData, 'kind');
  const kind: ImportSourceKind = kindRaw === 'csv' || kindRaw === 'pdf' ? kindRaw : 'text';
  try {
    const file = formData.get('file');
    const result = await service.analyzeRecipeImport({
      kind,
      text: formField(formData, 'text') ?? undefined,
      file: file instanceof File && file.size > 0 ? file : undefined,
    });
    return { status: 'success', result };
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
}

export type ImportState = ActionState & { summary?: ImportSummary };

export async function importRecipesAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  try {
    const payload = JSON.parse(formField(formData, 'payload') ?? '{}');
    const summary = await service.importRecipes(payload);
    revalidatePath('/recipes');
    return { status: 'success', summary };
  } catch (err) {
    return { status: 'error', error: getErrorMessage(err) };
  }
}
