-- tenant_coherence.sql — read-only. Righe storiche che violano la coerenza tenant
-- introdotta dalla 059 (attese: 0 righe). Da eseguire prima/dopo il rollout.
select 'receipt→order' as kind, r.id as receipt_id, r.organization_id, po.organization_id as other_org
from purchase_receipts r join purchase_orders po on po.id = r.purchase_order_id
where po.organization_id <> r.organization_id
union all
select 'receipt→supplier', r.id, r.organization_id, s.organization_id
from purchase_receipts r join suppliers s on s.id = r.supplier_id
where s.organization_id <> r.organization_id
union all
select 'receipt_line→product', l.id, r.organization_id, p.organization_id
from purchase_receipt_lines l
join purchase_receipts r on r.id = l.receipt_id
join ingredient_products p on p.id = l.product_id
where p.organization_id <> r.organization_id;
