#!/usr/bin/env node
/**
 * Compile pour la page de modération du site la logique de l'outil de modération de l'app Book
 * Nova (lot C7) : les fichiers purs que le Jest de l'app teste, compilés tels quels, jamais
 * recopiés à la main. Le site exécute donc le même code que l'app : les questions et réponses de
 * chaque cas, l'« Annuler », l'horloge des 24 h, le contrôle de version (expectedUpdatedAt), la clé
 * de livre (createBookKey) et les textes français de l'outil.
 *
 *   node _tools/sync-moderation-logic.mjs            # régénère assets/js/moderation/app-logic.js
 *   node _tools/sync-moderation-logic.mjs --check    # échoue si le fichier diffère des sources
 *   node _tools/sync-moderation-logic.mjs --app <dossier de l'app>
 *
 * Le dossier de l'app vient de `--app`, sinon de BOOK_NOVA_APP_DIR, sinon de
 * ../react_native/Book Nova à côté du site. Rien n'est écrit dans l'app : esbuild (celui de l'app,
 * même version que son build) compile en mémoire. Une source modifiée et non commitée est refusée :
 * l'en-tête du fichier généré cite le dernier commit de chaque source, il doit dire vrai.
 *
 * Le service de l'app (lib/services/review-moderation-service.ts) est compilé lui aussi ; son
 * import de Firebase (lib/config/reviewsFirebase.ts, React Native) devient
 * `./firebase-bridge.js`, le pont du site, qui expose les deux mêmes fonctions.
 *
 * L'écran, lui, est porté à la main (assets/js/moderation/moderation.js) : HAND_PORTED liste ses
 * originaux et le commit lu pour le portage. Si l'un d'eux a changé dans l'app, le script échoue,
 * avec ou sans --check : relire le portage, puis mettre à jour le commit ici.
 *
 * La CI du site ne peut pas lancer ce script (elle n'a pas l'app) : le relancer après tout
 * changement de ces sources dans l'app, et avant chaque commit qui touche la page.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(SITE_DIR, 'assets/js/moderation/app-logic.js');
const BRIDGE = './firebase-bridge.js';

/** Ce que la page importe de l'app. Le reste des modules n'est gardé que s'il sert. */
const LOGIC_ENTRY = `
export * from './utils/reviewModeration';
export * from './utils/reviewModerationLabels';
export { pseudonymLabel } from './utils/reviewLabels';
export { formatReadMonth } from './utils/reviewDates';
export { createBookKey, isUsableBookKey } from './utils/bookKey';
export {
  fetchModerationQueue, searchModeration, moderateCase, MODERATION_DENIED, MODERATION_UNREADABLE,
} from './lib/services/review-moderation-service';
export { getNestedTranslation } from './app/i18n';
`;

/**
 * Les fichiers de l'app portés à la main dans moderation.js et firebase-bridge.js, avec le commit
 * (10 caractères) lu pour ce portage. Un commit plus récent : le portage est à relire.
 */
const HAND_PORTED = {
  'app/screens/ModerationScreen.tsx': '2f343efc02',
  'app/components/reviews/moderation/ModerationRow.tsx': '2f343efc02',
  'app/components/reviews/moderation/ModerationDetail.tsx': '2f343efc02',
  'app/components/reviews/moderation/ModerationMoreSheet.tsx': '2f343efc02',
  'app/components/reviews/moderation/ModerationStaleDialog.tsx': '2f343efc02',
  'app/components/reviews/ModerationToast.tsx': '2f343efc02',
  'lib/config/reviewsFirebase.ts': '42d533647b',
  'app/i18n/index.ts': 'bd67b1ba77',
  'utils/appLocale.ts': '3a1b1e38c1',
};

/** Les textes de l'outil, par chemin dans app/i18n/fr.ts. */
const STRING_PATHS = [
  'common.back',
  'reviews.cancel',
  'reviews.pseudonymFormat',
  'reviews.hiddenReasons',
  'reviews.animals',
  'reviews.moderation',
];

