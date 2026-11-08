/**
 * L'outil de modération de l'app Book Nova (lot C7), en page web, pour modérer depuis un ordinateur.
 *
 * Ce fichier est le portage de l'écran de l'app et de ses composants, au commit 2f343efc :
 * app/screens/ModerationScreen.tsx (l'enchaînement : décider, « Annuler », « Ce cas a changé »,
 * relire, recharger la liste d'origine), app/components/reviews/moderation/ (ModerationRow,
 * ModerationDetail, ModerationMoreSheet, ModerationStaleDialog) et
 * app/components/reviews/ModerationToast.tsx (le bandeau de 6 secondes). Chaque fonction porte le
 * nom de celle qu'elle reprend. _tools/sync-moderation-logic.mjs échoue si l'un de ces fichiers
 * change dans l'app (HAND_PORTED) : le portage est alors à relire.
 *
 * Les règles, elles, ne sont pas ici : les questions et réponses de chaque cas, l'« Annuler »,
 * l'horloge des 24 h, la version du cas, la clé de livre et les textes viennent de app-logic.js,
 * compilé depuis les sources de l'app par _tools/sync-moderation-logic.mjs.
 *
 * Ce qui n'existe que sur le web : la connexion Google, la déconnexion, le refus de s'afficher dans
 * un cadre ou d'être ouverte par une autre page, le contrôle du projet Firebase visé, le bandeau
 * DEV/PROD en local, les chiffres des avis sous le titre (l'app les lit sans les afficher), et les
 * correctifs de la relecture du 2026-11-08 (marqués « web : ») :
 * - un double-clic ne prend jamais une décision que le modérateur n'a pas vue ;
 * - une décision à la fois, et pas de retour à la liste pendant qu'elle part ;
 * - une liste relue en échec ne ferme pas la fiche, une recherche dépassée n'écrase pas la suivante ;
 * - le focus suit le clavier, et le bandeau s'arrête tant qu'on le survole ou qu'il a le focus.
 *
 * Sécurité : tout texte venu du serveur (avis, précisions, noms et e-mails des signaleurs) entre
 * dans la page comme nœud texte, jamais comme HTML, sans les caractères qui inversent le sens du
 * texte. Rien de la modération n'est écrit dans la console ni dans le stockage du navigateur.
 */
import {
  caseChoices, caseIdOf, caseTitle, choiceLabel, closesCase, decisionLabel, decisionToast, describeChange,
  fetchModerationQueue, formatDuration, formatReadMonth, FR, getNestedTranslation, isBannedAt,
  isExtractTooShort, isNewReport, isOverdue, moderateCase, MODERATION_DENIED, moreActions, pendingSince,
  pseudonymLabel, reasonLabel, reasonsLabel, reasonsOf, reporterAction, searchBookKey, searchModeration,
  sortOpenCases, staleLines, stateLabel, undoPlan,
} from './app-logic.js';
import { signInWithGoogle, signOutModerator, startFirebase } from './firebase-bridge.js';

/** Le seul projet que la page sert hors de localhost. */
const PROD_PROJECT_ID = 'book-nova-prod';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
/** La locale française de l'app (utils/appLocale.ts, LOCALE_BY_LANGUAGE). */
const LOCALE = 'fr-FR';
/** ModerationToast.tsx, MODERATION_TOAST_MS : au moins 5 secondes, a demandé Florent. */
const TOAST_MS = 6000;
/** ModerationMoreSheet.tsx, DURATIONS. */
const DURATIONS = [
  { days: 7, labelKey: 'reviews.moderation.ban7' },
  { days: 30, labelKey: 'reviews.moderation.ban30' },
  { days: 365, labelKey: 'reviews.moderation.ban365' },
];
/** ModerationScreen.tsx, FAILURE_KEYS : ce que dit le bandeau quand la décision n'a pas abouti. */
const FAILURE_KEYS = {
  not_found: 'reviews.moderation.notFound',
  not_applicable: 'reviews.moderation.notApplicable',
  invalid_input: 'reviews.moderation.failed',
  failed: 'reviews.moderation.failed',
};
/**
 * Web : un clic sur une décision juste après un changement de vue ou d'étape est ignoré. Sans lui,
 * le second clic d'un double-clic tombait sur ce qui venait d'apparaître sous le pointeur (« 30
 * jours », « Retirer l'avis ») : une décision jamais vue (relecture du 2026-11-08).
 */
const CLICK_GUARD_MS = 400;
/**
 * Les caractères qui inversent ou isolent le sens du texte (U+202A à U+202E, U+2066 à U+2069). Un
 * signaleur pourrait faire lire son adresse à l'envers ; les avis les refusent déjà (serveur).
 */
const BIDI_CONTROLS = new RegExp(`[${String.fromCharCode(0x202a)}-${String.fromCharCode(0x202e)}${String.fromCharCode(0x2066)}-${String.fromCharCode(0x2069)}]`, 'g');

/** Les textes propres au web (l'app n'a ni connexion, ni déconnexion, ni projet à vérifier). */
const WEB = {
  signInText: 'Réservé au compte Google de la modération. La session s’arrête dès que la page est fermée ou rechargée.',
  signIn: 'Se connecter avec Google',
  signingIn: 'Connexion…',
  signOut: 'Se déconnecter',
  signedInAs: 'Connecté : {{email}}',
  account: 'Compte connecté : {{email}} · uid : {{uid}}',
  signInFailed: 'La connexion n’a pas abouti.',
  signInErrors: {
    'auth/popup-closed-by-user': 'Connexion annulée.',
    'auth/cancelled-popup-request': 'Connexion annulée.',
    'auth/popup-blocked': 'Le navigateur a bloqué la fenêtre de connexion : autorise les fenêtres pour ce site, puis réessaie.',
    'auth/unauthorized-domain': 'Ce domaine n’est pas autorisé : Firebase › Authentication › Paramètres › Domaines autorisés.',
    'auth/operation-not-allowed': 'La connexion Google n’est pas activée sur ce projet : Firebase › Authentication › Méthode de connexion.',
    'auth/network-request-failed': 'Pas de réseau : vérifie ta connexion.',
    'auth/user-disabled': 'Ce compte est désactivé dans Firebase Authentication.',
    'auth/too-many-requests': 'Trop d’essais : réessaie dans quelques minutes.',
  },
  sdkFailed: 'Le SDK Firebase n’a pas pu être chargé (réseau coupé, ou bloqueur de contenu).',
  configMissing: 'La configuration Firebase de la page est absente ou incomplète.',
  configMixed: 'La configuration Firebase mélange deux projets : vérifier _config.dev.yml.',
  wrongProject: 'Cette page ne sert que la PROD, et sa configuration vise {{project}}.',
  openedByPage: 'Ouvre cette page directement, depuis un favori ou la barre d’adresse : ouverte par une autre page, elle ne démarre pas.',
  envBanner: '{{env}} · {{project}}',
  /** Les chiffres de la première page de « À traiter » ; « avis » est invariable, « partage » non. */
  statsOnline: '{{count}} avis en ligne',
  statsShares: '{{count}} partages sur 12 mois',
  statsSharesOne: '{{count}} partage sur 12 mois',
};

