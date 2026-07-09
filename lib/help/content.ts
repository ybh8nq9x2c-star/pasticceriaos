// =============================================================================
// lib/help/content.ts — contenuto HELP operativo (dati puri, niente I/O).
// Organizzato per COMPITO reale dell'operatore, non per struttura tecnica.
// Tono: concreto, breve dove serve, mai marketing. La verità del sistema
// (due magazzini, ledger, produzione = momento contabile) è il filo rosso.
// Usato da: HelpDrawer (contestuale), /help (guida centrale), route→articolo.
// =============================================================================

export type HelpBlockKind =
  | 'when'        // Quando usare questa schermata
  | 'what'        // Cosa fai qui
  | 'system'      // Cosa succede nel sistema
  | 'see'         // Cosa vedere subito
  | 'mistakes'    // Errori comuni
  | 'never'       // Cosa NON fare
  | 'ifthen'      // Se succede questo, fai questo
  | 'links';      // Collegamenti utili

export interface HelpBlock {
  kind: HelpBlockKind;
  /** Righe brevi; ognuna una cosa sola. Per 'ifthen' e 'links' usa il campo pairs. */
  lines?: string[];
  pairs?: { label: string; href?: string }[];
}

export interface HelpArticle {
  id: string;
  /** Titolo da compito ("Ricevi una consegna"), non da schermata. */
  title: string;
  /** Una riga: la cosa più importante da sapere qui. */
  lede: string;
  blocks: HelpBlock[];
}

export interface HelpSection {
  id: string;
  title: string;
  /** Ordine = flusso della giornata. */
  articleIds: string[];
}

// ── Articoli ──────────────────────────────────────────────────────────────────

