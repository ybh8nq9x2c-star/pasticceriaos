// =============================================================================
// Fixture realistica: 50 ricette di pasticceria in formati DISORDINATI (text e
// CSV), per provare la COPERTURA dell'import (baseline deterministico = 50).
// Generata in modo deterministico ma con formattazione volutamente eterogenea:
// titoli con/ senza resa, quantità "400 g" / "q.b." / "2 uova" / "Farina: 250 g"
// / "½ l", unità sinonime, righe qty-less. Nessuna AI, nessun DB.
// =============================================================================

const NAMES = [
  'Tiramisù', 'Cannoli Siciliani', 'Sfogliatella Riccia', 'Babà al Rum', 'Crostata di Albicocche',
  'Pastiera Napoletana', 'Maritozzo con Panna', 'Zeppole di San Giuseppe', 'Torta Caprese', 'Cassata Siciliana',
  'Bignè alla Crema', 'Millefoglie', 'Crème Caramel', 'Panna Cotta', 'Bavarese ai Frutti di Bosco',
  'Torta della Nonna', 'Saint Honoré', 'Profiteroles', 'Cheesecake ai Lamponi', 'Tiramisù alle Fragole',
  'Crostata di Ricotta', 'Strudel di Mele', 'Torta Sacher', 'Mousse al Cioccolato', 'Semifreddo al Pistacchio',
  'Plumcake allo Yogurt', 'Ciambellone', 'Muffin ai Mirtilli', 'Brownies', 'Cookies alle Gocce',
  'Madeleine', 'Macaron al Lampone', 'Éclair al Caffè', 'Charlotte alle Pere', 'Zuppa Inglese',
  'Delizia al Limone', 'Torta Mimosa', 'Pan di Spagna', 'Pasta Frolla', 'Crema Pasticcera',
  'Bocconotti', 'Cantucci', 'Amaretti Morbidi', 'Baci di Dama', 'Brutti ma Buoni',
  'Castagnole', 'Chiacchiere', 'Frittelle di Mele', 'Torta Paradiso', 'Crostata Nutella',
];

// Pool di righe ingrediente in formati misti — alcune qty-less, unità sinonime.
const ING_VARIANTS = [
  (n: number) => `${250 + n} g farina 00`,
  (n: number) => `Zucchero semolato: ${100 + n} g`,
  (_n: number) => `3 uova`,
  (_n: number) => `1 bustina di vanillina`,
  (n: number) => `${200 + n} gr burro`,
  (_n: number) => `½ l latte intero`,
  (_n: number) => `sale q.b.`,
  (n: number) => `Cioccolato fondente ${80 + n}g`,
  (_n: number) => `2 cucchiai di miele`,
  (n: number) => `Panna fresca - ${250 + n} ml`,
];

/** 4 righe ingrediente deterministiche ma variabili per ricetta i. */
function ingredientsFor(i: number): string[] {
  const out: string[] = [];
  for (let k = 0; k < 4; k++) {
    const v = ING_VARIANTS[(i + k) % ING_VARIANTS.length];
    out.push(v(i + k));
  }
  return out;
}

/** TEXT: 50 blocchi separati da riga vuota. Titolo + (a volte) header + lista. */
export const TEXT_50: string = NAMES.map((name, i) => {
  const title = i % 3 === 0 ? `${name} (${4 + (i % 8)} porzioni)` : name;
  const header = i % 2 === 0 ? 'Ingredienti:' : '';
  const body = ingredientsFor(i).join('\n');
  return [title, header, body].filter(Boolean).join('\n');
}).join('\n\n');

/** CSV: una riga per ingrediente, raggruppate per colonna Ricetta. */
export const CSV_50: string = (() => {
  const rows = ['Ricetta,Ingrediente,Quantità,Unità,Porzioni'];
  NAMES.forEach((name, i) => {
    const ings = [
      ['Farina 00', String(250 + i), 'g'],
      ['Zucchero', String(100 + i), 'g'],
      ['Uova', '3', 'pz'],
      ['Burro', String(80 + i), 'g'],
    ];
    ings.forEach((ing, k) => {
      const portions = k === 0 ? String(4 + (i % 8)) : '';
      rows.push(`${name},${ing[0]},${ing[1]},${ing[2]},${portions}`);
    });
  });
  return rows.join('\n');
})();

export const EXPECTED_RECIPE_COUNT = NAMES.length; // 50
export { NAMES as RECIPE_NAMES_50 };