// ── Textes ───────────────────────────────────────────────────────────────────────────────────────

/**
 * Le `t` de l'app : la résolution de app/i18n/index.ts (`getNestedTranslation`, compilée, qui rend la
 * clé quand le texte manque) et l'interpolation de `translate` (commit bd67b1ba), recopiée : chaque
 * `{{param}}` remplacé une fois, par une fonction de remplacement (une chaîne interpréterait `$&`).
 */
const t = (key, params) => {
  let text = getNestedTranslation(FR, key);
  if (params) {
    for (const [param, value] of Object.entries(params)) text = text.replace(`{{${param}}}`, () => String(value));
  }
  return text;
};

const fill = (template, params) => Object.entries(params).reduce((text, [key, value]) => text.replace(`{{${key}}}`, () => String(value)), template);

/**
 * Web : « 34 avis en ligne · 41 partages sur 12 mois ». Le français met le singulier à 0 et à 1 ;
 * les milliers prennent l'espace de la locale.
 */
const statsLine = ({ onlineReviews, sharesLastYear }) => [
  fill(WEB.statsOnline, { count: onlineReviews.toLocaleString(LOCALE) }),
  fill(sharesLastYear <= 1 ? WEB.statsSharesOne : WEB.statsShares, { count: sharesLastYear.toLocaleString(LOCALE) }),
].join(' · ');

/** ModerationRow : « 5 nov. » ; ModerationDetail : « 5 nov., 14:02 » ; ModerationMoreSheet : « 5 novembre ». */
const dateShort = (ms) => new Date(ms).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
const dateTime = (ms) => new Date(ms).toLocaleString(LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const dateLong = (ms) => new Date(ms).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' });

// ── DOM ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * Un élément. Une chaîne devient un nœud texte, sans caractère d'inversion du sens : jamais
 * d'innerHTML, le serveur renvoie des textes écrits par des lecteurs. `onClick`, `onInput`…
 * deviennent des écouteurs.
 */
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'value') el.value = value;
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child).replace(BIDI_CONTROLS, '')));
  }
  return el;
}

/** Les icônes de l'app (MaterialCommunityIcons), dessinées en SVG. */
const ICONS = {
  back: 'M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z',
  search: 'M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z',
  more: 'M16,12A2,2 0 0,1 18,10A2,2 0 0,1 20,12A2,2 0 0,1 18,14A2,2 0 0,1 16,12M10,12A2,2 0 0,1 12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12M4,12A2,2 0 0,1 6,10A2,2 0 0,1 8,12A2,2 0 0,1 6,14A2,2 0 0,1 4,12Z',
  chevronDown: 'M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z',
  chevronUp: 'M7.41,15.41L12,10.83L16.59,15.41L18,14L12,8L6,14L7.41,15.41Z',
};

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'icon');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONS[name]);
  svg.append(path);
  return svg;
}

const spinner = () => h('span', { class: 'spinner', role: 'status', 'aria-label': t('reviews.moderation.loading') });

const app = document.getElementById('app');
const sheetDialog = document.getElementById('sheet');
const staleDialog = document.getElementById('stale');
const toastRoot = document.getElementById('toast-root');
const announcer = document.getElementById('announcer');

/** Le lecteur d'écran annonce ce texte, même s'il est identique au précédent. */
function announce(message) {
  announcer.textContent = '';
  window.setTimeout(() => { announcer.textContent = message; }, 50);
}

/** Web : le moment du dernier changement de vue ou d'étape (CLICK_GUARD_MS). */
let uiChangedAt = 0;
/** Web : la dernière interaction vient du clavier (le focus le suit), ou d'un pointeur. */
let keyboardMode = false;

/** Web : un clic sur une décision, sauf le second clic d'un double-clic ou un clic trop rapide. */
const guarded = (handler) => (event) => {
  if (event.detail > 1 || performance.now() - uiChangedAt < CLICK_GUARD_MS) return;
  handler(event);
};

// ── État ─────────────────────────────────────────────────────────────────────────────────────────

/** Les `useState` de ModerationScreen, et l'état local de ModerationDetail (historique, note). */
const initialToolState = () => ({
  view: 'list',
  tab: 'open',
  cases: [],
  openCount: null,
  cursor: null,
  loadState: 'loading',
  results: null,
  searchState: 'idle',
  searchNotice: null,
  title: '',
  author: '',
  extract: '',
  selected: null,
  origin: 'list',
  seenReports: null,
  note: '',
  sheet: null,
  stale: null,
  toast: null,
  busy: false,
  historyOpen: false,
  noteOpen: false,
  /** Web : les chiffres des avis, gardés d'un onglet à l'autre jusqu'au prochain « À traiter ». */
  stats: null,
});

const state = {
  ...initialToolState(),
  env: null,
  coverHosts: new Set(),
  authReady: false,
  user: null,
  signingIn: false,
  signInError: null,
};

/** La dernière recherche lancée : relancée après une décision prise dans ses résultats. */
let lastSearch = null;
/** Une réponse arrivée pour une liste quittée entre-temps est jetée (ModerationScreen, `generation`). */
let generation = 0;
/** Web : de même pour la recherche (l'app n'a pas ce compteur ; une réponse en retard écrasait la suivante). */
let searchGeneration = 0;
/** Change à chaque connexion et déconnexion : une réponse pour le compte précédent est jetée (web). */
let epoch = 0;
/** La fiche affichée : une autre version du cas la remonte (le `key` de ModerationDetail). */
let detailKey = null;
let detailCaseId = null;
/** La fiche vient d'être remontée sur le même cas : retour en haut, focus sur la note ouverte. */
let detailRemounted = false;
let renderedView = null;
let renderedSheet = null;
let renderedSheetItem = null;
let renderedStale = null;
let renderedToast = null;

const isDenied = (error) => error instanceof Error && error.message === MODERATION_DENIED;

const focusTitle = () => document.getElementById('view-title')?.focus({ preventScroll: true });

// ── Bandeau (ModerationToast) ────────────────────────────────────────────────────────────────────

let toastTimer = null;
let toastRemaining = TOAST_MS;
let toastStartedAt = 0;
let toastHovered = false;
let toastFocused = false;
/** Web : au clavier, « ANNULER » prendra le focus dès que la décision aura fini de partir. */
let toastWantsFocus = false;

/** Rien n'a le focus, sinon le titre de la vue : on peut le donner ailleurs sans rien couper. */
const focusIsIdle = () => !document.activeElement || document.activeElement === document.body || document.activeElement.id === 'view-title';