export const HELP_ARTICLES: Record<string, HelpArticle> = {
  today: {
    id: 'today',
    title: 'Inizia la giornata',
    lede: 'Apri "Oggi": ti dice cosa fare adesso, in ordine di urgenza. Parti da qui ogni mattina.',
    blocks: [
      { kind: 'what', lines: [
        'Guardi la giornata in una schermata: cosa produrre, cosa manca, cosa richiede attenzione.',
        'Su telefono, "Da fare adesso" mostra al massimo 2 cose: falle prima di tutto.',
      ] },
      { kind: 'see', lines: [
        '"Richiede attenzione" è già in ordine di gravità: parti dall\'alto.',
        'Rosso = oggi. Ambra = in giornata. Il colore dice sempre la stessa cosa in tutta l\'app.',
      ] },
      { kind: 'ifthen', pairs: [
        { label: 'C\'è "1 piano da confermare" → confermalo PRIMA di fare il piano di oggi' },
        { label: 'C\'è "riceviment* non contabilizzat*" → aprilo e completalo: il magazzino non è aggiornato' },
        { label: 'La sera compare "Chiudi la giornata" → seguila: chiude produzione, invenduto, ricevimenti, POS' },
      ] },
      { kind: 'never', lines: [
        'Non ignorare un rosso ritentando altro: quel rosso è la cosa che conta.',
      ] },
      { kind: 'links', pairs: [
        { label: 'Pianifica e conferma la produzione', href: '/help/produzione' },
        { label: 'Chiudi la giornata', href: '/help/chiusura' },
      ] },
    ],
  },

  production: {
    id: 'production',
    title: 'Pianifica e conferma la produzione',
    lede: '"Completa produzione" è il momento contabile: scala gli ingredienti e carica i prodotti finiti. Finché non confermi, il magazzino non sa niente.',
    blocks: [
      { kind: 'what', lines: [
        'Crei il piano del giorno (quali ricette, quante infornate). Il fabbisogno si calcola da solo.',
        'A produzione finita premi "Conferma produzione eseguita".',
      ] },
      { kind: 'system', lines: [
        'Alla conferma: gli ingredienti usati scendono dal magazzino materie prime, i pezzi prodotti salgono nel banco (prodotti finiti).',
        'È l\'unico momento in cui la produzione tocca il magazzino. Non c\'è auto-conferma: decidi tu.',
      ] },
      { kind: 'see', lines: [
        'Il riquadro fabbisogno: rosso/ambra = non ti basta. "Ordina →" crea la bozza già pronta.',
        'Prima di confermare compare il riepilogo: quanti pezzi a banco, quanti ingredienti scalati.',
      ] },
      { kind: 'mistakes', lines: [
        'Dimenticare di confermare: il piano resta "da confermare" e i numeri di domani mentono.',
        'Confermare al buio numeri diversi da quelli prodotti davvero.',
      ] },
      { kind: 'ifthen', pairs: [
        { label: 'Le infornate reali sono diverse dal piano → correggi le quantità nel piano, poi conferma' },
        { label: 'Hai prodotto qualcosa fuori piano → usa "Produzione veloce"' },
        { label: 'Un ingrediente ha unità strana e viene saltato → controlla di non aver saltato un ricevimento' },
      ] },
      { kind: 'never', lines: [
        'Non registrare il consumo ingredienti a mano dal magazzino: ci pensa la conferma produzione.',
      ] },
      { kind: 'links', pairs: [
        { label: 'Controlla stock e correggi numeri', href: '/help/magazzino' },
        { label: 'Ordina le materie prime', href: '/help/ordini-fornitore' },
      ] },
    ],
  },

  receiving: {
    id: 'receiving',
    title: 'Ricevi una consegna',
    lede: 'Il ricevimento è l\'unico ingresso vero a magazzino per le materie prime. Se non lo completi, la merce non esiste per il sistema.',
    blocks: [
      { kind: 'when', lines: ['Quando arriva il corriere con le materie prime.'] },
      { kind: 'what', lines: [
        'Apri il ricevimento atteso dall\'ordine (o creane uno), scansiona i colli, sistema le righe.',
        '"Ricevuto tutto" in un tap se è arrivato tutto; altrimenti correggi le quantità.',
      ] },
      { kind: 'system', lines: [
        'Al completamento la merce entra a magazzino materie prime; lotto e scadenza vengono registrati.',
        'Ricevere due volte NON raddoppia: il sistema conta solo la differenza non ancora registrata.',
      ] },
      { kind: 'see', lines: [
        'Righe gialle "da collegare": manca il prodotto → scegli dal catalogo o crealo al volo.',
        'La barra in basso avvisa "il magazzino non è ancora aggiornato" finché non completi.',
      ] },
      { kind: 'mistakes', lines: [
        'Premere "Nuovo" invece di riprendere il ricevimento già aperto per quell\'ordine.',
        'Lasciare un ricevimento aperto a fine giornata: la merce risulta non arrivata.',
      ] },
      { kind: 'ifthen', pairs: [
        { label: 'Unità della riga incompatibile col prodotto → l\'app blocca: correggi l\'unità, non forzare' },
        { label: 'Arrivato solo in parte → completa quello che c\'è: il resto resta aperto per la prossima consegna' },
        { label: 'Un codice non è riconosciuto → associalo: il barcode viene imparato per le volte dopo' },
      ] },
      { kind: 'never', lines: [
        'Non usare "Registra movimento → Acquisto ricevuto" per una consegna vera: passa da Ricevimenti (lotti, ordine, documento).',
      ] },
      { kind: 'links', pairs: [
        { label: 'Gestisci lotti e scadenze', href: '/help/scadenze' },
        { label: 'Ordina le materie prime', href: '/help/ordini-fornitore' },
      ] },
    ],
  },

  'stock-adjust': {
    id: 'stock-adjust',
    title: 'Correggi lo stock (rettifica)',
    lede: 'I livelli non si modificano a mano: registri un movimento di rettifica con un motivo. Così resta la storia.',
    blocks: [
      { kind: 'when', lines: [
        'Quando il conteggio fisico è diverso dal sistema, o hai sbagliato una registrazione.',
      ] },
      { kind: 'what', lines: [
        '"Aggiungi / Togli" se pensi in differenza ("ho messo +2 kg").',
        '"Conteggio" se pensi al totale reale ("adesso ce ne sono 4"): il sistema calcola la differenza.',
      ] },
      { kind: 'system', lines: [
        'Registra un movimento tracciato: la giacenza si ricalcola da sé. Niente viene riscritto, si aggiunge.',
      ] },
      { kind: 'mistakes', lines: [
        'Rettificare senza motivo: la nota è lì apposta, serve a ricostruire cosa è successo.',
        'Usare la rettifica per correggere un ricevimento sbagliato: se è ancora aperto, correggi lì.',
      ] },
      { kind: 'never', lines: [
        'Non "sistemare" un numero rosso a caso per farlo sparire: prima capisci perché è rosso.',
      ] },
      { kind: 'ifthen', pairs: [
        { label: 'Stock "sotto zero" → hai registrato più consumo che carichi: di solito manca un ricevimento' },
      ] },
      { kind: 'links', pairs: [
        { label: 'Capire i numeri del magazzino', href: '/help/magazzino' },
      ] },
    ],
  },

  expiry: {
    id: 'expiry',
    title: 'Lotti e scadenze',
    lede: 'I lotti nascono alla ricezione. Qui vedi cosa scade prima e cosa è già scaduto, con le ricette per smaltirlo.',
    blocks: [
      { kind: 'see', lines: [
        'SCADUTO (rosso pieno) = già oltre la data: da controllare/smaltire, non da usare.',
        '"scade oggi" / "scade domani" / "N giorni": usali in ordine, prima quelli che scadono prima (FEFO).',
      ] },
      { kind: 'system', lines: [
        'La produzione consuma i lotti più vecchi per primi. La lista qui è la tua guida allo smaltimento.',
      ] },
      { kind: 'mistakes', lines: [
        'Confondere "già scaduto" con "in scadenza": sono cose diverse, l\'app te le mostra separate.',
      ] },
      { kind: 'ifthen', pairs: [
        { label: 'Un lotto è scaduto e l\'hai buttato → registra la giacenza corretta dalla scheda ingrediente' },
        { label: 'Ricevi ogni mattina lo stesso alert → smaltisci o usa quel lotto, l\'avviso sparisce da solo' },
      ] },
      { kind: 'links', pairs: [
        { label: 'Correggi lo stock dopo lo smaltimento', href: '/help/rettifica' },
      ] },
    ],
  },

  sales: {
    id: 'sales',
    title: 'Vendi e gestisci la cassa (POS)',
    lede: 'La vendita scala solo i prodotti finiti (il banco), mai le materie prime. Un prodotto non collegato viene registrato ma non scala niente.',
    blocks: [
      { kind: 'what', lines: [
        'Con il POS collegato gli scontrini entrano da soli. Vendite fuori cassa: "Registra vendita".',
        'La card della cassa dice sempre se funziona e qual è l\'unica cosa da fare adesso.',
      ] },
      { kind: 'system', lines: [
        'Ogni riga collegata a una ricetta abbassa il banco di quel prodotto. Le materie prime non si toccano: le ha già consumate la produzione.',
        'Un reso/annullo rimette a banco i pezzi. Niente viene cancellato dalla storia.',
      ] },
      { kind: 'see', lines: [
        '"Da collegare" = prodotto della cassa senza ricetta: le sue vendite non scalano finché non lo colleghi.',
        '"Falliti" nell\'inbox = scontrini interi non registrati: vanno riprovati.',
      ] },
      { kind: 'ifthen', pairs: [
        { label: 'Prodotto nuovo "da collegare" → collegalo nel wizard POS: le vendite passate si sistemano da sole' },
        { label: 'Scontrini falliti → aprili nell\'inbox e premi Riprova' },
        { label: 'Ritiro di una torta prenotata → segna "Consegnato" E registra la vendita, altrimenti il banco non scende' },
      ] },
      { kind: 'never', lines: [
        'Non registrare l\'invenduto dei dolci come scarico ingredienti: sono due magazzini diversi.',
      ] },
      { kind: 'links', pairs: [
        { label: 'Ordini cliente e ritiri', href: '/help/ordini-cliente' },
        { label: 'Chiudi la giornata', href: '/help/chiusura' },
      ] },
    ],
  },

  'customer-orders': {
    id: 'customer-orders',
    title: 'Ordini cliente e ritiri',
    lede: 'Le prenotazioni guidano la produzione. Al ritiro, "Consegnato" segna il ritiro e propone la vendita che scala il banco.',
    blocks: [
      { kind: 'what', lines: [
        'Registri chi ritira cosa e quando. La prenotazione compare da sola nel piano del giorno giusto.',
      ] },
      { kind: 'system', lines: [
        'L\'ordine cliente NON muove magazzino: serve a pianificare. Il banco scende solo quando registri la vendita.',
      ] },
      { kind: 'ifthen', pairs: [
        { label: 'La cliente ritira → "Consegnato · registra vendita": conferma la vendita precompilata' },
        { label: 'Non devi registrare la vendita (es. omaggio) → premi Annulla: il "consegnato" resta comunque' },
      ] },
      { kind: 'links', pairs: [
        { label: 'Vendite e cassa', href: '/help/vendite' },
        { label: 'Pianifica la produzione', href: '/help/produzione' },
      ] },
    ],
  },

  'supplier-orders': {
    id: 'supplier-orders',
    title: 'Ordina le materie prime',
    lede: 'Ordini ai fornitori con esito onesto: se l\'email non parte, l\'ordine non finge di essere inviato.',
    blocks: [
      { kind: 'what', lines: [
        'Parti da un ingrediente sotto soglia ("Ordina") o crea l\'ordine. La quantità suggerita è già pronta.',
        'Dal magazzino, "Ordina tutti i mancanti" crea una bozza per ogni fornitore.',
      ] },
      { kind: 'system', lines: [
        'L\'ordine passa "inviato" solo se parte davvero. La merce entra a magazzino con il Ricevimento, non con l\'ordine.',
      ] },
      { kind: 'ifthen', pairs: [
        { label: 'Un ingrediente non entra nel riordino automatico → assegnagli un fornitore dalla sua scheda' },
        { label: 'Arriva la consegna → "Ricevuto" dall\'ordine, oppure apri Ricevimenti' },
      ] },
      { kind: 'links', pairs: [
        { label: 'Ricevi la consegna', href: '/help/ricevimenti' },
      ] },
    ],
  },

  inventory: {
    id: 'inventory',
    title: 'Capire il magazzino',
    lede: 'Il magazzino è la somma dei movimenti, non un numero che si modifica. Ci sono due magazzini distinti: materie prime e prodotti finiti.',
    blocks: [
      { kind: 'see', lines: [
        'Le giacenze sono mostrate a eccezioni: dove agire (sotto zero → conta; sotto soglia → ordina).',
        'La soglia minima è ciò che fa scattare gli avvisi: senza soglia, niente alert.',
      ] },
      { kind: 'system', lines: [
        'Materie prime: entrano con la ricezione, escono con la produzione.',
        'Prodotti finiti: entrano con la produzione confermata, escono con la vendita.',
      ] },
      { kind: 'never', lines: [
        'Non cercare di scrivere la giacenza direttamente: si corregge sempre con una rettifica tracciata.',
      ] },
      { kind: 'links', pairs: [
        { label: 'Correggi lo stock', href: '/help/rettifica' },
        { label: 'Lotti e scadenze', href: '/help/scadenze' },
      ] },
    ],
  },

  'close-day': {
    id: 'close-day',
    title: 'Chiudi la giornata',
    lede: 'La sera "Oggi" ti guida a chiudere: produzione, invenduto, ricevimenti, cassa. Due minuti perché i numeri di domani siano veri.',
    blocks: [
      { kind: 'ifthen', pairs: [
        { label: 'Produzione da confermare → confermala col riepilogo' },
        { label: 'Invenduto sul banco → "Registra invenduto" (quantità già pronta)' },
        { label: 'Ricevimenti ancora aperti → chiudili' },
        { label: 'Cassa con problemi → collega i prodotti o riprova gli scontrini falliti' },
      ] },
      { kind: 'ifthen', pairs: [
        { label: 'Rimanenza NEGATIVA → hai venduto più del prodotto registrato: manca una produzione veloce o un prodotto è collegato alla ricetta sbagliata' },
      ] },
      { kind: 'links', pairs: [
        { label: 'Vendite e cassa', href: '/help/vendite' },
        { label: 'Conferma la produzione', href: '/help/produzione' },
      ] },
    ],
  },

  'fix-mistakes': {
    id: 'fix-mistakes',
    title: 'Correggi un errore senza fare danni',
    lede: 'Ogni correzione è un nuovo movimento, mai una cancellazione. Così la storia resta vera e i numeri tornano.',
    blocks: [
      { kind: 'ifthen', pairs: [
        { label: 'Ricevuto una quantità sbagliata (in più) → rettifica dall\'ingrediente, motivo "Correzione"' },
        { label: 'Ricevuto in meno → se il ricevimento è ancora aperto correggi lì e ricompleta: posta solo la differenza' },
        { label: 'Scontrino sbagliato/di prova → Storna dalla lista vendite: i pezzi tornano a banco' },
        { label: 'Prodotto collegato alla ricetta sbagliata → correggi la mappatura nel wizard POS' },
        { label: 'Produzione confermata con numeri sbagliati → correggi con rettifiche (il piano non si ri-conferma)' },
        { label: 'Conteggio diverso dal sistema → scheda ingrediente → "Conteggio" → il numero vero' },
      ] },
      { kind: 'never', lines: [
        'Non ritentare a raffica su un errore rosso del sistema (unità incompatibile, transizione non permessa): il messaggio dice cosa fare.',
      ] },
    ],
  },

  'alerts-colors': {
    id: 'alerts-colors',
    title: 'Capire gli alert e i colori',
    lede: 'Il colore dice sempre la stessa cosa in tutta l\'app. Impara questi cinque e non devi più chiederti cosa significano.',
    blocks: [
      { kind: 'see', lines: [
        'Rosso = anomalia o critico (esaurito, sotto zero, in perdita, fallito): oggi.',
        'Ambra = serve un\'azione (da confermare, da collegare, parziale, in scadenza): in giornata.',
        'Blu = informazione presa in carico: nessuna fretta.',
        'Verde = fatto / ok. Grigio = bozza / chiuso / annullato.',
      ] },
      { kind: 'ifthen', pairs: [
        { label: 'Notifica "Riconciliazione magazzino" → il controllo notturno ha trovato numeri che non tornano: apri i movimenti dell\'ingrediente indicato' },
        { label: 'Silenzio la notte → i controlli sono passati (è un bene)' },
      ] },
    ],
  },
};

