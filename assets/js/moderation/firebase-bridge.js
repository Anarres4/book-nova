/**
 * Le pont Firebase de la page de modération : la connexion Google et les appels aux fonctions des
 * avis. Il tient, pour le site, la place de lib/config/reviewsFirebase.ts dans l'app : le service de
 * l'app, compilé dans app-logic.js, en importe `callReviews` et `reviewsErrorCode`.
 *
 * - Le SDK web Firebase est chargé depuis gstatic, à la version de l'app (`sdkVersion` de la
 *   configuration, la même que dans la politique de sécurité de la page). Un import dynamique : un
 *   SDK injoignable se dit à l'écran au lieu d'une page vide.
 * - La session ne vit qu'en mémoire (`inMemoryPersistence`) : fermer ou recharger la page
 *   déconnecte. Pas de `sessionStorage` : les autres pages du site, sur la même origine, chargent
 *   des scripts tiers (pixel TikTok, Bootstrap depuis jsDelivr) qui pourraient y lire le jeton de
 *   rafraîchissement si le modérateur naviguait dans le même onglet (relecture de sécurité).
 * - Connexion par popup : la redirection ne marche plus, hors de Firebase Hosting, sur les
 *   navigateurs qui bloquent le stockage tiers (doc Firebase, « redirect best practices »).
 * - Le serveur seul décide qui modère : `listModerationQueue` et `moderateReview` refusent tout uid
 *   absent du secret MODERATOR_UIDS (functions/src/reviews/callables.ts). Ce fichier ne vérifie rien.
 */

/** Comme l'app (lib/config/reviewsFirebase.ts) : démarrage à froid compris. */
const CALL_TIMEOUT_MS = 25_000;
/** Les seules fonctions que la page appelle : celles de la modération. */
const MODERATION_CALLABLES = new Set(['listModerationQueue', 'moderateReview']);

let sdk = null;
let auth = null;
let functions = null;

/**
 * Charge le SDK, ouvre l'app Firebase et suit le compte connecté. `onUser` reçoit le compte, ou
 * `null`, à l'ouverture puis à chaque connexion et déconnexion. Rejette si le SDK ne se charge pas.
 * `functionsRegion` doit être celle des fonctions (functions/src/reviews/callables.ts) ; la
 * politique de sécurité de la page n'autorise qu'elle.
 */
export async function startFirebase({ firebase, sdkVersion, functionsRegion }, onUser) {
  const base = `https://www.gstatic.com/firebasejs/${sdkVersion}`;
  const [appSdk, authSdk, functionsSdk] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-functions.js`),
  ]);
  sdk = { auth: authSdk, functions: functionsSdk };
  const app = appSdk.initializeApp(firebase);
  auth = authSdk.initializeAuth(app, {
    persistence: authSdk.inMemoryPersistence,
    popupRedirectResolver: authSdk.browserPopupRedirectResolver,
  });
  functions = functionsSdk.getFunctions(app, functionsRegion);
  authSdk.onAuthStateChanged(auth, onUser);
}

/** La fenêtre de connexion Google, avec le choix du compte à chaque fois. */
export async function signInWithGoogle() {
  const provider = new sdk.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await sdk.auth.signInWithPopup(auth, provider);
}

export const signOutModerator = () => sdk.auth.signOut(auth);

/** Appelle une fonction de la modération avec le jeton du compte connecté. Une panne rejette (`FunctionsError`). */
export const callReviews = async (name, data = {}) => {
  if (!functions) throw new Error('Firebase n’est pas encore prêt.');
  if (!MODERATION_CALLABLES.has(name)) throw new Error(`Fonction hors de la modération : ${name}`);
  const callable = sdk.functions.httpsCallable(functions, name, { timeout: CALL_TIMEOUT_MS });
  return (await callable(data)).data;
};

/**
 * Le code d'une erreur des fonctions, sans son préfixe (`functions/unavailable` → `unavailable`).
 * Recopié de lib/config/reviewsFirebase.ts (commit 42d53364) : le service de l'app en dépend.
 */
export const reviewsErrorCode = (error) => {
  const code = error?.code;
  if (typeof code !== 'string') return null;
  return code.startsWith('functions/') ? code.slice('functions/'.length) : code;
};