function startToastTimer() {
  toastStartedAt = performance.now();
  toastTimer = window.setTimeout(hideToast, Math.max(0, toastRemaining));
  toastRoot.firstElementChild?.classList.remove('is-paused');
}

function pauseToastTimer() {
  if (toastTimer === null) return;
  window.clearTimeout(toastTimer);
  toastTimer = null;
  toastRemaining -= performance.now() - toastStartedAt;
  toastRoot.firstElementChild?.classList.add('is-paused');
}

/** Web : le bandeau s'arrête tant qu'on le survole ou qu'il a le focus, pour laisser viser « ANNULER ». */
function syncToastTimer() {
  if (!state.toast) return;
  if (toastHovered || toastFocused) pauseToastTimer();
  else if (toastTimer === null) startToastTimer();
}

/** ModerationScreen, `showToast` : un nouveau bandeau relance la durée, même avec le même texte. */
function showToast(content) {
  state.toast = { id: Date.now(), ...content };
  renderToast();
}

function hideToast() {
  const hadFocus = toastRoot.contains(document.activeElement);
  state.toast = null;
  renderToast();
  if (hadFocus) focusTitle();
}

function renderToast() {
  toastRoot.classList.toggle('is-lifted', state.view === 'detail' && Boolean(state.user));
  // Web : pas d'« Annuler » pendant qu'une décision ou une annulation part.
  const currentUndo = toastRoot.querySelector('.toast-undo');
  currentUndo?.toggleAttribute('disabled', state.busy);
  if (renderedToast === state.toast) {
    if (toastWantsFocus && currentUndo && !state.busy && focusIsIdle()) {
      toastWantsFocus = false;
      currentUndo.focus({ preventScroll: true });
    }
    return;
  }
  renderedToast = state.toast;
  window.clearTimeout(toastTimer);
  toastTimer = null;
  const toast = state.toast;
  if (!toast) {
    toastWantsFocus = false;
    toastRoot.replaceChildren();
    return;
  }
  announce(toast.message);
  const undo = toast.undo
    ? h('button', {
      type: 'button',
      class: 'toast-undo',
      disabled: state.busy,
      onClick: guarded(() => {
        hideToast();
        toast.undo.onPress();
      }),
    }, toast.undo.label)
    : null;
  toastRoot.replaceChildren(h('div', {
    class: `toast tone-${toast.tone}`,
    onMouseenter: () => { toastHovered = true; syncToastTimer(); },
    onMouseleave: () => { toastHovered = false; syncToastTimer(); },
    onFocusin: () => { toastFocused = true; syncToastTimer(); },
    onFocusout: (event) => {
      toastFocused = toastRoot.contains(event.relatedTarget);
      syncToastTimer();
    },
  },
  h('div', { class: 'toast-row' }, h('p', { class: 'toast-message' }, toast.message), undo),
  // La barre se vide en 6 secondes (animation CSS, relancée par ce nouvel élément).
  h('span', { class: 'toast-track' }, h('span', { class: 'toast-bar' }))));
  toastRemaining = TOAST_MS;
  toastHovered = false;
  toastFocused = false;
  startToastTimer();
  // Web : au clavier, une décision mène droit à son « ANNULER » (dès qu'il est actif).
  toastWantsFocus = Boolean(undo) && keyboardMode;
  if (toastWantsFocus && !state.busy && focusIsIdle()) {
    toastWantsFocus = false;
    undo.focus({ preventScroll: true });
  }
}

// ── Lectures (ModerationScreen) ──────────────────────────────────────────────────────────────────

/** `loadQueue` : une page de la file ; les cas à traiter, celui qui attend depuis le plus longtemps d'abord. */
async function loadQueue(status, after = null) {
  const current = ++generation;
  state.loadState = 'loading';
  render();
  try {
    const page = await fetchModerationQueue(status, after);
    if (current !== generation) return null;
    const next = status === 'open' ? sortOpenCases(page.cases) : page.cases;
    state.cases = after ? [...state.cases, ...next] : next;
    if (status === 'open' && !after) {
      state.openCount = page.cases.length;
      // Web : les chiffres viennent avec cette page seulement (absents d'un serveur plus ancien).
      state.stats = page.stats ?? null;
    }
    state.cursor = page.nextCursor;
    state.loadState = 'ready';
    render();
    return next;
  } catch (error) {
    if (current === generation) {
      state.loadState = isDenied(error) ? 'denied' : 'error';
      render();
    }
    return null;
  }
}

/** `runSearch` : les avis d'un livre (sa clé) dont le texte contient l'extrait. */
async function runSearch(bookKey, query) {
  const current = ++searchGeneration;
  lastSearch = { bookKey, query };
  state.searchState = 'loading';
  render();
  try {
    const page = await searchModeration(bookKey, query);
    if (current !== searchGeneration) return null;
    state.results = page.cases;
    state.searchState = 'ready';
    if (page.invalid) state.searchNotice = t('reviews.moderation.searchInvalidBook');
    else if (page.cases.length === 0) state.searchNotice = t('reviews.moderation.searchNone');
    else state.searchNotice = page.cases.length === 1 ? t('reviews.moderation.searchCountOne') : t('reviews.moderation.searchCount', { count: page.cases.length });
    announce(state.searchNotice);
    render();
    return page.cases;
  } catch (error) {
    if (current !== searchGeneration) return null;
    state.searchState = isDenied(error) ? 'denied' : 'error';
    render();
    return null;
  }
}

/**
 * `reloadOrigin` : la liste d'où vient la fiche, relue. L'onglet est celui affiché au moment de
 * relire. (Dans l'app, l'« Annuler » relit l'onglet de la décision, même si le modérateur a changé
 * d'onglet entre-temps : la liste affichée ne correspond alors plus à l'onglet.) Comme dans l'app,
 * « À traiter · N » ne se met à jour qu'au chargement de cet onglet.
 */
function reloadOrigin(from) {
  if (from === 'search') return lastSearch ? runSearch(lastSearch.bookKey, lastSearch.query) : Promise.resolve(null);
  return loadQueue(state.tab);
}

/** Le `useEffect` de l'onglet : changer d'onglet vide la liste et la relit. */
function selectTab(value) {
  if (value === state.tab) return;
  state.tab = value;
  state.cases = [];
  state.cursor = null;
  void loadQueue(value);
}

// ── Fiche (ModerationScreen) ─────────────────────────────────────────────────────────────────────

function openCase(item, from) {
  state.selected = item;
  state.origin = from;
  state.seenReports = null;
  state.note = '';
  state.view = 'detail';
  detailKey = null;
  detailCaseId = null;
  render();
}

/**
 * `closeDetail` : ne fait que changer l'état ; l'appelant affiche. `origin` : celle du moment de la
 * décision, comme la fermeture de l'app capturée au clic.
 */