// ── Sezioni (IA per flusso di giornata) ───────────────────────────────────────

export const HELP_SECTIONS: HelpSection[] = [
  { id: 'giornata', title: 'La giornata', articleIds: ['today', 'close-day'] },
  { id: 'magazzino-flussi', title: 'Merce e magazzino', articleIds: ['receiving', 'inventory', 'stock-adjust', 'expiry'] },
  { id: 'produzione', title: 'Produzione', articleIds: ['production'] },
  { id: 'commerciale', title: 'Vendite e clienti', articleIds: ['sales', 'customer-orders'] },
  { id: 'acquisti', title: 'Acquisti', articleIds: ['supplier-orders'] },
  { id: 'sos', title: 'Quando qualcosa va storto', articleIds: ['fix-mistakes', 'alerts-colors'] },
];

// ── Slug leggibili per /help/[topic] (URL da mestiere, non id tecnici) ─────────

export const HELP_SLUGS: Record<string, string> = {
  today: 'oggi',
  production: 'produzione',
  receiving: 'ricevimenti',
  'stock-adjust': 'rettifica',
  expiry: 'scadenze',
  sales: 'vendite',
  'customer-orders': 'ordini-cliente',
  'supplier-orders': 'ordini-fornitore',
  inventory: 'magazzino',
  'close-day': 'chiusura',
  'fix-mistakes': 'correggi-errore',
  'alerts-colors': 'alert-colori',
};
const SLUG_TO_ID = Object.fromEntries(Object.entries(HELP_SLUGS).map(([id, slug]) => [slug, id]));

