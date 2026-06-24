// =============================================================================
// app/api/production/suggestions/route.ts
// Template ricorrenti (Task 2): suggerimenti di piano derivati dai piani esistenti
// (ultimo piano, stesso giorno della settimana). Il form produzione li propone
// così non si parte mai da una tela bianca.
// =============================================================================

import { NextResponse } from 'next/server';
import { getPlanSuggestions } from '@/modules/production/service';

export async function GET() {
  try {
    const suggestions = await getPlanSuggestions();
    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [] }, { status: 200 });
  }
}