const STRINGS_ENTRY = `
import { fr } from './app/i18n/fr';
const paths = ${JSON.stringify(STRING_PATHS)};
const picked = {};
for (const key of paths) {
  const parts = key.split('.');
  const value = parts.reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), fr);
  if (value === undefined) throw new Error('Texte introuvable dans app/i18n/fr.ts : ' + key);
  let target = picked;
  for (const part of parts.slice(0, -1)) target = target[part] ??= {};
  target[parts[parts.length - 1]] = value;
}
export default picked;
`;

const fail = (message) => {
  console.error(`✖ ${message}`);
  process.exit(1);
};

const parseArgs = (argv) => {
  const appIndex = argv.indexOf('--app');
  if (appIndex >= 0 && !argv[appIndex + 1]) fail('--app attend le dossier de l’app.');
  return {
    check: argv.includes('--check'),
    appDir: path.resolve(appIndex >= 0 ? argv[appIndex + 1] : process.env.BOOK_NOVA_APP_DIR ?? path.join(SITE_DIR, '../react_native/Book Nova')),
  };
};

/** `--no-optional-locks` : `git status` ne réécrit pas l'index de l'app (rien n'y est écrit). */
const git = (appDir, args) => execFileSync('git', ['--no-optional-locks', '-C', appDir, ...args], { encoding: 'utf8' }).trim();

/** Le module `esbuild` installé dans l'app. */
const loadEsbuild = (appDir) => {
  try {
    return createRequire(path.join(appDir, 'package.json'))('esbuild');
  } catch {
    return fail(`esbuild introuvable dans ${appDir}/node_modules : lancer \`npm install\` dans l’app.`);
  }
};

/** L'import de Firebase de l'app devient le pont du site. */
const bridgePlugin = {
  name: 'site-firebase-bridge',
  setup(build) {
    build.onResolve({ filter: /(^|\/)config\/reviewsFirebase$/ }, () => ({ path: BRIDGE, external: true }));
  },
};

const baseOptions = (appDir) => ({
  absWorkingDir: appDir,
  bundle: true,
  write: false,
  metafile: true,
  legalComments: 'none',
  charset: 'ascii',
  logLevel: 'silent',
});

async function build(esbuild, appDir) {
  const [logic, strings] = await Promise.all([
    esbuild.build({
      ...baseOptions(appDir),
      stdin: { contents: LOGIC_ENTRY, resolveDir: appDir, sourcefile: '<moderation-web-entry>', loader: 'ts' },
      format: 'esm',
      platform: 'browser',
      target: 'es2020',
      plugins: [bridgePlugin],
    }),
    esbuild.build({
      ...baseOptions(appDir),
      stdin: { contents: STRINGS_ENTRY, resolveDir: appDir, sourcefile: '<moderation-web-strings>', loader: 'ts' },
      format: 'esm',
      platform: 'neutral',
      target: 'es2022',
    }),
  ]);
  const { default: picked } = await import(`data:text/javascript;base64,${Buffer.from(strings.outputFiles[0].text).toString('base64')}`);
  return { code: logic.outputFiles[0].text, strings: picked, sources: [...contributing(logic), ...contributing(strings)].sort() };
}

/** Les sources de l'app qui laissent du code dans la sortie (un module élagué n'y laisse rien). */
const contributing = (result) =>
  Object.values(result.metafile.outputs).flatMap(({ inputs }) => Object.entries(inputs))
    .filter(([input, { bytesInOutput }]) => bytesInOutput > 0 && !input.startsWith('<') && !input.includes('node_modules/'))
    .map(([input]) => input);

/** Longueur fixe : `%h` s'allonge quand le dépôt grossit, et `--check` échouerait sans raison. */
const HASH_LENGTH = 10;

/** Le dernier commit de chaque source ; refuse une source modifiée ou absente de git. */
function sourceCommits(appDir, sources) {
  const dirty = git(appDir, ['status', '--porcelain', '--', ...sources]);
  if (dirty) fail(`des sources de l’app ne sont pas commitées :\n${dirty}\nCommiter (ou mettre de côté) dans l’app, puis relancer.`);
  return sources.map((source) => {
    const commit = git(appDir, ['log', '-1', '--format=%H', '--', source]).slice(0, HASH_LENGTH);
    if (!commit) fail(`${source} n’est pas suivi par git dans l’app.`);
    return { source, commit };
  });
}

