// =============================================================================
// e2e/helpers/dataset.ts
// Dataset realistico e coerente per la giornata operativa simulata.
// Niente dati mock casuali: nomi, unità, prezzi e quantità da laboratorio
// artigianale reale (giugno 2026). I nomi tra catalogo fornitore e anagrafica
// pasticceria COINCIDONO di proposito (match case-insensitive in
// receive_marketplace_order); l'unico mismatch voluto è in FASE G.
// =============================================================================

export interface IngredientSeed {
  name: string;
  unit: 'g' | 'kg' | 'ml' | 'l' | 'pz' | 'bustina' | 'foglio';
  sku?: string;
  unitPrice: string; // come digitato nel form (virgola decimale)
  notes?: string;
}

/** Anagrafica ingredienti della pasticceria (FASE A). */
export const BAKERY_INGREDIENTS: IngredientSeed[] = [
  { name: 'Burro 82% m.g.',          unit: 'kg', sku: 'BUR-82',  unitPrice: '8,90' },
  { name: 'Zucchero semolato',       unit: 'kg', sku: 'ZUC-SEM', unitPrice: '1,10' },
  { name: 'Zucchero a velo',         unit: 'kg', sku: 'ZUC-VEL', unitPrice: '1,65' },
  { name: 'Uova fresche cat. A',     unit: 'pz', sku: 'UOV-A',   unitPrice: '0,28' },
  { name: 'Latte intero fresco',     unit: 'l',  sku: 'LAT-INT', unitPrice: '1,15' },
  { name: 'Panna fresca 35%',        unit: 'l',  sku: 'PAN-35',  unitPrice: '4,20' },
  { name: 'Cioccolato fondente 70%', unit: 'kg', sku: 'CIO-70',  unitPrice: '12,50' },
  { name: 'Mascarpone',              unit: 'kg', sku: 'MAS-01',  unitPrice: '7,80' },
  { name: 'Savoiardi',               unit: 'kg', sku: 'SAV-01',  unitPrice: '6,50' },
  { name: 'Caffè espresso',          unit: 'l',  sku: 'CAF-ESP', unitPrice: '2,50' },
  { name: 'Lievito di birra fresco', unit: 'g',  sku: 'LIE-BIR', unitPrice: '0,01' },
  { name: 'Sale fino',               unit: 'kg', sku: 'SAL-FIN', unitPrice: '0,45' },
  { name: 'Cacao amaro in polvere',  unit: 'kg', sku: 'CAC-AM',  unitPrice: '9,80' },
  { name: 'Vaniglia in bacche',      unit: 'pz', sku: 'VAN-BAC', unitPrice: '2,20' },
];

export interface RecipeSeed {
  name: string;
  emoji: string;
  category: string;
  basePortions: number;
  sellPrice: string;
  notes?: string;
  // quantità riferite all'unità dell'ingrediente in anagrafica
  ingredients: { name: string; quantity: string; unit: IngredientSeed['unit'] }[];
}

/** "Libro ricette" del laboratorio (FASE A). L'app non ha import massivo:
 *  caricamento manuale di più ricette coerenti (gap di prodotto documentato). */
