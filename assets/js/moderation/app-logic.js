/*
 * GÉNÉRÉ par _tools/sync-moderation-logic.mjs : ne pas modifier à la main.
 *
 * La logique de l’outil de modération de l’app Book Nova (lot C7), compilée telle quelle depuis
 * ses sources : le même code que celui que le Jest de l’app teste. Vérifier qu’il est à jour :
 *   node _tools/sync-moderation-logic.mjs --check
 *
 * Sources (dernier commit de chaque fichier, dépôt de l’app) :
 *   app/i18n/fr.ts                             23325e75a9
 *   app/i18n/index.ts                          bd67b1ba77
 *   lib/services/review-moderation-service.ts  42d533647b
 *   utils/bookKey.ts                           e285662cd2
 *   utils/communityReviews.ts                  e285662cd2
 *   utils/communityStatus.ts                   e285662cd2
 *   utils/reviewDates.ts                       8afd4208fd
 *   utils/reviewLabels.ts                      ecbdb84fe4
 *   utils/reviewModeration.ts                  e285662cd2
 *   utils/reviewModerationLabels.ts            2f343efc02
 *   utils/untrustedValues.ts                   afbc778469
 *
 * esbuild 0.27.7. L’import de lib/config/reviewsFirebase.ts devient ./firebase-bridge.js.
 */