/** Les originaux du portage à la main qui ont changé depuis le commit lu pour le portage. */
function handPortDrift(appDir) {
  return Object.entries(HAND_PORTED).flatMap(([file, ported]) => {
    const latest = git(appDir, ['log', '-1', '--format=%H', '--', file]).slice(0, HASH_LENGTH);
    const dirty = git(appDir, ['status', '--porcelain', '--', file]);
    if (!latest) return [`${file} : introuvable dans l’app`];
    if (latest !== ported || dirty) return [`${file} : porté depuis ${ported}, dernier commit ${latest}${dirty ? ', modifications non commitées' : ''}`];
    return [];
  });
}

/** Les textes, en ASCII comme le code : une espace insécable reste visible, échappée, dans un diff. */
const asciiJson = (value) =>
  JSON.stringify(value, null, 2).replace(/[^\x00-\x7e]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);

function render({ code, strings, commits, esbuildVersion }) {
  const width = Math.max(...commits.map(({ source }) => source.length));
  const header = [
    '/*',
    ' * GÉNÉRÉ par _tools/sync-moderation-logic.mjs : ne pas modifier à la main.',
    ' *',
    ' * La logique de l’outil de modération de l’app Book Nova (lot C7), compilée telle quelle depuis',
    ' * ses sources : le même code que celui que le Jest de l’app teste. Vérifier qu’il est à jour :',
    ' *   node _tools/sync-moderation-logic.mjs --check',
    ' *',
    ' * Sources (dernier commit de chaque fichier, dépôt de l’app) :',
    ...commits.map(({ source, commit }) => ` *   ${source.padEnd(width)}  ${commit}`),
    ' *',
    ` * esbuild ${esbuildVersion}. L’import de lib/config/reviewsFirebase.ts devient ${BRIDGE}.`,
    ' */',
  ].join('\n');
  const stringsBlock = [
    '',
    '// Les textes français de l’outil, extraits de app/i18n/fr.ts (mêmes clés que dans l’app).',
    `export const FR = ${asciiJson(strings)};`,
    '',
  ].join('\n');
  // Le code (charset ascii d'esbuild) et les textes sont en ASCII ; seuls les commentaires gardent
  // leurs accents. Un script de module se lit toujours en UTF-8.
  return `${header}\n${code}${stringsBlock}`;
}

async function main() {
  const { check, appDir } = parseArgs(process.argv.slice(2));
  if (!existsSync(path.join(appDir, 'utils/reviewModeration.ts'))) {
    fail(`${appDir} n’est pas le dossier de l’app (utils/reviewModeration.ts absent). Préciser --app.`);
  }
  const esbuild = loadEsbuild(appDir);
  const built = await build(esbuild, appDir).catch((error) => fail(`la compilation a échoué :\n${error.message}`));
  const commits = sourceCommits(appDir, built.sources);
  const content = render({ ...built, commits, esbuildVersion: esbuild.version });
  if (content.includes(appDir) || /\/home\/|\/Users\//.test(content)) fail('un chemin absolu s’est glissé dans le fichier généré.');

  const output = path.relative(SITE_DIR, OUTPUT);
  const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, 'utf8') : null;
  if (check && current !== content) {
    fail(`${output} ne correspond plus aux sources de l’app : relancer sans --check, relire le diff, commiter.`);
  }
  if (current === content) console.log(`✔ ${output} est à jour (${commits.length} sources de l’app).`);
  else {
    writeFileSync(OUTPUT, content);
    console.log(`✔ ${output} régénéré depuis ${commits.length} sources de l’app.`);
  }

  const drift = handPortDrift(appDir);
  if (drift.length > 0) {
    fail(`l’écran porté à la main (moderation.js, firebase-bridge.js) est à relire :\n  ${drift.join('\n  ')}\nRelire ces fichiers de l’app, reporter leurs changements, puis mettre à jour HAND_PORTED.`);
  }
  console.log(`✔ Portage à la main : ses ${Object.keys(HAND_PORTED).length} originaux n’ont pas changé dans l’app.`);
}

await main();