export const RECIPES: RecipeSeed[] = [
  {
    name: 'Croissant classico',
    emoji: '🥐',
    category: 'Colazione',
    basePortions: 20,
    sellPrice: '1,30',
    notes: 'Sfoglia 3 pieghe da 3. Riposo impasto 12h a +4°C.',
    ingredients: [
      { name: 'farina 00',               quantity: '1',    unit: 'kg' },
      { name: 'Burro 82% m.g.',          quantity: '0,5',  unit: 'kg' },
      { name: 'Zucchero semolato',       quantity: '0,12', unit: 'kg' },
      { name: 'Latte intero fresco',     quantity: '0,25', unit: 'l'  },
      { name: 'Lievito di birra fresco', quantity: '40',   unit: 'g'  },
      { name: 'Sale fino',               quantity: '0,02', unit: 'kg' },
      { name: 'Uova fresche cat. A',     quantity: '2',    unit: 'pz' },
    ],
  },
  {
    name: 'Tiramisù classico',
    emoji: '🍮',
    category: 'Dolci al cucchiaio',
    basePortions: 8,
    sellPrice: '4,50',
    notes: 'Vaschette da 8. Caffè moka raffreddato, no liquore.',
    ingredients: [
      { name: 'Mascarpone',          quantity: '0,5',  unit: 'kg' },
      { name: 'Uova fresche cat. A', quantity: '6',    unit: 'pz' },
      { name: 'Zucchero semolato',   quantity: '0,15', unit: 'kg' },
      { name: 'Savoiardi',           quantity: '0,3',  unit: 'kg' },
      { name: 'Caffè espresso',      quantity: '0,3',  unit: 'l'  },
      { name: 'Cacao amaro in polvere', quantity: '0,02', unit: 'kg' },
    ],
  },
  {
    name: 'Torta al cioccolato',
    emoji: '🎂',
    category: 'Torte',
    basePortions: 12,
    sellPrice: '3,80',
    notes: 'Stampo Ø24. Cottura 35min a 170°C.',
    ingredients: [
      { name: 'Cioccolato fondente 70%', quantity: '0,25', unit: 'kg' },
      { name: 'Burro 82% m.g.',          quantity: '0,2',  unit: 'kg' },
      { name: 'Uova fresche cat. A',     quantity: '5',    unit: 'pz' },
      { name: 'Zucchero semolato',       quantity: '0,25', unit: 'kg' },
      { name: 'farina 00',               quantity: '0,15', unit: 'kg' },
      { name: 'Cacao amaro in polvere',  quantity: '0,03', unit: 'kg' },
    ],
  },
  {
    name: 'Pasta frolla base',
    emoji: '🥧',
    category: 'Basi',
    basePortions: 10,
    sellPrice: '',
    notes: 'Base per crostate. Metodo sabbiato, riposo 2h.',
    ingredients: [
      { name: 'farina 00',           quantity: '0,5',   unit: 'kg' },
      { name: 'Burro 82% m.g.',      quantity: '0,3',   unit: 'kg' },
      { name: 'Zucchero a velo',     quantity: '0,2',   unit: 'kg' },
      { name: 'Uova fresche cat. A', quantity: '2',     unit: 'pz' },
      { name: 'Vaniglia in bacche',  quantity: '1',     unit: 'pz' },
      { name: 'Sale fino',           quantity: '0,005', unit: 'kg' },
    ],
  },
];

/** Catalogo del fornitore (FASE C-prep, lato supplier). Prezzi all'ingrosso. */
export const SUPPLIER_CATALOG: { name: string; sku: string; unit: IngredientSeed['unit']; price: string }[] = [
  { name: 'farina 00',               sku: 'FAR-00-25', unit: 'kg', price: '0,98' },
  { name: 'Burro 82% m.g.',          sku: 'BUR-82',    unit: 'kg', price: '8,40' },
  { name: 'Zucchero semolato',       sku: 'ZUC-SEM',   unit: 'kg', price: '0,89' },
  { name: 'Uova fresche cat. A',     sku: 'UOV-A-180', unit: 'pz', price: '0,22' },
  { name: 'Latte intero fresco',     sku: 'LAT-INT',   unit: 'l',  price: '0,95' },
  { name: 'Panna fresca 35%',        sku: 'PAN-35',    unit: 'l',  price: '3,60' },
  { name: 'Cioccolato fondente 70%', sku: 'CIO-70',    unit: 'kg', price: '11,20' },
  { name: 'Mascarpone',              sku: 'MAS-2KG',   unit: 'kg', price: '6,90' },
  { name: 'Savoiardi',               sku: 'SAV-CT',    unit: 'kg', price: '5,80' },
  { name: 'Cacao amaro in polvere',  sku: 'CAC-2224',  unit: 'kg', price: '8,90' },
];

/** Piano produzione di domani (FASE B): sabato tipo di un laboratorio. */
export const PRODUCTION_PLAN = [
  { recipe: 'Croissant classico',  batches: 3 }, // 60 pz banco
  { recipe: 'Tiramisù classico',   batches: 2 }, // 16 porzioni
  { recipe: 'Torta al cioccolato', batches: 1 }, // 12 fette
];

/** Ordine marketplace alla connessione fornitore (FASE B), quantità da
 *  riordino realistico (sacchi/cartoni, non lo shortage esatto al grammo). */
export const MARKETPLACE_ORDER_QTY: Record<string, string> = {
  'farina 00': '25',
  'Burro 82% m.g.': '6',
  'Zucchero semolato': '10',
  'Uova fresche cat. A': '180',
  'Mascarpone': '3',
  'Savoiardi': '2',
  'Cacao amaro in polvere': '2',
  'Cioccolato fondente 70%': '3',
};

export const ORDER_NOTE =
  'Consegna entro venerdì mattina ore 7. Citofono laboratorio, ingresso via retro.';