// utils/bookKey.ts
var bookKeyCache = /* @__PURE__ */ new Map();
var normalizeString = (str) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
var normalizeTitle = (title) => normalizeString(
  (title || "unknown").toLowerCase().replace(/^(le|la|les|l'|un|une|des|the|a|an|el|la|los|las)\s+/i, "")
);
var joinKey = (author, title) => `${author}-${title}`.substring(0, 100);
var normalizeAuthor = (author) => {
  const words = (author ?? "").split(/\s+/).map(normalizeString).filter(Boolean);
  return words[words.length - 1] ?? "unknown";
};
var createBookKey = (book) => {
  const cacheKey = JSON.stringify([book.title, book.authors?.[0]]);
  const cached = bookKeyCache.get(cacheKey);
  if (cached !== void 0) return cached;
  const normalizedKey = joinKey(normalizeAuthor(book.authors?.[0]), normalizeTitle(book.title));
  bookKeyCache.set(cacheKey, normalizedKey);
  return normalizedKey;
};
var PLACEHOLDER_AUTHORS = /* @__PURE__ */ new Set(["unknown", "inconnu", "auteurinconnu", "unknownauthor", "autordesconocido"]);
var PLACEHOLDER_TITLES = /* @__PURE__ */ new Set(["unknown", "titreinconnu", "unknowntitle", "titulodesconocido"]);
var hasNonLatinLetter = (str) => /(?=\p{L})[^ -\u024f]/u.test(str.normalize("NFD"));
var isUsableBookKey = (book) => {
  const rawAuthor = book.authors?.[0] ?? "";
  const rawTitle = book.title ?? "";
  const author = normalizeString(rawAuthor);
  const title = normalizeString(rawTitle);
  if (!author || !title || PLACEHOLDER_AUTHORS.has(author) || PLACEHOLDER_TITLES.has(title)) return false;
  if (hasNonLatinLetter(rawAuthor) || hasNonLatinLetter(rawTitle)) return false;
  return !createBookKey(book).endsWith("-");
};
var stripAccents = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
var NAME_SUFFIXES = /* @__PURE__ */ new Set(["jr", "sr", "ii", "iii", "iv", "dr", "phd", "mr", "mrs", "ms"]);
var familyAuthor = (author) => {
  const lower = stripAccents((author ?? "").toLowerCase()).trim();
  const comma = lower.indexOf(",");
  const surname = comma > 0 ? lower.slice(0, comma) : lower;
  const words = surname.split(/[\s.]+/).map(normalizeString).filter(Boolean);
  const significant = words.filter((word) => word.length >= 2 && !NAME_SUFFIXES.has(word));
  return significant[significant.length - 1] ?? words[words.length - 1] ?? "unknown";
};
var MARKER_START = String.raw`(^|[\s,.:;(\[/-])`;
var VOLUME_WORD = "(?:tome|t|vol|volume|livre|book|episode|ep)";
var VOLUME_NUMBER = String.raw`(\d{1,3}(?:[.,]\d{1,2})?)(?!\d)`;
var VOLUME_BY_WORD = new RegExp(String.raw`${MARKER_START}${VOLUME_WORD}\.?\s*(?:n\s*[\u00b0\u00ba]\s*|no\.?\s*|#\s*)?${VOLUME_NUMBER}`, "g");
var VOLUME_BY_ROMAN = new RegExp(String.raw`${MARKER_START}${VOLUME_WORD}\.?\s+([ivx]{1,5})(?=\s*(?:$|[:,.()\[\]/-]))`, "g");
var VOLUME_BY_SIGN = new RegExp(String.raw`${MARKER_START}(?:#|n\s*[\u00b0\u00ba])\s*${VOLUME_NUMBER}`, "g");
var BARE_VOLUME = /(^|[\s,.#(-])0*([1-9])\)?(?=$|\s[:-]\s)/;
var ROMAN_VOLUMES = new Map(
  ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv", "xvi", "xvii", "xviii", "xix", "xx"].map((numeral, index) => [numeral, String(index + 1)])
);
var decimalVolume = (raw) => {
  const [whole, decimal] = raw.split(/[.,]/);
  const fraction = decimal ? `p${decimal}` : "";
  return `${Number(whole)}${fraction}`;
};
var romanVolume = (raw) => ROMAN_VOLUMES.get(raw);
var markersOf = (pattern, title, bySign, toVolume) => {
  const markers = [];
  const search = new RegExp(pattern.source, "g");
  for (let match = search.exec(title); match !== null; match = search.exec(title)) {
    const volume = toVolume(match[2]);
    if (volume !== void 0) {
      const hash = bySign && match[0].includes("#");
      markers.push({ start: match.index, seriesEnd: match.index + match[1].length, end: match.index + match[0].length, volume, bySign, hash });
    }
  }
  return markers;
};
var pickVolumeMarker = (title) => {
  const markers = [
    ...markersOf(VOLUME_BY_WORD, title, false, decimalVolume),
    ...markersOf(VOLUME_BY_ROMAN, title, false, romanVolume),
    ...markersOf(VOLUME_BY_SIGN, title, true, decimalVolume)
  ].sort((a, b) => a.start - b.start);
  const [first] = markers;
  const byWord = markers.find((marker) => !marker.bySign);
  if (!first || !byWord) return first;
  return first.hash && first.volume === byWord.volume ? first : byWord;
};
var splitVolume = (title) => {
  const marker = pickVolumeMarker(title);
  if (marker) return { series: title.slice(0, marker.seriesEnd), volume: marker.volume, rest: title.slice(marker.end) };
  const bare = BARE_VOLUME.exec(title);
  if (bare && normalizeString(title.slice(0, bare.index))) {
    return { series: title.slice(0, bare.index), volume: bare[2], rest: title.slice(bare.index + bare[0].length) };
  }
  return { series: title, volume: null, rest: "" };
};
var EDITION_SUFFIX = /[-:,]\s*(?:roman|a novel|edition collector|collector|edition limitee|edition speciale|edition francaise|french edition|version francaise|poche|format poche|grand format|broche|nouvelle edition|illustre|illustree)\s*$/;
var OTHER_PART = /\b(?:episode|ep|partie|part|bonus|extrait|integrale|coffret|omnibus|hors[- ]?serie|novella|prequel|bd|manga|comics?|adaptation)\b/;
var BRACKETED = /(?!^)[([]([^()[\]]*)[)\]]/g;
var LEADING_ARTICLE = /^(?:le|la|les|l'|un|une|des|the|a|an|el|los|las)\s+/;
var AUTHOR_SEPARATORS = [" - ", " | ", " par ", " by "];
var withoutBrackets = (text) => text.replace(BRACKETED, (whole, inner) => OTHER_PART.test(inner) ? whole : " ");
var keyPart = (text) => {
  const trimmed = withoutBrackets(text).replace(EDITION_SUFFIX, "").replace(/^[\s,.:;()-]+/, "");
  return normalizeString(trimmed.trim().replace(LEADING_ARTICLE, ""));
};
var withoutAuthorSuffix = (title, surname) => {
  if (surname.length < 3 || surname === "unknown") return title;
  let cut = -1;
  let separator = "";
  for (const candidate of AUTHOR_SEPARATORS) {
    const at = title.lastIndexOf(candidate);
    if (at > cut) {
      cut = at;
      separator = candidate;
    }
  }
  if (cut <= 0) return title;
  const head = title.slice(0, cut);
  const tail = title.slice(cut + separator.length);
  return tail.split(/[^a-z0-9]+/).includes(surname) && normalizeString(head) ? head : title;
};
var familyTitle = (rawTitle, surname) => {
  const cleaned = stripAccents((rawTitle || "unknown").toLowerCase()).replace(/[\u2013\u2014]/g, "-").replace(/[\u2019`]/g, "'").replace(/\s+/g, " ").trim();
  const { series, volume, rest } = splitVolume(withoutAuthorSuffix(cleaned, surname));
  const restKey = keyPart(rest);
  const seriesKey = keyPart(series) || restKey;
  const keepRest = OTHER_PART.test(rest) && restKey !== seriesKey;
  const dropsTomeOne = volume === "1" && !keepRest && seriesKey !== "";
  const volumePart = volume === null || dropsTomeOne ? "" : `tome${volume}`;
  return `${seriesKey}${volumePart}${keepRest ? restKey : ""}` || "unknown";
};
var familyKeyCache = /* @__PURE__ */ new Map();
var createBookFamilyKey = (book) => {
  const cacheKey = JSON.stringify([book.title, book.authors?.[0]]);
  const cached = familyKeyCache.get(cacheKey);
  if (cached !== void 0) return cached;
  const surname = familyAuthor(book.authors?.[0]);
  const key = joinKey(surname, familyTitle(book.title, surname));
  familyKeyCache.set(cacheKey, key);
  return key;
};

// utils/untrustedValues.ts
var NUMERIC_STRING = /^\s*-?\d+(\.\d+)?\s*$/;
var hasOwn = (record, key) => Object.prototype.hasOwnProperty.call(record, key);
var isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var asString = (value) => {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return void 0;
};
var asFiniteNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : void 0;
  if (typeof value === "string" && NUMERIC_STRING.test(value)) return Number(value);
  return void 0;
};
var asEnum = (allowed) => (value) => typeof value === "string" && hasOwn(allowed, value) ? value : void 0;

// utils/communityStatus.ts
var asStatus = asEnum({
  inProgress: true,
  abandoned: true,
  toReadOwned: true,
  toReadNotOwned: true
});

// utils/communityReviews.ts
var MINUTE_MS = 6e4;
var HOUR_MS = 60 * MINUTE_MS;
var MAX_BACKOFF_MS = 6 * HOUR_MS;
var asWant = asEnum({ published: true, withdrawn: true });
var asState = asEnum({ published: true, hidden: true });
var asSurface = asEnum({ after_completion: true, discover_sheet: true, my_reviews: true });
var asPath = asEnum({ sheet: true, settings: true });
var asPseudonym = (value) => {
  if (!isPlainObject(value)) return null;
  const animal = asString(value.animal);
  const number = asFiniteNumber(value.number);
  return animal && number !== void 0 ? { animal, number } : null;
};

// utils/reviewModeration.ts
var notNull = (value) => value !== null;
var nullableString = (value) => asString(value) ?? null;
var nullableNumber = (value) => asFiniteNumber(value) ?? null;
var ownEntries = (value) => isPlainObject(value) ? Object.entries(value).filter(([key]) => !(key in Object.prototype)) : [];
var banOf = (bans, uid) => isPlainObject(bans) && Object.prototype.hasOwnProperty.call(bans, uid) ? nullableNumber(bans[uid]) : null;
var parseReport = (reporterUid, raw, bans) => {
  if (!isPlainObject(raw)) return null;
  const at = asFiniteNumber(raw.at);
  if (at === void 0) return null;
  return {
    reporterUid,
    kind: asString(raw.kind) ?? "abuse",
    reason: nullableString(raw.reason),
    details: nullableString(raw.details),
    name: nullableString(raw.name),
    email: nullableString(raw.email),
    accountAgeHours: nullableNumber(raw.accountAgeHours),
    counted: raw.counted === true,
    at,
    bannedUntil: banOf(bans, reporterUid)
  };
};
var parseDecision = (raw) => {
  if (!isPlainObject(raw)) return null;
  const action = asString(raw.action);
  const at = asFiniteNumber(raw.at);
  return action && at !== void 0 ? { action, by: asString(raw.by) ?? "", note: nullableString(raw.note), at } : null;
};
var parseReaderReview = (raw) => {
  if (!isPlainObject(raw)) return null;
  const bookKey = asString(raw.bookKey);
  const status = asString(raw.status);
  return bookKey && status ? { bookKey, status, reason: nullableString(raw.reason) } : null;
};
var parseBook = (raw) => {
  if (!isPlainObject(raw)) return null;
  const title = asString(raw.title);
  if (!title) return null;
  const authors = Array.isArray(raw.authors) ? raw.authors.map(asString).filter((author) => Boolean(author)) : [];
  return { title, authors, coverUrl: nullableString(raw.coverUrl) };
};
var listOf = (value, parse) => (Array.isArray(value) ? value : []).map(parse).filter(notNull);
var PUBLIC_STATES = ["published", "hidden", "withdrawn"];
var asPublicState = (value) => PUBLIC_STATES.find((state) => state === value) ?? "published";
var asCaseStatus = (value) => value === "open" || value === "resolved" ? value : null;
var asSpoiler = (value) => value === "author" || value === "reported" ? value : null;
var parseSnapshot = (raw) => {
  const snapshot = isPlainObject(raw) ? raw : {};
  return {
    text: nullableString(snapshot.text),
    rating: nullableNumber(snapshot.rating),
    readMonth: nullableString(snapshot.readMonth),
    spoiler: asSpoiler(snapshot.spoiler),
    pseudonym: asPseudonym(snapshot.pseudonym)
  };
};
var parseModerationCase = (raw) => {
  if (!isPlainObject(raw)) return null;
  const authorKey = asString(raw.authorKey);
  if (!authorKey) return null;
  const snapshot = parseSnapshot(raw.snapshot);
  const reader = isPlainObject(raw.reader) ? raw.reader : {};
  return {
    ...snapshot,
    id: typeof raw.id === "string" ? raw.id : null,
    target: raw.target === "reader" ? "reader" : "review",
    bookKey: nullableString(raw.bookKey),
    book: parseBook(raw.book),
    authorKey,
    status: asCaseStatus(raw.status),
    locked: raw.locked === true,
    publicState: asPublicState(raw.publicState),
    authorWithdrawn: raw.authorWithdrawn === true,
    spoilerReported: raw.spoilerReported === true || snapshot.spoiler === "reported",
    pseudonym: snapshot.pseudonym ?? asPseudonym(reader.pseudonym),
    reports: ownEntries(raw.reports).map(([uid, report]) => parseReport(uid, report, raw.reporterBans)).filter(notNull).sort((a, b) => a.at - b.at),
    decisions: listOf(raw.decisions, parseDecision).sort((a, b) => a.at - b.at),
    updatedAt: nullableNumber(raw.updatedAt),
    authorBannedUntil: nullableNumber(raw.authorBannedUntil),
    readerReviews: listOf(reader.reviews, parseReaderReview)
  };
};
var parseCursor = (raw) => {
  if (!isPlainObject(raw)) return null;
  const updatedAt = asFiniteNumber(raw.updatedAt);
  const id = asString(raw.id);
  return updatedAt !== void 0 && id ? { updatedAt, id } : null;
};
var asCount = (value) => {
  const count = asFiniteNumber(value);
  return count !== void 0 && Number.isInteger(count) && count >= 0 ? count : void 0;
};
var parseStats = (raw) => {
  if (!isPlainObject(raw)) return null;
  const onlineReviews = asCount(raw.onlineReviews);
  const sharesLastYear = asCount(raw.sharesLastYear);
  return onlineReviews !== void 0 && sharesLastYear !== void 0 ? { onlineReviews, sharesLastYear } : null;
};
var parseModerationPage = (raw) => {
  if (!isPlainObject(raw) || !Array.isArray(raw.items)) return null;
  return {
    cases: listOf(raw.items, parseModerationCase),
    nextCursor: parseCursor(raw.nextCursor),
    invalid: raw.invalid === true,
    stats: parseStats(raw.stats)
  };
};
var OUTCOMES = ["stale", "not_found", "not_applicable", "invalid_input"];
var parseModerationOutcome = (raw) => {
  if (!isPlainObject(raw)) return "failed";
  if (raw.status === "ok") return "ok";
  return OUTCOMES.find((outcome) => outcome === raw.reason) ?? "failed";
};
var CLOSING_ACTIONS = ["restore", "remove", "dismiss", "clear_spoiler"];
var isClosing = (target, action) => CLOSING_ACTIONS.includes(action) || target === "reader" && action === "ban";
var closesCase = (item, action) => isClosing(item.target, action);
var lastClosingAt = (item) => {
  let closings = [];
  for (const decision of item.decisions.filter(({ by }) => by !== "system")) {
    if (decision.action === "reopen") {
      const lastReport = Math.max(0, ...item.reports.filter((report) => report.at < decision.at).map((report) => report.at));
      closings = closings.filter((at) => at < lastReport);
    } else if (isClosing(item.target, decision.action)) {
      closings.push(decision.at);
    }
  }
  return closings.length > 0 ? closings[closings.length - 1] : 0;
};
var pendingSince = (item) => {
  const decided = lastClosingAt(item);
  const pending = item.reports.filter((report) => report.at > decided);
  return pending.length > 0 ? Math.min(...pending.map((report) => report.at)) : item.updatedAt;
};
var durationParts = (ms) => {
  const minutes = Math.max(1, Math.round(ms / 6e4));
  if (minutes < 60) return { unit: "minutes", count: minutes };
  const hours = Math.round(minutes / 60);
  return hours < 48 ? { unit: "hours", count: hours } : { unit: "days", count: Math.round(hours / 24) };
};
var OVERDUE_AFTER_MS = 20 * 36e5;
var isOverdue = (item, now) => {
  const since = pendingSince(item);
  return since !== null && now - since >= OVERDUE_AFTER_MS;
};
var sortOpenCases = (cases) => [...cases].sort((a, b) => (pendingSince(a) ?? Number.MAX_SAFE_INTEGER) - (pendingSince(b) ?? Number.MAX_SAFE_INTEGER));
var isBannedAt = (bannedUntil, now) => bannedUntil !== null && bannedUntil > now;
var NOTHING = { question: null, keep: null, reject: null };
var REMOVE = { action: "remove", label: "remove" };
var RESTORE = { action: "restore", label: "restore" };
var isWithdrawnByAuthor = (item) => item.publicState === "withdrawn" || item.authorWithdrawn;
var readerChoices = (item, now) => ({
  question: item.status === "open" ? "reader" : null,
  keep: item.status === "open" ? { action: "dismiss", label: "nothingToDo" } : null,
  reject: isBannedAt(item.authorBannedUntil, now) ? null : { action: "ban", label: "blockReader" }
});
var hiddenChoices = (item) => {
  if (item.status !== "open") return { question: null, keep: RESTORE, reject: null };
  return { question: "review", keep: RESTORE, reject: item.locked ? { action: "dismiss", label: "keepRemoved" } : REMOVE };
};
var withdrawnChoices = (item) => ({
  question: null,
  keep: item.status === "open" ? { action: "dismiss", label: "nothingToDo" } : null,
  reject: item.publicState === "hidden" && item.locked ? null : REMOVE
});
var caseChoices = (item, now) => {
  if (item.target === "reader") return readerChoices(item, now);
  if (!item.bookKey) return NOTHING;
  if (item.id === null) return { question: null, keep: null, reject: REMOVE };
  if (isWithdrawnByAuthor(item)) return withdrawnChoices(item);
  if (item.publicState === "hidden") return hiddenChoices(item);
  return item.status === "open" ? { question: "review", keep: { action: "dismiss", label: "keepOnline" }, reject: REMOVE } : { question: null, keep: null, reject: REMOVE };
};
var moreActions = (item, now) => {
  const actions = [];
  if (item.target === "review" && item.spoilerReported && item.publicState === "published") actions.push("clear_spoiler");
  if (isBannedAt(item.authorBannedUntil, now)) actions.push("unban");
  else if (item.target === "review") actions.push("ban");
  if (item.reports.length > 0) actions.push("ban_reporter");
  if (item.id !== null && item.status === "resolved") actions.push("reopen");
  return actions;
};
var reasonsOf = (item) => [...new Set(item.reports.map((report) => report.reason ?? "unknown"))];
var isNewReport = (item, report, seen) => {
  if (seen) return !seen.has(report.reporterUid);
  const decided = lastClosingAt(item);
  return decided > 0 && report.at > decided;
};
var describeChange = (before, after) => {
  if (!after) return { gone: true, newReports: 0, textEdited: false, stateChanged: false };
  const seen = new Set(before.reports.map((report) => report.reporterUid));
  return {
    gone: false,
    newReports: after.reports.filter((report) => !seen.has(report.reporterUid)).length,
    textEdited: before.text !== after.text,
    stateChanged: before.publicState !== after.publicState || before.status !== after.status
  };
};
var caseIdOf = (item) => item.id ?? `${item.bookKey}__${item.authorKey}`;
var reporterAction = (report, now) => isBannedAt(report.bannedUntil, now) ? "unban_reporter" : "ban_reporter";
var stepsOrNull = (...groups) => {
  const steps = groups.flat();
  return steps.length > 0 ? steps : null;
};
var undoPlan = (item, action, options = {}) => {
  const reopen = item.status === "open" ? [{ action: "reopen" }] : [];
  switch (action) {
    case "dismiss":
      return [{ action: "reopen" }];
    case "remove":
      return stepsOrNull(item.publicState === "published" && !item.authorWithdrawn ? [{ action: "restore" }] : [], reopen);
    case "restore":
      return stepsOrNull([{ action: "remove" }], reopen);
    case "ban":
      return item.target === "reader" ? stepsOrNull([{ action: "unban" }], reopen) : [{ action: "unban" }];
    case "ban_reporter":
      return options.reporterUid ? [{ action: "unban_reporter", reporterUid: options.reporterUid }] : null;
    default:
      return null;
  }
};
var decisionPayload = (item, action, options = {}) => {
  const note = options.note?.trim();
  const byCase = options.unchecked === true || item.id !== null;
  return {
    ...byCase ? { modId: caseIdOf(item) } : { bookKey: item.bookKey, authorKey: item.authorKey },
    action,
    ...options.unchecked ? {} : { expectedUpdatedAt: item.id !== null ? item.updatedAt : null },
    ...note ? { note } : {},
    ...options.banDays ? { banDays: options.banDays } : {},
    ...options.reporterUid ? { reporterUid: options.reporterUid } : {}
  };
};
var isExtractTooShort = (extract) => {
  const length = Array.from(extract.trim()).length;
  return length > 0 && length < 3;
};
var BOOK_KEY_SHAPE = /^[a-z0-9]+-[a-z0-9]+$/;
var searchBookKey = (title, author) => {
  const cleanTitle = title.trim();
  const cleanAuthor = author.trim();
  if (!cleanAuthor && BOOK_KEY_SHAPE.test(cleanTitle)) return cleanTitle;
  const book = { title: cleanTitle, authors: [cleanAuthor] };
  return isUsableBookKey(book) ? createBookFamilyKey(book) : null;
};

// utils/reviewLabels.ts
var translateOr = (t, key, fallbackKey) => {
  const label = t(key);
  return label === key ? t(fallbackKey) : label;
};
var hiddenReasonLabel = (t, reason) => translateOr(t, `reviews.hiddenReasons.${reason ?? "unknown"}`, "reviews.hiddenReasons.unknown");
var pseudonymLabel = (t, pseudonym) => {
  const key = `reviews.animals.${pseudonym.animal}`;
  const translated = t(key);
  const animal = translated === key ? pseudonym.animal.charAt(0).toUpperCase() + pseudonym.animal.slice(1) : translated;
  return t("reviews.pseudonymFormat", { animal, number: pseudonym.number });
};

// utils/reviewModerationLabels.ts
var DURATION_KEYS = { minutes: "durationMinutes", hours: "durationHours", days: "durationDays" };
var formatDuration = (t, ms) => {
  const { unit, count } = durationParts(ms);
  return t(`reviews.moderation.${DURATION_KEYS[unit]}`, { count });
};
var translateOr2 = (t, key, fallbackKey) => {
  const label = t(key);
  return label === key ? t(fallbackKey) : label;
};
var decisionLabel = (t, action) => translateOr2(t, `reviews.moderation.decisions.${action}`, "reviews.moderation.decisions.unknown");
var choiceLabel = (t, label) => t(`reviews.moderation.choices.${label}`);
var capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
var reasonsLabel = (t, reasons) => capitalize(reasons.map((reason) => hiddenReasonLabel(t, reason)).join(", "));
var reasonLabel = (t, reason) => capitalize(hiddenReasonLabel(t, reason));
var caseTitle = (t, item) => {
  if (item.target === "reader") {
    return item.pseudonym ? t("reviews.moderation.rowReader", { pseudonym: pseudonymLabel(t, item.pseudonym) }) : t("reviews.moderation.rowReaderUnknown");
  }
  return item.book?.title ?? item.bookKey ?? "";
};
var stateLabel = (t, item) => {
  if (item.target === "reader") return null;
  if (item.id === null) return t("reviews.moderation.stateNoCase");
  if (item.publicState === "withdrawn" || item.authorWithdrawn) return t("reviews.moderation.stateWithdrawn");
  if (item.publicState === "hidden") return t(item.locked ? "reviews.moderation.stateRemoved" : "reviews.moderation.stateHiddenAuto");
  return t("reviews.moderation.stateOnline");
};
var BAN_LABEL_KEYS = { 7: "ban7", 30: "ban30", 365: "ban365" };
var banDurationLabel = (t, days) => t(`reviews.moderation.${BAN_LABEL_KEYS[days ?? 30] ?? BAN_LABEL_KEYS[30]}`);
var dismissToastKey = (item) => {
  if (item.target === "reader" || item.authorWithdrawn || item.publicState === "withdrawn") return "dismissOther";
  return item.publicState === "hidden" ? "dismissRemoved" : "dismissOnline";
};
var decisionToast = (t, item, action, options = {}) => {
  if (action === "dismiss") return t(`reviews.moderation.toast.${dismissToastKey(item)}`);
  const key = action === "ban" && item.target === "reader" ? "banReader" : action;
  return t(`reviews.moderation.toast.${key}`, { duration: banDurationLabel(t, options.banDays) });
};
var staleLines = (t, change) => {
  if (change.gone) return [t("reviews.moderation.staleGone")];
  const lines = [];
  if (change.newReports === 1) lines.push(t("reviews.moderation.staleNewReportsOne"));
  if (change.newReports > 1) lines.push(t("reviews.moderation.staleNewReports", { count: change.newReports }));
  if (change.textEdited) lines.push(t("reviews.moderation.staleTextEdited"));
  if (change.stateChanged) lines.push(t("reviews.moderation.staleStateChanged"));
  lines.push(t("reviews.moderation.staleCheck"));
  return lines;
};

// utils/reviewDates.ts
var formatReadMonth = (readMonth, locale) => {
  const match = /^(\d{4})-(\d{2})$/.exec(readMonth);
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return new Date(Number(match[1]), month - 1, 1).toLocaleDateString(locale, { month: "long", year: "numeric" });
};

// lib/services/review-moderation-service.ts
import { callReviews, reviewsErrorCode } from "./firebase-bridge.js";
var MODERATION_DENIED = "MODERATION_DENIED";
var MODERATION_UNREADABLE = "MODERATION_UNREADABLE";
var OPEN_PAGE_SIZE = 50;
var RESOLVED_PAGE_SIZE = 20;
var callModeration = async (name, data) => {
  try {
    return await callReviews(name, data);
  } catch (error) {
    if (reviewsErrorCode(error) === "permission-denied") throw new Error(MODERATION_DENIED);
    throw error;
  }
};
var pageOf = (raw) => {
  const page = parseModerationPage(raw);
  if (!page) throw new Error(MODERATION_UNREADABLE);
  return page;
};
var fetchModerationQueue = async (status, cursor = null) => pageOf(await callModeration("listModerationQueue", {
  status,
  limit: status === "open" ? OPEN_PAGE_SIZE : RESOLVED_PAGE_SIZE,
  ...cursor ? { cursor } : {}
}));
var searchModeration = async (bookKey, query) => pageOf(await callModeration("listModerationQueue", { search: { bookKey, query } }));
var moderateCase = async (item, action, options = {}) => parseModerationOutcome(await callModeration("moderateReview", decisionPayload(item, action, options)));

// app/i18n/index.ts
var Language = /* @__PURE__ */ ((Language2) => {
  Language2["ENGLISH"] = "en";
  Language2["FRENCH"] = "fr";
  Language2["SPANISH"] = "es";
  return Language2;
})(Language || {});
var SUPPORTED_LANGUAGE_CODES = Object.values(Language);
var getNestedTranslation = (obj, path) => {
  const root = obj;
  const result = path.split(".").reduce((prev, curr) => {
    if (!prev || typeof prev !== "object") return void 0;
    return prev[curr];
  }, root);
  return (typeof result === "string" ? result : void 0) ?? path;
};
export {
  MODERATION_DENIED,
  MODERATION_UNREADABLE,
  banDurationLabel,
  caseChoices,
  caseIdOf,
  caseTitle,
  choiceLabel,
  closesCase,
  createBookKey,
  decisionLabel,
  decisionPayload,
  decisionToast,
  describeChange,
  durationParts,
  fetchModerationQueue,
  formatDuration,
  formatReadMonth,
  getNestedTranslation,
  isBannedAt,
  isExtractTooShort,
  isNewReport,
  isOverdue,
  isUsableBookKey,
  moderateCase,
  moreActions,
  parseModerationCase,
  parseModerationOutcome,
  parseModerationPage,
  pendingSince,
  pseudonymLabel,
  reasonLabel,
  reasonsLabel,
  reasonsOf,
  reporterAction,
  searchBookKey,
  searchModeration,
  sortOpenCases,
  staleLines,
  stateLabel,
  undoPlan
};

// Les textes français de l’outil, extraits de app/i18n/fr.ts (mêmes clés que dans l’app).
export const FR = {
  "common": {
    "back": "Retour"
  },
  "reviews": {
    "cancel": "Annuler",
    "pseudonymFormat": "{{animal}} {{number}}",
    "hiddenReasons": {
      "spoiler": "spoiler",
      "hate": "haine ou harc\u00e8lement",
      "insult": "insulte ou contenu offensant",
      "personal": "informations personnelles",
      "spam": "spam ou publicit\u00e9",
      "fake": "faux avis",
      "illegal": "contenu illicite",
      "other": "autre motif",
      "moderation": "d\u00e9cision de la mod\u00e9ration",
      "unknown": "en attente de v\u00e9rification"
    },
    "animals": {
      "owl": "Hibou",
      "fox": "Renard",
      "bear": "Ours",
      "otter": "Loutre",
      "hedgehog": "H\u00e9risson",
      "wolf": "Loup",
      "lynx": "Lynx",
      "deer": "Cerf",
      "hare": "Li\u00e8vre",
      "squirrel": "\u00c9cureuil",
      "heron": "H\u00e9ron",
      "swan": "Cygne",
      "sparrow": "Moineau",
      "robin": "Rouge-gorge",
      "falcon": "Faucon",
      "eagle": "Aigle",
      "dolphin": "Dauphin",
      "turtle": "Tortue",
      "frog": "Grenouille",
      "salamander": "Salamandre",
      "bee": "Abeille",
      "dragonfly": "Libellule",
      "koala": "Koala",
      "panda": "Panda",
      "tiger": "Tigre",
      "lion": "Lion",
      "elephant": "\u00c9l\u00e9phant",
      "giraffe": "Girafe",
      "zebra": "Z\u00e8bre",
      "penguin": "Pingouin",
      "flamingo": "Flamant"
    },
    "moderation": {
      "entryTitle": "Mod\u00e9ration",
      "entryText": "Les signalements \u00e0 traiter, les d\u00e9cisions prises, et la recherche d\u2019un avis.",
      "entryAction": "Ouvrir l\u2019outil de mod\u00e9ration",
      "title": "Mod\u00e9ration",
      "subtitle": "Chaque signalement se traite sous 24\u00a0h",
      "tabOpen": "\u00c0 traiter",
      "tabOpenCount": "\u00c0 traiter \u00b7 {{count}}",
      "tabResolved": "Trait\u00e9s",
      "openSearch": "Retrouver un avis",
      "loading": "Chargement\u2026",
      "loadError": "La file n\u2019a pas pu \u00eatre lue. V\u00e9rifie ta connexion.",
      "denied": "Ce compte n\u2019est pas mod\u00e9rateur\u00a0: son uid doit \u00eatre dans le secret MODERATOR_UIDS.",
      "retry": "R\u00e9essayer",
      "loadMore": "Charger plus",
      "emptyOpen": "Rien \u00e0 traiter.",
      "emptyResolved": "Aucune d\u00e9cision prise pour l\u2019instant.",
      "rowReports": "{{reasons}} \u00b7 {{count}}\u00a0signalements",
      "rowReportsOne": "{{reasons}} \u00b7 1\u00a0signalement",
      "rowNoReport": "Pas encore signal\u00e9",
      "rowReader": "Un lecteur\u00a0: {{pseudonym}}",
      "rowReaderUnknown": "Un lecteur signal\u00e9",
      "rowDecided": "{{action}}, le {{date}}",
      "waiting": "Attend depuis {{duration}}",
      "stateOnline": "En ligne.",
      "stateHiddenAuto": "Masqu\u00e9 automatiquement, en attendant ta d\u00e9cision.",
      "stateRemoved": "Retir\u00e9 par la mod\u00e9ration.",
      "stateWithdrawn": "Retir\u00e9 par son auteur.",
      "stateNoCase": "Pas encore signal\u00e9.",
      "spoilerAuthor": "Marqu\u00e9 spoiler par son auteur.",
      "spoilerReported": "Signal\u00e9 comme spoiler\u00a0: le texte est cach\u00e9 aux lecteurs.",
      "authorBanned": "Auteur bloqu\u00e9 jusqu\u2019au {{date}}.",
      "rating": "{{rating}}\u00a0/\u00a05",
      "readMonth": "lu en {{month}}",
      "readerCase": "C\u2019est un lecteur qui est signal\u00e9, pas un avis\u00a0: il n\u2019y a pas de texte.",
      "readerReviews": "Ses avis",
      "readerReviewsNone": "Aucun avis.",
      "readerReview": "{{key}}\u00a0: {{status}}",
      "readerStatus": {
        "published": "en ligne",
        "hidden": "masqu\u00e9",
        "withdrawn": "retir\u00e9"
      },
      "reportsTitle": "Signal\u00e9 {{count}}\u00a0fois",
      "reportsTitleOne": "Signal\u00e9 1\u00a0fois",
      "reportsNone": "Aucun signalement.",
      "reportLine": "{{reason}} \u00b7 il y a {{duration}}",
      "reportNew": "Nouveau",
      "reportOnReader": "signale le lecteur",
      "reportContact": "Contact\u00a0: {{contact}}",
      "reportYoung": "Compte de moins d\u2019un jour\u00a0: n\u2019a rien masqu\u00e9 seul.",
      "reporterBanned": "Signaleur bloqu\u00e9 jusqu\u2019au {{date}}.",
      "historyTitle": "Historique ({{count}})",
      "decisionLine": "{{action}}, le {{date}}",
      "decisionAuto": "{{action}} (automatique), le {{date}}",
      "decisionNote": "Note\u00a0: {{note}}",
      "addNote": "Ajouter une note",
      "notePlaceholder": "Note facultative, gard\u00e9e avec la d\u00e9cision",
      "questionReview": "Cet avis respecte-t-il les r\u00e8gles\u00a0?",
      "questionReader": "Ce lecteur respecte-t-il les r\u00e8gles\u00a0?",
      "choices": {
        "keepOnline": "Laisser en ligne",
        "keepRemoved": "Le garder retir\u00e9",
        "nothingToDo": "Rien \u00e0 faire",
        "restore": "Remettre en ligne",
        "remove": "Retirer l\u2019avis",
        "blockReader": "Bloquer ce lecteur\u2026"
      },
      "more": "Autres d\u00e9cisions",
      "moreItems": {
        "clear_spoiler": {
          "title": "Ce n\u2019est pas un spoiler",
          "text": "Le texte redevient lisible par tous, et le cas est class\u00e9."
        },
        "ban": {
          "title": "Bloquer l\u2019auteur\u2026",
          "text": "7\u00a0jours, 30\u00a0jours ou 1\u00a0an. Ses avis restent en ligne."
        },
        "unban": {
          "title": "D\u00e9bloquer l\u2019auteur",
          "text": "Bloqu\u00e9 jusqu\u2019au {{date}}."
        },
        "ban_reporter": {
          "title": "Un signaleur signale \u00e0 tort\u2026",
          "text": "Le bloquer, ou le d\u00e9bloquer."
        },
        "reopen": {
          "title": "Rouvrir le cas",
          "text": "Il revient dans \u00ab\u00a0\u00c0 traiter\u00a0\u00bb."
        }
      },
      "durationTitle": "Pour combien de temps\u00a0?",
      "ban7": "7\u00a0jours",
      "ban30": "30\u00a0jours",
      "ban365": "1\u00a0an",
      "reportersTitle": "Quel signaleur\u00a0?",
      "reporterChoice": "{{reason}} \u00b7 il y a {{duration}}",
      "reporterChoiceBanned": "{{reason}} \u00b7 bloqu\u00e9 jusqu\u2019au {{date}}",
      "staleTitle": "Ce cas a chang\u00e9 pendant que tu le lisais",
      "staleNewReports": "{{count}}\u00a0nouveaux signalements sont arriv\u00e9s.",
      "staleNewReportsOne": "Un nouveau signalement est arriv\u00e9.",
      "staleTextEdited": "L\u2019auteur a modifi\u00e9 son texte.",
      "staleStateChanged": "Son \u00e9tat a chang\u00e9.",
      "staleGone": "Il a \u00e9t\u00e9 trait\u00e9 entre-temps\u00a0: il n\u2019est plus dans cette liste.",
      "staleCheck": "Relis-le avant de d\u00e9cider.",
      "staleReread": "Relire le cas",
      "staleBack": "Revenir \u00e0 la liste",
      "toast": {
        "remove": "Avis retir\u00e9. Plus personne ne le voit.",
        "restore": "Avis remis en ligne.",
        "dismissOnline": "Avis laiss\u00e9 en ligne. Le cas est class\u00e9.",
        "dismissRemoved": "L\u2019avis reste retir\u00e9. Le cas est class\u00e9.",
        "dismissOther": "Cas class\u00e9.",
        "clear_spoiler": "Ce n\u2019est plus un spoiler\u00a0: le texte est lisible par tous.",
        "ban": "Auteur bloqu\u00e9 pour {{duration}}.",
        "banReader": "Lecteur bloqu\u00e9 pour {{duration}}. Le cas est class\u00e9.",
        "unban": "Auteur d\u00e9bloqu\u00e9.",
        "ban_reporter": "Signaleur bloqu\u00e9 pour {{duration}}.",
        "unban_reporter": "Signaleur d\u00e9bloqu\u00e9.",
        "reopen": "Le cas est de nouveau \u00e0 traiter.",
        "undo": "ANNULER",
        "undone": "D\u00e9cision annul\u00e9e.",
        "undoFailed": "L\u2019annulation n\u2019a pas abouti. Retrouve le cas dans \u00ab\u00a0Trait\u00e9s\u00a0\u00bb."
      },
      "stale": "Ce cas a chang\u00e9 depuis son affichage\u00a0: il vient d\u2019\u00eatre relu. Relis-le avant de d\u00e9cider.",
      "notApplicable": "Cette d\u00e9cision ne s\u2019applique pas \u00e0 ce cas.",
      "notFound": "Ce cas n\u2019existe plus.",
      "failed": "La d\u00e9cision n\u2019a pas pu \u00eatre enregistr\u00e9e. R\u00e9essaie.",
      "searchTitle": "Retrouver un avis",
      "searchHelp": "Un avis signal\u00e9 par mail, ou celui d\u2019un lecteur qui a perdu son compte.",
      "searchBookTitle": "Titre du livre",
      "searchAuthor": "Nom de l\u2019auteur (le nom de famille suffit)",
      "searchQuery": "Quelques mots de l\u2019avis (facultatif)",
      "searchAction": "Chercher",
      "searchInvalidBook": "Ce livre ne peut pas porter d\u2019avis\u00a0: v\u00e9rifie le titre et le nom de l\u2019auteur.",
      "searchTooShort": "Quelques mots, c\u2019est au moins 3\u00a0caract\u00e8res.",
      "searchNone": "Aucun avis trouv\u00e9 pour ce livre.",
      "searchCount": "{{count}}\u00a0avis trouv\u00e9s",
      "searchCountOne": "1\u00a0avis trouv\u00e9",
      "durationMinutes": "{{count}}\u00a0min",
      "durationHours": "{{count}}\u00a0h",
      "durationDays": "{{count}}\u00a0j",
      "decisions": {
        "restore": "Remis en ligne",
        "remove": "Retir\u00e9",
        "dismiss": "Class\u00e9",
        "clear_spoiler": "Spoiler lev\u00e9",
        "ban": "Auteur bloqu\u00e9",
        "unban": "Auteur d\u00e9bloqu\u00e9",
        "ban_reporter": "Signaleur bloqu\u00e9",
        "unban_reporter": "Signaleur d\u00e9bloqu\u00e9",
        "reopen": "Rouvert",
        "auto_hide": "Masqu\u00e9",
        "auto_spoiler": "Marqu\u00e9 spoiler",
        "auto_requeue": "Remis dans la file",
        "unknown": "D\u00e9cision"
      }
    }
  }
};
