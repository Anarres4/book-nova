# TikTok Pixel - Documentation

## Vue d'ensemble

Le pixel TikTok est installé sur le site Book Nova pour tracker le comportement des visiteurs web. Il est utile pour :
- Mesurer le trafic organique du site
- Créer des audiences de retargeting sur TikTok Ads
- Créer des audiences similaires (lookalike) basées sur les visiteurs
- Tracker les clics vers les stores (App Store / Google Play)

> **Important** : le pixel web ne track PAS les installations issues des pubs TikTok. Les pubs app install envoient les utilisateurs directement au store, sans passer par le site. Le tracking des conversions pub se fait via les événements app (SDK TikTok / MMP).

## Configuration

- **Pixel ID** : `D4SPNBRC77U5FES2MNQ0`
- **Fichier** : `_layouts/default.html` (en bas, avant `</body>`)
- **Chargement** : différé via `window.addEventListener('load', ...)` pour ne pas impacter les performances

## Événements

### Événements automatiques (gérés par TikTok)

Ces événements sont détectés automatiquement par le script TikTok `events.js`, sans code custom. Ils apparaissent dans le dashboard avec la méthode **Créateur d'événements** :

| Événement | Code | Description |
|---|---|---|
| Consultation page d'accueil | `LandingPageView` | Première page d'une session visiteur |
| Session engagée | `EngagedSession` | Le visiteur est resté un moment ou a interagi |
| Clic sur un bouton | `ClickButton` | Clic sur n'importe quel bouton/lien (sans détail) |

**Détail des événements TikTok automatiques :**

- **`LandingPageView`** — Déclenché une seule fois lorsqu'un visiteur arrive sur le site (première page de la session). Permet de compter le nombre de visiteurs uniques par session. Si un visiteur consulte 5 pages, il y aura 5 `Pageview` mais 1 seul `LandingPageView`.

- **`EngagedSession`** — Déclenché quand le visiteur montre un engagement réel : il reste suffisamment longtemps sur la page, scrolle, ou interagit avec un élément. Les visiteurs qui quittent immédiatement (rebond) ne déclenchent pas cet événement. C'est un bon indicateur de la qualité du trafic.

- **`ClickButton`** (automatique) — Déclenché à chaque clic sur un `<button>` ou un lien `<a>` de la page. Inclut tous les clics sans distinction : boutons stores, changement de thème, changement de langue, liens du footer, etc. Aucun paramètre n'est envoyé, on ne sait pas quel bouton a été cliqué. C'est pourquoi on a ajouté un événement custom `ClickButton` avec `content_type` pour distinguer les clics stores.

### Événements custom (notre code)

Ces événements sont déclenchés par notre code dans `_layouts/default.html`. Ils apparaissent dans le dashboard avec la méthode **Code personnalisé** :

| Événement | Code | Paramètres | Déclencheur |
|---|---|---|---|
| Vue de la page | `Pageview` | — | `ttq.page()` au chargement de chaque page |
| Clic App Store | `ClickButton` | `content_type: "App Store iOS"`, `content_id: "ios_store_button"` | Clic sur un lien `apps.apple.com` |
| Clic Google Play | `ClickButton` | `content_type: "Google Play Android"`, `content_id: "android_store_button"` | Clic sur un lien `play.google.com` |

> **Note** : l'événement `ClickButton` existe en double — un automatique (tous les clics, sans paramètres) et un custom (clics stores uniquement, avec `content_type` et `content_id`). On les distingue dans le dashboard par la colonne **Méthode de configuration**.

## Dashboard TikTok Ads

Pour voir les données :
1. Aller dans **Ressources** > **Événements** > **Gestion des événements web**
2. Cliquer sur le pixel `D4SPNBRC77U5FES2MNQ0`
3. Cliquer **Afficher les données** à côté d'un événement pour voir les paramètres détaillés

Le score **EMQ** (Event Match Quality) indique la qualité du matching événement/utilisateur TikTok (0-100). Un score bas (~29) est normal pour un pixel web sans données utilisateur (email, téléphone).

## Événements App (hors pixel web)

Les événements app sont séparés du pixel web et trackent les actions dans l'application mobile :

| Événement | Description | Usage |
|---|---|---|
| `start_trial` | L'utilisateur démarre un essai premium | Conversion idéale (besoin de volume ~50/semaine) |
| `active_register` | Inscription active | Bon candidat intermédiaire pour l'optimisation AEO |
| `launch_app` / `app_launch` | Ouverture de l'app | Trop haut dans le funnel pour optimiser dessus |
| `onboarding_favorite_genres` | L'utilisateur choisit ses genres favoris | Signal d'engagement post-install |

## Pixel web vs Événements app

| | Pixel web | Événements app |
|---|---|---|
| **Où** | Site web (`book-nova.com`) | Application mobile |
| **Track** | Visites, clics, engagement web | Installations, trials, usage |
| **Utile pour** | Retargeting, audiences lookalike | Optimisation campagnes app install |
| **Parcours pub TikTok** | Non impliqué (pub → store direct) | Directement impliqué |

## Développement local

Le pixel s'active aussi en local (`localhost` / `127.0.0.1`). Les événements envoyés depuis un serveur de dev polluent les stats de production. Pour tester sans polluer, utiliser TikTok Pixel Helper (extension Chrome) qui montre les événements sans les envoyer, ou accepter une légère pollution pendant les tests.