function closeDetail(origin = state.origin) {
  state.sheet = null;
  state.selected = null;
  state.view = origin;
  detailKey = null;
  detailCaseId = null;
}

/**
 * `refreshSelected` : la fiche encore ouverte sur ce cas prend sa version relue. Sans elle, la
 * décision suivante partirait avec l'ancienne version, et le serveur la refuserait (« le cas a changé »).
 */
function refreshSelected(list, item) {
  const fresh = list?.find((entry) => caseIdOf(entry) === caseIdOf(item));
  if (fresh && state.selected && caseIdOf(state.selected) === caseIdOf(item)) state.selected = fresh;
}

/**
 * `runUndo` : l'inverse de la décision, puis « Rouvrir » si le cas était à traiter. Web : il occupe
 * l'outil (`busy`) comme une décision, pour ne jamais croiser la suivante.
 */
async function runUndo(item, steps, from) {
  if (state.busy) return;
  const session = epoch;
  state.busy = true;
  render();
  try {
    try {
      for (const step of steps) {
        const outcome = await moderateCase(item, step.action, { unchecked: true, reporterUid: step.reporterUid });
        if (session !== epoch) return;
        if (outcome !== 'ok') throw new Error(outcome);
      }
      showToast({ message: t('reviews.moderation.toast.undone'), tone: 'success' });
    } catch {
      if (session !== epoch) return;
      showToast({ message: t('reviews.moderation.toast.undoFailed'), tone: 'error' });
    }
    const list = await reloadOrigin(from);
    if (session !== epoch) return;
    refreshSelected(list, item);
  } finally {
    if (session === epoch) {
      state.busy = false;
      render();
    }
  }
}

/** `handleStale` : le cas a bougé ; la liste relue dit ce qui a changé, et la fenêtre l'annonce. */
async function handleStale(before, origin) {
  const session = epoch;
  const list = await reloadOrigin(origin);
  if (session !== epoch) return;
  const fresh = list?.find((entry) => caseIdOf(entry) === caseIdOf(before)) ?? null;
  if (!list) {
    showToast({ message: t('reviews.moderation.stale'), tone: 'warning' });
    return;
  }
  state.stale = { before, fresh, change: describeChange(before, fresh) };
  render();
}

/** `decide` : une décision sur le cas affiché, son bandeau et son « Annuler ». */
async function decide(action, options = {}) {
  const item = state.selected;
  // Web : une décision à la fois (un double-clic, une touche répétée).
  if (!item || state.busy) return;
  const session = epoch;
  // L'origine du moment du clic, comme les fermetures de l'app (capturées au rendu).
  const origin = state.origin;
  state.sheet = null;
  state.busy = true;
  render();
  try {
    const outcome = await moderateCase(item, action, { ...options, note: state.note });
    if (session !== epoch) return;
    if (outcome === 'stale') {
      await handleStale(item, origin);
      return;
    }
    if (outcome !== 'ok') {
      showToast({ message: t(FAILURE_KEYS[outcome]), tone: 'error' });
      return;
    }
    const steps = undoPlan(item, action, options);
    showToast({
      message: decisionToast(t, item, action, options),
      tone: 'success',
      undo: steps ? { label: t('reviews.moderation.toast.undo'), onPress: () => { void runUndo(item, steps, origin); } } : undefined,
    });
    state.note = '';
    const closes = closesCase(item, action);
    if (closes) {
      closeDetail(origin);
      render();
    }
    const list = await reloadOrigin(origin);
    if (session !== epoch || closes) return;
    // Bloquer l'auteur, un signaleur, rouvrir : le cas reste à trancher, la fiche reste, à jour.
    // Web : une liste qui n'a pas pu être relue ne ferme pas la fiche (l'app la fermait) ; la
    // décision suivante, si le cas a bougé, passe par « Ce cas a changé ».
    if (list === null) return;
    if (list.some((entry) => caseIdOf(entry) === caseIdOf(item))) refreshSelected(list, item);
    else closeDetail(origin);
  } catch (error) {
    if (session !== epoch) return;
    if (isDenied(error)) {
      state.loadState = 'denied';
      closeDetail(origin);
      return;
    }
    showToast({ message: t('reviews.moderation.failed'), tone: 'error' });
  } finally {
    if (session === epoch) {
      state.busy = false;
      render();
    }
  }
}

/** `choose` : bloquer se décide en deux temps, la durée d'abord, dans « Autres décisions ». */
function choose(choice) {
  if (choice.action === 'ban') {
    state.sheet = { kind: 'duration', action: 'ban' };
    render();
  } else {
    void decide(choice.action);
  }
}

/** `reread` : la fiche prend la version relue ; les signalements arrivés depuis sont « Nouveau ». */
function reread() {
  if (state.stale?.fresh) {
    state.selected = state.stale.fresh;
    state.seenReports = new Set(state.stale.before.reports.map((report) => report.reporterUid));
  }
  state.stale = null;
  render();
}

function backFromStale() {
  state.stale = null;
  closeDetail();
  render();
}

/** `submitSearch` : la clé du livre se calcule comme pour publier (`searchBookKey`). */
function submitSearch() {
  const bookKey = searchBookKey(state.title, state.author);
  if (!bookKey) {
    state.searchNotice = t('reviews.moderation.searchInvalidBook');
    announce(state.searchNotice);
    render();
    return;
  }
  if (isExtractTooShort(state.extract)) {
    state.searchNotice = t('reviews.moderation.searchTooShort');
    announce(state.searchNotice);
    render();
    return;
  }
  state.searchNotice = null;
  void runSearch(bookKey, state.extract.trim());
}

/** Le retour de l'app (bouton et BackHandler). Web : pas pendant qu'une décision part. */
function goBack() {
  if (state.busy) return;
  if (state.view === 'detail') closeDetail();
  else if (state.view === 'search') state.view = 'list';
  render();
}

// ── Affichage : en-tête et listes (ModerationScreen, ModerationRow) ──────────────────────────────

