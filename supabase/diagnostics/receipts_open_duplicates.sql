-- receipts_open_duplicates.sql — read-only. Ordini con più di un ricevimento
-- aperto (draft/expected/partial). Atteso: 0 righe. Se > 0 la 061 non crea
-- l'indice unico: chiudere/annullare i doppioni e ricreare l'indice a mano.
select purchase_order_id, count(*) as aperti, array_agg(id order by created_at) as receipt_ids
from purchase_receipts
where purchase_order_id is not null and status in ('draft', 'expected', 'partial')
group by purchase_order_id
having count(*) > 1;
