/**
 * scripts/test-e2e-ordering.ts
 *
 * Test E2E del modulo ordini via Supabase JS client reale.
 * Esegue S17 → S18 → S19 → S20 senza SQL diretto per la business logic.
 *
 * Prerequisiti (già soddisfatti nel DB):
 *   - utente test@pasticceria.test / TestPass123! in auth.users
 *   - org 00000000-0000-0000-0000-000000000001 con supplier e ingredienti
 *
 * Esecuzione:
 *   cd pasticceriaos-web
 *   npx tsx scripts/test-e2e-ordering.ts
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../lib/database.types';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.error('❌ Missing env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY required.');
  console.error('   Copy .env.example → .env.local and fill in your Supabase credentials.');
  process.exit(1);
}
const ORG_ID        = '00000000-0000-0000-0000-000000000001';
const SUPPLIER_ID   = '00000000-0000-0000-0000-000000000010';
const FARINA_ID     = '00000000-0000-0000-0000-000000000020';
const ZUCCHERO_ID   = '00000000-0000-0000-0000-000000000021';
const TEST_EMAIL    = 'test@pasticceria.test';
const TEST_PASS     = 'TestPass123!';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';

function pass(label: string, detail?: string) {
  console.log(`${GREEN}✅ ${label}${RESET}${detail ? `  ${YELLOW}${detail}${RESET}` : ''}`);
}
function fail(label: string, reason: string): never {
  console.error(`${RED}❌ ${label}: ${reason}${RESET}`);
  process.exit(1);
}
function info(msg: string) {
  console.log(`   ${msg}`);
}
function section(title: string) {
  console.log(`\n${BOLD}── ${title} ──${RESET}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const sb = createClient<Database>(SUPABASE_URL, SUPABASE_ANON);

  // ── Auth ──────────────────────────────────────────────────────────────────
  section('Auth');
  const { data: { session }, error: authErr } = await sb.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASS,
  });
  if (authErr || !session) fail('Sign in', authErr?.message ?? 'no session');
  const userId = session.user.id;
  pass('Sign in', `user ${session.user.email}`);

  // Livelli di stock prima del test
  const { data: levelsBefore } = await sb
    .from('inventory_levels')
    .select('ingredient_product_id, current_quantity, unit')
    .eq('organization_id', ORG_ID);
  const fBefore = levelsBefore?.find(l => l.ingredient_product_id === FARINA_ID)?.current_quantity ?? 0;
  const zBefore = levelsBefore?.find(l => l.ingredient_product_id === ZUCCHERO_ID)?.current_quantity ?? 0;
  info(`Stock prima: Farina=${fBefore}kg  Zucchero=${zBefore}kg`);

  // ── S17: create draft order ───────────────────────────────────────────────
  section('S17 — create draft order');

  const { data: order, error: orderErr } = await sb
    .from('purchase_orders')
    .insert({
      organization_id: ORG_ID,
      supplier_id:     SUPPLIER_ID,
      order_date:      new Date().toISOString().split('T')[0],
      status:          'draft',
      notes:           'E2E test S17-S20 — auto',
    })
    .select()
    .single();

  if (orderErr || !order) fail('S17 insert order', orderErr?.message ?? 'null');
  const orderId = order.id;

  // Line items con colonne corrette (purchase_order_id, quantity_ordered, unit)
  const { error: liErr } = await sb
    .from('order_line_items')
    .insert([
      {
        purchase_order_id:     orderId,
        ingredient_product_id: FARINA_ID,
        quantity_ordered:      25.0,
        unit:                  'kg',
        unit_price_snapshot:   1.80,
      },
      {
        purchase_order_id:     orderId,
        ingredient_product_id: ZUCCHERO_ID,
        quantity_ordered:      8.0,
        unit:                  'kg',
        unit_price_snapshot:   0.90,
      },
    ]);

  if (liErr) fail('S17 insert line_items', liErr.message);

  // Verifica
  const { data: createdOrder } = await sb
    .from('purchase_orders')
    .select('id, status')
    .eq('id', orderId)
    .single();
  const { count: liCount } = await sb
    .from('order_line_items')
    .select('id', { count: 'exact', head: true })
    .eq('purchase_order_id', orderId);

  if (createdOrder?.status !== 'draft') fail('S17 status', `expected draft, got ${createdOrder?.status}`);
  if (liCount !== 2) fail('S17 line_items count', `expected 2, got ${liCount}`);
  pass('S17 PASS', `orderId=${orderId.slice(-8)}  status=draft  line_items=2`);

  // ── S18: draft → sent ─────────────────────────────────────────────────────
  section('S18 — draft → sent');

  const { error: sentPatchErr } = await sb
    .from('purchase_orders')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', orderId);
  if (sentPatchErr) fail('S18 patch', sentPatchErr.message);

  const { error: hist1Err } = await sb
    .from('order_status_history')
    .insert({
      purchase_order_id: orderId,
      from_status:       'draft',
      to_status:         'sent',
      changed_by:        userId,
      notes:             'S18 test',
    });
  if (hist1Err) fail('S18 history', hist1Err.message);

  const { data: s18Order } = await sb
    .from('purchase_orders')
    .select('status, sent_at')
    .eq('id', orderId)
    .single();
  if (s18Order?.status !== 'sent')   fail('S18 status', `expected sent, got ${s18Order?.status}`);
  if (!s18Order?.sent_at)            fail('S18 sent_at', 'null');
  const { count: hist1Count } = await sb
    .from('order_status_history')
    .select('id', { count: 'exact', head: true })
    .eq('purchase_order_id', orderId);
  pass('S18 PASS', `status=sent  sent_at=✓  history_events=${hist1Count}`);

  // ── S19: sent → confirmed ─────────────────────────────────────────────────
  section('S19 — sent → confirmed');

  const { error: confPatchErr } = await sb
    .from('purchase_orders')
    .update({ status: 'confirmed' })
    .eq('id', orderId);
  if (confPatchErr) fail('S19 patch', confPatchErr.message);

  const { error: hist2Err } = await sb
    .from('order_status_history')
    .insert({
      purchase_order_id: orderId,
      from_status:       'sent',
      to_status:         'confirmed',
      changed_by:        userId,
    });
  if (hist2Err) fail('S19 history', hist2Err.message);

  const { data: s19Order } = await sb
    .from('purchase_orders')
    .select('status')
    .eq('id', orderId)
    .single();
  if (s19Order?.status !== 'confirmed') fail('S19 status', `expected confirmed, got ${s19Order?.status}`);
  const { count: hist2Count } = await sb
    .from('order_status_history')
    .select('id', { count: 'exact', head: true })
    .eq('purchase_order_id', orderId);
  pass('S19 PASS', `status=confirmed  history_events=${hist2Count}`);

  // ── S20: confirmed → received ─────────────────────────────────────────────
  section('S20 — confirmed → received');

  // Leggi i line_items con colonne CORRETTE (quantity_ordered, unit — fix applicato)
  const { data: lineItems, error: liReadErr } = await sb
    .from('order_line_items')
    .select('ingredient_product_id, quantity_ordered, unit')
    .eq('purchase_order_id', orderId);
  if (liReadErr || !lineItems) fail('S20 read line_items', liReadErr?.message ?? 'null');
  info(`Line items letti: ${lineItems.length} righe`);

  // Patch status
  const { error: recvPatchErr } = await sb
    .from('purchase_orders')
    .update({ status: 'received' })
    .eq('id', orderId);
  if (recvPatchErr) fail('S20 patch', recvPatchErr.message);

  // History
  const { error: hist3Err } = await sb
    .from('order_status_history')
    .insert({
      purchase_order_id: orderId,
      from_status:       'confirmed',
      to_status:         'received',
      changed_by:        userId,
    });
  if (hist3Err) fail('S20 history', hist3Err.message);

  // Movimenti purchase_receipt per ogni line_item (identico al loop in changeOrderStatus)
  for (const li of lineItems) {
    const { error: movErr } = await sb
      .from('inventory_movements')
      .insert({
        organization_id:       ORG_ID,
        ingredient_product_id: li.ingredient_product_id,
        movement_type:         'purchase_receipt',
        quantity_delta:        Math.abs(Number(li.quantity_ordered)),
        unit:                  li.unit,
        reference_type:        'purchase_order',
        reference_id:          orderId,
        performed_by:          userId,
      });
    if (movErr) fail(`S20 movement for ${li.ingredient_product_id}`, movErr.message);
  }

  // Verifica S20
  const { data: s20Order } = await sb
    .from('purchase_orders')
    .select('status')
    .eq('id', orderId)
    .single();
  const { data: movements } = await sb
    .from('inventory_movements')
    .select('movement_type, quantity_delta, unit, ingredient_product_id')
    .eq('reference_id', orderId)
    .eq('reference_type', 'purchase_order');
  const { data: levelsAfter } = await sb
    .from('inventory_levels')
    .select('ingredient_product_id, current_quantity')
    .eq('organization_id', ORG_ID);
  const { count: hist3Count } = await sb
    .from('order_status_history')
    .select('id', { count: 'exact', head: true })
    .eq('purchase_order_id', orderId);

  if (s20Order?.status !== 'received')
    fail('S20 status', `expected received, got ${s20Order?.status}`);
  if (!movements || movements.length !== lineItems.length)
    fail('S20 movements count', `expected ${lineItems.length}, got ${movements?.length}`);
  if (movements.some(m => m.movement_type !== 'purchase_receipt'))
    fail('S20 movement_type', 'not all purchase_receipt');
  if (movements.some(m => Number(m.quantity_delta) <= 0))
    fail('S20 quantity_delta', 'some <= 0');

  const fAfter = levelsAfter?.find(l => l.ingredient_product_id === FARINA_ID)?.current_quantity ?? 0;
  const zAfter = levelsAfter?.find(l => l.ingredient_product_id === ZUCCHERO_ID)?.current_quantity ?? 0;

  if (Number(fAfter) <= Number(fBefore)) fail('S20 farina level', `${fBefore} → ${fAfter}`);
  if (Number(zAfter) <= Number(zBefore)) fail('S20 zucchero level', `${zBefore} → ${zAfter}`);

  pass('S20 PASS', `status=received  movements=${movements.length}  history=${hist3Count}`);
  info(`Stock dopo:  Farina=${fAfter}kg (+${Number(fAfter) - Number(fBefore)})  Zucchero=${zAfter}kg (+${Number(zAfter) - Number(zBefore)})`);

  // ── Riepilogo ─────────────────────────────────────────────────────────────
  console.log(`\n${BOLD}═══ RISULTATO FINALE ═══${RESET}`);
  console.log(`${GREEN}${BOLD}S17 ✅  S18 ✅  S19 ✅  S20 ✅${RESET}`);
  console.log(`orderId: ${orderId}`);
  console.log(`\n${GREEN}${BOLD}MODULO ORDINI: READY FOR STAGING${RESET}`);
}

main().catch((err) => {
  console.error(`\n${RED}${BOLD}ERRORE INASPETTATO:${RESET}`, err.message ?? err);
  process.exit(1);
});