function renderHeader() {
  const { view, selected } = state;
  const headerTitle = view === 'detail' && selected
    ? caseTitle(t, selected)
    : t(view === 'search' ? 'reviews.moderation.searchTitle' : 'reviews.moderation.title');
  const subtitle = view === 'detail' && selected?.book?.authors.length ? selected.book.authors.join(', ') : null;
  const tabs = view === 'list'
    ? h('div', { class: 'tabs', role: 'tablist' }, ['open', 'resolved'].map((value) => {
      const selectedTab = value === state.tab;
      const label = value === 'open' && state.openCount !== null
        ? t('reviews.moderation.tabOpenCount', { count: state.openCount })
        : t(value === 'open' ? 'reviews.moderation.tabOpen' : 'reviews.moderation.tabResolved');
      return h('button', {
        id: `tab-${value}`, type: 'button', role: 'tab', 'aria-selected': String(selectedTab), class: `tab${selectedTab ? ' is-selected' : ''}`, onClick: () => selectTab(value),
      }, label);
    }))
    : null;
  return h('header', { class: 'header' },
    h('div', { class: 'header-row' },
      view === 'list' ? null : h('button', {
        id: 'back-button', type: 'button', class: 'icon-button is-back', disabled: state.busy, 'aria-label': t('common.back'), onClick: goBack,
      }, icon('back')),
      h('div', { class: 'header-content' },
        h('h1', { class: 'header-title', id: 'view-title', tabindex: '-1' }, headerTitle),
        view === 'list' ? h('p', { class: 'header-subtitle' }, t('reviews.moderation.subtitle')) : null,
        view === 'list' && state.stats ? h('p', { class: 'header-subtitle', id: 'review-stats' }, statsLine(state.stats)) : null,
        subtitle ? h('p', { class: 'header-subtitle is-single-line' }, subtitle) : null),
      view === 'list'
        ? h('button', {
          id: 'search-button', type: 'button', class: 'icon-button is-search', 'aria-label': t('reviews.moderation.openSearch'), onClick: () => { state.view = 'search'; render(); },
        }, icon('search'))
        : null),
    tabs,
    view === 'list'
      ? h('div', { class: 'account' },
        h('span', { class: 'account-email' }, fill(WEB.signedInAs, { email: state.user.email })),
        h('button', { id: 'signout-button', type: 'button', class: 'link', onClick: () => { void signOutModerator(); } }, WEB.signOut))
      : null);
}

/** `renderStates` : chargement, compte non modérateur, erreur avec « Réessayer », liste vide. */
function renderStates(loadState, empty, emptyKey, retry) {
  return [
    loadState === 'loading' && empty ? h('div', { class: 'center' }, spinner()) : null,
    loadState === 'denied' ? [
      h('p', { class: 'body is-error' }, t('reviews.moderation.denied')),
      h('p', { class: 'meta is-selectable' }, fill(WEB.account, { email: state.user.email, uid: state.user.uid })),
    ] : null,
    loadState === 'error'
      ? h('div', { class: 'inline' },
        h('p', { class: 'body is-error' }, t('reviews.moderation.loadError')),
        h('button', { id: 'retry-button', type: 'button', class: 'link', onClick: retry }, t('reviews.moderation.retry')))
      : null,
    loadState === 'ready' && empty && emptyKey ? h('p', { class: 'body is-muted' }, t(emptyKey)) : null,
  ];
}

/** ModerationRow, `subtitleOf` : les motifs et le nombre de signalements, ou la dernière décision. */
function rowSubtitle(item, mode) {
  const last = item.decisions[item.decisions.length - 1];
  if (mode === 'resolved' && last) return t('reviews.moderation.rowDecided', { action: decisionLabel(t, last.action), date: dateShort(last.at) });
  if (item.reports.length === 0) return t('reviews.moderation.rowNoReport');
  const reasons = reasonsLabel(t, reasonsOf(item));
  return item.reports.length === 1
    ? t('reviews.moderation.rowReportsOne', { reasons })
    : t('reviews.moderation.rowReports', { reasons, count: item.reports.length });
}

/**
 * Une couverture, seulement en https et sur les hôtes que l'app produit (`coverHosts` de la
 * configuration, les mêmes que la CSP). Web : `books_analytics` s'écrit sans compte ; une adresse
 * quelconque aurait appris à son serveur quand un modérateur ouvre la file, et depuis où.
 */