export function articleBySlug(slug: string): HelpArticle | null {
  const id = SLUG_TO_ID[slug];
  return id ? HELP_ARTICLES[id] ?? null : null;
}

export function slugForArticle(id: string): string {
  return HELP_SLUGS[id] ?? id;
}

// ── Route → articolo contestuale (per il drawer "Aiuto su questa schermata") ──
// Prefissi ordinati dal più specifico al più generico.

const ROUTE_HELP: [prefix: string, articleId: string][] = [
  ['/dashboard', 'today'],
  ['/production/new', 'production'],
  ['/production', 'production'],
  ['/receipts', 'receiving'],
  ['/supplier/receipts', 'receiving'],
  ['/inventory/batches', 'expiry'],
  ['/inventory/movement', 'stock-adjust'],
  ['/inventory', 'inventory'],
  ['/ingredients', 'inventory'],
  ['/sales/inbox', 'sales'],
  ['/sales/pos', 'sales'],
  ['/sales', 'sales'],
  ['/customers', 'customer-orders'],
  ['/orders', 'supplier-orders'],
  ['/marketplace', 'supplier-orders'],
];

/** Articolo più pertinente alla rotta corrente, o null (mostra la guida generale). */
export function routeToHelpId(pathname: string): string | null {
  for (const [prefix, id] of ROUTE_HELP) {
    if (pathname === prefix || pathname.startsWith(prefix + '/') || pathname.startsWith(prefix)) {
      return id;
    }
  }
  return null;
}
