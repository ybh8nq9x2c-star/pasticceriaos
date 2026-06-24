// =============================================================================
// app/(main)/production/template/page.tsx
// "Settimana tipo": il template settimanale di produzione. Server Component che
// carica il template corrente + le ricette e passa al client editor.
// =============================================================================

import type { Metadata } from 'next';
import { getWeekTemplate } from '@/modules/production/service';
import { listRecipes } from '@/modules/catalog/service';
import { WeekTemplateEditor } from './WeekTemplateEditor';

export const metadata: Metadata = { title: 'Settimana tipo' };

export default async function WeekTemplatePage() {
  const [template, recipes] = await Promise.all([getWeekTemplate(), listRecipes(true)]);
  return (
    <WeekTemplateEditor template={template} recipes={recipes.map((r) => ({ id: r.id, name: r.name }))} />
  );
}