function coverImage(url) {
  let host = null;
  try {
    const parsed = typeof url === 'string' ? new URL(url) : null;
    host = parsed?.protocol === 'https:' ? parsed.hostname : null;
  } catch {
    host = null;
  }
  if (!host || !state.coverHosts.has(host)) return null;
  const img = h('img', { src: url, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
  img.addEventListener('error', () => img.remove());
  return img;
}

/** ModerationRow : la couverture, le livre (ou le lecteur), ses motifs, et l'attente en « À traiter ». */
function renderRow(item, now, mode, onPress) {
  const title = caseTitle(t, item);
  const since = mode === 'open' ? pendingSince(item) : null;
  const late = since !== null && isOverdue(item, now);
  const initial = (item.target === 'reader' ? (item.pseudonym?.animal ?? '?') : title).charAt(0).toUpperCase();
  return h('button', { id: `row-${mode}-${caseIdOf(item)}`, type: 'button', class: 'row', onClick: guarded(() => onPress(item)) },
    h('span', { class: `cover${item.target === 'reader' ? ' is-round' : ''}`, 'aria-hidden': 'true' },
      h('span', { class: 'cover-initial' }, initial),
      coverImage(item.book?.coverUrl)),
    h('span', { class: 'row-texts' },
      h('span', { class: 'row-title' }, title),
      h('span', { class: 'row-subtitle' }, rowSubtitle(item, mode))),
    since !== null ? h('span', { class: `age${late ? ' is-late' : ''}` }, formatDuration(t, now - since)) : null);
}

function renderList(now) {
  const loading = state.loadState === 'loading';
  return h('main', { class: 'content' },
    renderStates(state.loadState, state.cases.length === 0, state.tab === 'open' ? 'reviews.moderation.emptyOpen' : 'reviews.moderation.emptyResolved', () => { void loadQueue(state.tab); }),
    state.loadState !== 'denied' ? h('div', { class: 'rows' }, state.cases.map((item) => renderRow(item, now, state.tab, (entry) => openCase(entry, 'list')))) : null,
    state.cursor && state.loadState !== 'denied'
      ? h('button', { id: 'load-more', type: 'button', class: 'action', disabled: loading, onClick: () => { void loadQueue(state.tab, state.cursor); } }, loading ? spinner() : t('reviews.moderation.loadMore'))
      : null);
}

function searchInput(id, key, placeholder, extra = {}) {
  return h('input', {
    id, type: 'text', class: 'input', value: state[key], placeholder, 'aria-label': placeholder, autocomplete: 'off', ...extra,
    onInput: (event) => { state[key] = event.target.value; },
  });
}

/** La recherche ; Entrée la lance (web : un formulaire, l'app n'a que son bouton). */
function renderSearch(now) {
  const results = state.results ?? [];
  return h('main', { class: 'content' },
    h('p', { class: 'body is-muted' }, t('reviews.moderation.searchHelp')),
    h('form', { class: 'search', onSubmit: (event) => { event.preventDefault(); submitSearch(); } },
      searchInput('search-title', 'title', t('reviews.moderation.searchBookTitle')),
      searchInput('search-author', 'author', t('reviews.moderation.searchAuthor')),
      searchInput('search-extract', 'extract', t('reviews.moderation.searchQuery'), { maxlength: 200 }),
      h('button', { id: 'search-submit', type: 'submit', class: 'action' }, t('reviews.moderation.searchAction'))),
    state.searchNotice ? h('p', { class: 'body' }, state.searchNotice) : null,
    renderStates(state.searchState, results.length === 0, null, submitSearch),
    state.searchState !== 'denied' ? h('div', { class: 'rows' }, results.map((item) => renderRow(item, now, 'search', (entry) => openCase(entry, 'search')))) : null);
}

// ── Affichage : la fiche (ModerationDetail) ──────────────────────────────────────────────────────

function renderReport(item, report, now) {
  const contact = [report.name, report.email].filter(Boolean).join(' · ');
  return h('div', { class: 'report' },
    h('div', { class: 'report-head' },
      h('p', { class: 'report-line' },
        t('reviews.moderation.reportLine', { reason: reasonLabel(t, report.reason), duration: formatDuration(t, now - report.at) }),
        report.kind === 'reader' ? ` · ${t('reviews.moderation.reportOnReader')}` : ''),
      isNewReport(item, report, state.seenReports) ? h('span', { class: 'badge-new' }, t('reviews.moderation.reportNew')) : null),
    report.details ? h('p', { class: 'quote-small is-selectable' }, `« ${report.details} »`) : null,
    contact ? h('p', { class: 'meta is-selectable' }, t('reviews.moderation.reportContact', { contact })) : null,
    !report.counted ? h('p', { class: 'meta' }, t('reviews.moderation.reportYoung')) : null,
    isBannedAt(report.bannedUntil, now) && report.bannedUntil
      ? h('p', { class: 'meta is-error' }, t('reviews.moderation.reporterBanned', { date: dateTime(report.bannedUntil) }))
      : null);
}

function renderReviewPart(item) {
  const month = item.readMonth ? formatReadMonth(item.readMonth, LOCALE) : null;
  const publicState = stateLabel(t, item);
  const meta = [
    item.pseudonym ? pseudonymLabel(t, item.pseudonym) : null,
    item.rating !== null ? t('reviews.moderation.rating', { rating: item.rating }) : null,
    month ? t('reviews.moderation.readMonth', { month }) : null,
  ].filter(Boolean).join(' · ');
  return h('section', { class: 'section' },
    h('div', { class: 'quote' }, h('p', { class: 'quote-text is-selectable' }, item.text ?? '')),
    meta ? h('p', { class: 'meta' }, meta) : null,
    publicState ? h('p', { class: `state${item.publicState === 'published' ? '' : ' is-error'}` }, publicState) : null,
    item.spoilerReported ? h('p', { class: 'meta' }, t('reviews.moderation.spoilerReported')) : null,
    !item.spoilerReported && item.spoiler === 'author' ? h('p', { class: 'meta' }, t('reviews.moderation.spoilerAuthor')) : null);
}

function renderReaderPart(item) {
  return h('section', { class: 'section' },
    h('p', { class: 'body is-muted' }, t('reviews.moderation.readerCase')),
    h('h2', { class: 'section-title' }, t('reviews.moderation.readerReviews')),
    item.readerReviews.length === 0 ? h('p', { class: 'meta' }, t('reviews.moderation.readerReviewsNone')) : null,
    item.readerReviews.map((review) => h('p', { class: 'meta is-selectable' },
      t('reviews.moderation.readerReview', { key: review.bookKey, status: t(`reviews.moderation.readerStatus.${review.status}`) }))));
}

function renderHistory(item) {
  if (item.decisions.length === 0) return null;
  return h('section', { class: 'section' },
    h('button', {
      id: 'history-toggle', type: 'button', class: 'toggle', 'aria-expanded': String(state.historyOpen),
      onClick: () => { state.historyOpen = !state.historyOpen; render(); },
    }, t('reviews.moderation.historyTitle', { count: item.decisions.length }), icon(state.historyOpen ? 'chevronUp' : 'chevronDown')),
    state.historyOpen ? item.decisions.map((decision) => h('div', {},
      h('p', { class: 'meta' }, t(decision.by === 'system' ? 'reviews.moderation.decisionAuto' : 'reviews.moderation.decisionLine', { action: decisionLabel(t, decision.action), date: dateTime(decision.at) })),
      decision.note ? h('p', { class: 'meta is-selectable' }, t('reviews.moderation.decisionNote', { note: decision.note })) : null)) : null);
}

function renderNote() {
  if (!state.noteOpen) {
    return h('button', {
      id: 'note-toggle', type: 'button', class: 'toggle', onClick: () => { state.noteOpen = true; render(); document.getElementById('moderation-note')?.focus(); },
    }, t('reviews.moderation.addNote'));
  }
  return h('textarea', {
    id: 'moderation-note', class: 'input is-note', maxlength: 500, rows: 3, value: state.note,
    placeholder: t('reviews.moderation.notePlaceholder'), 'aria-label': t('reviews.moderation.notePlaceholder'),
    onInput: (event) => { state.note = event.target.value; },
  });
}

function renderChoice(choice, kind) {
  return h('button', {
    id: `choice-${kind}`, type: 'button', class: `choice is-${kind}`, disabled: state.busy, onClick: guarded(() => choose(choice)),
  }, choiceLabel(t, choice.label));
}

function renderDetail(now) {
  const item = state.selected;
  // Le `key` de ModerationDetail : une autre version du cas remonte la fiche (historique replié,
  // note ouverte seulement si elle contient déjà du texte, retour en haut).
  const key = `${caseIdOf(item)}-${item.updatedAt ?? 0}`;
  if (key !== detailKey) {
    detailRemounted = detailCaseId === caseIdOf(item);
    detailKey = key;
    detailCaseId = caseIdOf(item);
    state.historyOpen = false;
    state.noteOpen = state.note.length > 0;
  }
  const choices = caseChoices(item, now);
  const since = item.status === 'open' ? pendingSince(item) : null;
  return h('main', { class: 'detail' },
    h('div', { class: 'content' },
      since !== null ? h('p', { class: `waiting${isOverdue(item, now) ? ' is-error' : ''}` }, t('reviews.moderation.waiting', { duration: formatDuration(t, now - since) })) : null,
      item.target === 'review' ? renderReviewPart(item) : renderReaderPart(item),
      isBannedAt(item.authorBannedUntil, now) && item.authorBannedUntil
        ? h('p', { class: 'meta is-error' }, t('reviews.moderation.authorBanned', { date: dateTime(item.authorBannedUntil) }))
        : null,
      h('section', { class: 'card' },
        h('h2', { class: 'section-title' }, item.reports.length === 1 ? t('reviews.moderation.reportsTitleOne') : t('reviews.moderation.reportsTitle', { count: item.reports.length })),
        item.reports.length === 0 ? h('p', { class: 'meta' }, t('reviews.moderation.reportsNone')) : null,
        item.reports.map((report) => renderReport(item, report, now))),
      renderHistory(item),
      renderNote(),
      choices.question ? h('h2', { class: 'question' }, t(choices.question === 'reader' ? 'reviews.moderation.questionReader' : 'reviews.moderation.questionReview')) : null),
    h('div', { class: 'bar' },
      choices.keep ? renderChoice(choices.keep, 'keep') : null,
      choices.reject ? renderChoice(choices.reject, 'reject') : null,
      h('button', {
        id: 'more-button', type: 'button', class: 'more', disabled: state.busy, 'aria-label': t('reviews.moderation.more'),
        onClick: guarded(() => { state.sheet = { kind: 'menu' }; render(); }),
      }, icon('more'))));
}

// ── Affichage : « Autres décisions » (ModerationMoreSheet) et « Ce cas a changé » ────────────────

function closeSheet() {
  state.sheet = null;
  render();
}

function sheetItem(title, text, onPress, danger = false) {
  return h('button', { type: 'button', class: `sheet-item${danger ? ' is-danger' : ''}`, onClick: guarded(onPress) },
    h('span', { class: 'sheet-item-title' }, title),
    text ? h('span', { class: 'sheet-item-text' }, text) : null);
}

/** ModerationMoreSheet, `choose` : bloquer passe par la durée, un signaleur par son choix. */
function chooseMore(action) {
  if (action === 'ban') state.sheet = { kind: 'duration', action: 'ban' };
  else if (action === 'ban_reporter') state.sheet = { kind: 'reporters' };
  else {
    void decide(action, {});
    return;
  }
  render();
}

function sheetItems(item, step, now) {
  if (step.kind === 'menu') {
    return moreActions(item, now).map((action) => {
      const text = action === 'unban' && item.authorBannedUntil
        ? t('reviews.moderation.moreItems.unban.text', { date: dateLong(item.authorBannedUntil) })
        : t(`reviews.moderation.moreItems.${action}.text`);
      return sheetItem(t(`reviews.moderation.moreItems.${action}.title`), text, () => chooseMore(action));
    });
  }
  if (step.kind === 'reporters') {
    return item.reports.map((report) => {
      const action = reporterAction(report, now);
      const label = action === 'unban_reporter' && report.bannedUntil
        ? t('reviews.moderation.reporterChoiceBanned', { reason: reasonLabel(t, report.reason), date: dateLong(report.bannedUntil) })
        : t('reviews.moderation.reporterChoice', { reason: reasonLabel(t, report.reason), duration: formatDuration(t, now - report.at) });
      const onPress = action === 'unban_reporter'
        ? () => { void decide('unban_reporter', { reporterUid: report.reporterUid }); }
        : () => { state.sheet = { kind: 'duration', action: 'ban_reporter', reporterUid: report.reporterUid }; render(); };
      return sheetItem(label, action === 'unban_reporter' ? t('reviews.moderation.moreItems.ban_reporter.text') : null, onPress);
    });
  }
  return DURATIONS.map(({ days, labelKey }) => sheetItem(t(labelKey), null, () => { void decide(step.action, { banDays: days, reporterUid: step.reporterUid }); }, true));
}

function renderSheet(now) {
  const item = state.selected;
  const step = item && state.user ? state.sheet : null;
  if (!step) {
    const wasOpen = sheetDialog.open;
    renderedSheet = null;
    renderedSheetItem = null;
    if (wasOpen) sheetDialog.close();
    sheetDialog.replaceChildren();
    // Web : le focus revient sur « ⋯ », que le rendu a recréé.
    if (wasOpen && (!document.activeElement || document.activeElement === document.body)) document.getElementById('more-button')?.focus({ preventScroll: true });
    return;
  }
  if (renderedSheet === step && renderedSheetItem === item) return;
  renderedSheet = step;
  renderedSheetItem = item;
  uiChangedAt = performance.now();
  const title = {
    menu: t('reviews.moderation.more'),
    reporters: t('reviews.moderation.reportersTitle'),
    duration: t('reviews.moderation.durationTitle'),
  }[step.kind];
  sheetDialog.replaceChildren(h('div', { class: 'sheet-content' },
    h('h2', { class: 'sheet-title', id: 'sheet-title', tabindex: '-1' }, title),
    sheetItems(item, step, now),
    h('button', { type: 'button', class: 'sheet-cancel', onClick: closeSheet }, t('reviews.cancel'))));
  if (!sheetDialog.open) sheetDialog.showModal();
  // Web : le focus va au titre, pas à la première décision (Entrée deux fois ne décide rien).
  document.getElementById('sheet-title')?.focus({ preventScroll: true });
}

function renderStale() {
  const change = state.user ? state.stale?.change ?? null : null;
  if (!change) {
    const wasOpen = staleDialog.open;
    renderedStale = null;
    if (wasOpen) staleDialog.close();
    staleDialog.replaceChildren();
    if (wasOpen) focusTitle();
    return;
  }
  if (renderedStale === state.stale) return;
  renderedStale = state.stale;
  uiChangedAt = performance.now();
  const onPress = change.gone ? backFromStale : reread;
  staleDialog.replaceChildren(h('div', { class: 'dialog-card' },
    h('h2', { class: 'dialog-title', id: 'stale-title' }, t('reviews.moderation.staleTitle')),
    staleLines(t, change).map((line) => h('p', { class: 'dialog-line' }, line)),
    h('button', { type: 'button', class: 'action', onClick: onPress }, t(change.gone ? 'reviews.moderation.staleBack' : 'reviews.moderation.staleReread'))));
  if (!staleDialog.open) staleDialog.showModal();
  staleDialog.querySelector('button')?.focus();
}

// ── Affichage : connexion, page entière ──────────────────────────────────────────────────────────

async function onSignInClick() {
  state.signingIn = true;
  state.signInError = null;
  render();
  try {
    // La popup s'ouvre dans le geste de l'utilisateur ; le compte arrive par `onUser`.
    await signInWithGoogle();
  } catch (error) {
    state.signInError = WEB.signInErrors[error?.code] ?? WEB.signInFailed;
  } finally {
    state.signingIn = false;
    render();
  }
}

function renderSignIn() {
  if (!state.authReady) return h('main', { class: 'signin' }, spinner());
  return h('main', { class: 'signin' },
    h('h1', { class: 'signin-title', id: 'view-title', tabindex: '-1' }, t('reviews.moderation.title')),
    h('p', { class: 'body is-muted' }, WEB.signInText),
    h('button', { id: 'signin-button', type: 'button', class: 'action', disabled: state.signingIn, onClick: () => { void onSignInClick(); } }, state.signingIn ? WEB.signingIn : WEB.signIn),
    state.signInError ? h('p', { class: 'body is-error', role: 'alert' }, state.signInError) : null);
}

function envBanner() {
  if (!state.env?.local) return null;
  const prod = state.env.projectId === PROD_PROJECT_ID;
  return h('div', { class: `env-banner${prod ? ' is-prod' : ''}` }, fill(WEB.envBanner, { env: prod ? 'PROD' : 'DEV', project: state.env.projectId }));
}

function renderView(now) {
  if (state.view === 'detail' && state.selected) return renderDetail(now);
  if (state.view === 'search') return renderSearch(now);
  return renderList(now);
}

/**
 * Toute la page, à chaque changement d'état (le rendu de React, en plus simple). L'élément qui
 * avait le focus le retrouve par son id, avec son curseur ; une nouvelle vue le donne à son titre.
 */
function render() {
  const active = document.activeElement;
  const focusInApp = Boolean(active && active !== document.body && app.contains(active));
  const focusInToast = toastRoot.contains(active);
  const focus = focusInApp && active.id
    ? { id: active.id, start: active.selectionStart ?? null, end: active.selectionEnd ?? null }
    : null;
  const now = Date.now();
  app.replaceChildren(...[envBanner(), ...(state.user ? [renderHeader(), renderView(now)] : [renderSignIn()])].filter(Boolean));
  const view = state.user ? state.view : 'signin';
  const viewChanged = view !== renderedView;
  if (viewChanged) {
    renderedView = view;
    uiChangedAt = performance.now();
    window.scrollTo(0, 0);
  }
  if (!focusInToast) {
    const target = !viewChanged && focus ? document.getElementById(focus.id) : null;
    if (target && !target.disabled) {
      target.focus({ preventScroll: true });
      if (focus.start !== null && typeof target.setSelectionRange === 'function') target.setSelectionRange(focus.start, focus.end);
    } else if (viewChanged || focusInApp) {
      focusTitle();
    }
  }
  if (detailRemounted && view === 'detail') {
    // Le remontage de ModerationDetail : retour en haut, et la note ouverte prend le focus (autoFocus).
    detailRemounted = false;
    window.scrollTo(0, 0);
    if (state.noteOpen && !focusInToast) document.getElementById('moderation-note')?.focus({ preventScroll: true });
  }
  renderSheet(now);
  renderStale();
  renderToast();
}

function renderFatal(message) {
  app.replaceChildren(...[envBanner(), h('main', { class: 'signin' },
    h('h1', { class: 'signin-title' }, t('reviews.moderation.title')),
    h('p', { class: 'body is-error', role: 'alert' }, message))].filter(Boolean));
}

// ── Démarrage ────────────────────────────────────────────────────────────────────────────────────

/** Le compte connecté change : l'outil repart de zéro, et une réponse pour l'ancien compte est jetée. */
function onUser(user) {
  epoch += 1;
  generation += 1;
  searchGeneration += 1;
  lastSearch = null;
  Object.assign(state, initialToolState(), {
    authReady: true,
    user: user ? { email: user.email ?? '', uid: user.uid } : null,
    signInError: null,
  });
  detailKey = null;
  detailCaseId = null;
  render();
  if (state.user) void loadQueue('open');
}

/** La configuration de la page (_config.yml, ou _config.dev.yml en local), lue et vérifiée. */
function readConfig() {
  try {
    const config = JSON.parse(document.getElementById('moderation-config')?.textContent ?? 'null');
    const firebase = config?.firebase;
    const required = ['apiKey', 'authDomain', 'projectId', 'appId', 'messagingSenderId'];
    if (!firebase || !config.sdkVersion || !config.functionsRegion || !Array.isArray(config.coverHosts)) return null;
    if (!required.every((key) => typeof firebase[key] === 'string' && firebase[key])) return null;
    return config;
  } catch {
    return null;
  }
}

/**
 * Hors de localhost, la page ne sert que la PROD : une configuration DEV publiée par erreur ne
 * démarre pas. Une configuration mélangée (un projet, la clé d'un autre) non plus.
 */
function checkConfig(config) {
  const local = LOCAL_HOSTS.has(window.location.hostname);
  const { projectId, authDomain, appId, messagingSenderId } = config.firebase;
  state.env = { local, projectId };
  if (authDomain !== `${projectId}.firebaseapp.com` || !appId.startsWith(`1:${messagingSenderId}:`)) return WEB.configMixed;
  if (!local && projectId !== PROD_PROJECT_ID) return fill(WEB.wrongProject, { project: projectId });
  return null;
}

/**
 * Le refus d'être affichée dans un cadre. GitHub Pages n'envoie pas d'en-têtes, et `frame-ancestors`
 * est ignoré dans une CSP posée par <meta> : c'est donc ce script qui décide. La feuille de style
 * cache la page tant que <html> n'a pas la classe `is-top` ; elle ne la reçoit, et Firebase ne
 * démarre, que si la page est la fenêtre principale. Dans un cadre (même `sandbox="allow-scripts"`),
 * rien ne s'affiche et rien ne se connecte ; sans JavaScript, la page reste vide.
 */
function isTopWindow() {
  try {
    return window.self === window.top;
  } catch {
    return false;
  }
}

function boot() {
  if (!isTopWindow()) return;
  document.documentElement.classList.add('is-top');
  // Une page qui a ouvert celle-ci (window.open) garde la main sur elle ; une page de même origine
  // pourrait même y lire la session. Sans ouvreur, et sans nom de fenêtre qu'une autre page
  // pourrait viser, personne ne la tient.
  window.name = '';
  if (window.opener) {
    renderFatal(WEB.openedByPage);
    return;
  }
  document.addEventListener('keydown', () => { keyboardMode = true; }, true);
  document.addEventListener('pointerdown', () => { keyboardMode = false; }, true);
  sheetDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    closeSheet();
  });
  // Toucher le fond ferme « Autres décisions », comme dans l'app.
  sheetDialog.addEventListener('click', (event) => {
    if (event.target === sheetDialog) closeSheet();
  });
  // « Ce cas a changé » ne se ferme que par son bouton ; Échap fait comme lui (le retour Android).
  staleDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    if (state.stale?.change.gone) backFromStale();
    else if (state.stale) reread();
  });
  // Échap : le retour de l'app (BackHandler). Dans un champ, il le quitte seulement, comme le premier
  // retour Android ferme le clavier (web : la note tapée n'est pas perdue).
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented || sheetDialog.open || staleDialog.open || !state.user) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      event.target.blur();
      return;
    }
    if (state.view === 'detail' || state.view === 'search') goBack();
  });

  const config = readConfig();
  if (!config) {
    renderFatal(WEB.configMissing);
    return;
  }
  const problem = checkConfig(config);
  if (problem) {
    renderFatal(problem);
    return;
  }
  state.coverHosts = new Set(config.coverHosts);
  render();
  startFirebase(config, onUser).catch(() => renderFatal(WEB.sdkFailed));
}

boot();
