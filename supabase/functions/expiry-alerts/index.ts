// =============================================================================
// supabase/functions/expiry-alerts/index.ts
// Cron giornaliero (06:00 IT / 05:00 UTC): lotti in scadenza entro 3 giorni →
// notifica in-app per ogni org + email all'indirizzo dell'organizzazione.
//
// Auth a strati:
//   - deploy con verify_jwt=true → serve un JWT Supabase valido (il job pg_cron
//     chiama con l'anon key)
//   - se il secret CRON_SECRET è configurato nei Function Secrets, è richiesto
//     anche l'header x-cron-secret (difesa in profondità)
// Email: Resend via HTTP. Se RESEND_API_KEY manca, l'email viene SALTATA e la
// risposta lo dichiara — niente finti successi.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

interface ExpiringRow {
  organization_id: string;
  ingredient_name: string;
  expiry_date: string;
  quantity_remaining: number;
  unit: string;
  suggested_recipes: string[] | null;
}

Deno.serve(async (req: Request) => {
  // Difesa in profondità: se CRON_SECRET è configurato, pretendilo.
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (cronSecret && req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response('Unauthorized', { status: 401 });
  }

  const threeDaysLater = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];

  const { data: expiring, error } = await supabase
    .from('v_expiring_batches')
    .select('organization_id, ingredient_name, expiry_date, quantity_remaining, unit, suggested_recipes')
    .lte('expiry_date', threeDaysLater)
    .gt('quantity_remaining', 0)
    .order('expiry_date', { ascending: true });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  if (!expiring || expiring.length === 0) {
    return new Response(JSON.stringify({ processed: 0, note: 'no expiring batches' }), { status: 200 });
  }

  const byOrg = (expiring as ExpiringRow[]).reduce((acc, row) => {
    (acc[row.organization_id] ??= []).push(row);
    return acc;
  }, {} as Record<string, ExpiringRow[]>);

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  let notified = 0;
  let emailed = 0;
  let dedupSkipped = 0;
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const appUrl = Deno.env.get('NEXT_PUBLIC_APP_URL') ?? '';

  for (const [orgId, batches] of Object.entries(byOrg)) {
    // Idempotenza giornaliera: una sola notifica scadenze per org al giorno.
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('organization_id', orgId)
      .like('title', 'Scadenze ingredienti%')
      .gte('created_at', todayStart.toISOString())
      .limit(1);
    if (existing && existing.length > 0) {
      dedupSkipped++;
      continue;
    }

    await supabase.from('notifications').insert({
      organization_id: orgId,
      type: 'warn',
      title: `Scadenze ingredienti: ${batches.length} ${batches.length > 1 ? 'lotti' : 'lotto'} entro 3 giorni`,
      message: batches
        .map((b) => `${b.ingredient_name}: ${b.quantity_remaining} ${b.unit} (scade ${b.expiry_date})`)
        .join('\n'),
      href: '/inventory/batches',
    });
    notified++;

    // Email all'indirizzo dell'organizzazione (campo reale organizations.email).
    if (resendKey) {
      const { data: org } = await supabase
        .from('organizations')
        .select('name, email')
        .eq('id', orgId)
        .maybeSingle();

      if (org?.email) {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${resendKey}`,
          },
          body: JSON.stringify({
            from: 'PasticceriaOS <alert@pasticceriaos.it>',
            to: org.email,
            subject: `⚠️ ${batches.length} ingredienti in scadenza — ${org.name}`,
            html: buildExpiryEmailHtml(org.name, batches, appUrl),
          }),
        });
        if (res.ok) emailed++;
      }
    }
  }

  return new Response(
    JSON.stringify({
      processed: Object.keys(byOrg).length,
      notified,
      emailed,
      dedupSkipped,
      emailChannel: resendKey ? 'resend' : 'DISABLED (RESEND_API_KEY mancante)',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});

function buildExpiryEmailHtml(orgName: string, batches: ExpiringRow[], appUrl: string): string {
  const rows = batches
    .map(
      (b) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(b.ingredient_name)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">${b.quantity_remaining} ${escapeHtml(b.unit)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">${b.expiry_date}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">${
        b.suggested_recipes && b.suggested_recipes.length > 0
          ? escapeHtml(b.suggested_recipes.slice(0, 3).join(', '))
          : '—'
      }</td>
    </tr>`,
    )
    .join('');

  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2>Ciao ${escapeHtml(orgName)},</h2>
      <p>Questi lotti scadono entro i prossimi 3 giorni:</p>
      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#f5f5f5">
            <th style="padding:8px;text-align:left">Ingrediente</th>
            <th style="padding:8px;text-align:left">Quantità</th>
            <th style="padding:8px;text-align:left">Scadenza</th>
            <th style="padding:8px;text-align:left">Usalo in</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${appUrl ? `
      <p style="margin-top:24px">
        <a href="${appUrl}/inventory/batches"
           style="background:#1A2B4A;color:white;padding:10px 20px;border-radius:8px;text-decoration:none">
          Vai alla gestione lotti
        </a>
      </p>` : ''}
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
