# Book Nova

## Merci d'être là
Merci d'avoir pris le temps de découvrir Book Nova jusqu'au README. Ton intérêt compte beaucoup pour ce projet indie qui veut rendre la gestion de bibliothèque plus simple, plus belle et plus respectueuse de tes données.

## Ce que propose ce site
- Une landing page multilingue (FR, EN, ES), les fonctionnalités clé et un carrousel de screenshots pour montrer l'application.
- Des pages légales dédiées (privacy.html, terms.html, support.html) alimentées par les mêmes traductions afin de garder un ton cohérent.
- Un thème personnalisé dans _layouts/default.html qui applique le gradient signature Book Nova et un menu responsive avec bascule de langue.

## L'application mobile Book Nova
Book Nova est l'application compagnon du site : une bibliothèque personnelle dans ta poche. Objet principal : te donner une vue claire et enthousiaste de tes lectures, sans siphonner tes données.

Fonctionnalités majeures :
- Scanner ou saisir des ISBN pour enrichir automatiquement les fiches via ISBNdb.
- Organiser ta collection par statuts, genres ou envies, avec suivi de progression et badges de motivation.
- Visualiser la hauteur de ta pile de livres en fonction de ta taille pour garder la motivation.
- Suivre les prêts et emprunts pour ne plus perdre la trace de tes livres.
- Obtenir des statistiques détaillées sur ton rythme de lecture.
- Choisir la langue de l'interface (FR/EN/ES) et un thème clair ou sombre.

Respect des données :
- Bibliothèque stockée sur le téléphone (AsyncStorage + SecureStore). Ce qui part sur un serveur ou chez un prestataire est détaillé dans la [politique de confidentialité](https://book-nova.com/privacy/).
- Notifications locales (rappels de prêt et d'emprunt, encouragement mensuel, fin de l'essai gratuit) et à distance (rappels et annonces).
- RevenueCat gère la synchronisation de l'abonnement premium sans que Book Nova accède à tes informations de paiement.

Offre premium :
- Validations illimitées avec métadonnées, ajouts sans limite quotidienne et exports avancés.
- Limite actuelle en version gratuite : 4 livres ajoutés par jour, sans plafond de livres au total.

## Stack technique
- `Jekyll` pour la génération statique et la configuration via `_config.yml`.
- Layout unique dans `_layouts/default.html` avec CSS inline optimisé et un script JavaScript maison pour la localisation et la gestion du menu mobile. Seule exception : la page de l'outil de modération, sans layout (voir plus bas).
- `index.html` pilote la landing et s'appuie sur `assets/screenshots/<lang>/` pour afficher les captures localisées.
- `_data/translations.yml` héberge tout le texte marketing et légal en trois langues; le JSON est injecté directement dans la page pour rester statique.
- Bootstrap 5.3 + Bootstrap Icons chargés depuis JSDelivr pour éviter une pipeline front lourde.

## Outil de modération
La version web de l'outil de modération des avis publics de l'app (lot C7), pour modérer depuis un ordinateur : la boîte de réception « À traiter » et « Traités », une fiche par cas avec sa question et ses deux réponses, « ⋯ » pour les autres décisions, le bandeau de 6 secondes avec « Annuler », la fenêtre « Ce cas a changé » et la recherche d'un avis par titre, auteur et quelques mots. En français seulement.

Les fichiers :
- `moderation.html` : la page. Son adresse, improbable, est dans son front matter ; le dépôt étant public, elle ne protège rien.
- `assets/js/moderation/moderation.js` : l'écran, porté de `app/screens/ModerationScreen.tsx` et de ses composants (chaque fonction porte le nom de celle qu'elle reprend).
- `assets/js/moderation/firebase-bridge.js` : la connexion Google et les appels aux fonctions des avis.
- `assets/js/moderation/app-logic.js` : **généré**, jamais modifié à la main (voir ci-dessous).
- `assets/css/moderation.css`, le bloc `moderation` de `_config.yml` (la configuration web Firebase de la PROD, publique par nature) et `_tools/sync-moderation-logic.mjs`.

La sécurité :
- C'est le serveur qui décide qui modère : `listModerationQueue` et `moderateReview` refusent tout compte absent du secret `MODERATOR_UIDS`. La page ne vérifie rien elle-même, et ne contient ni mot de passe, ni clé de compte de service.
- Connexion avec un compte Google (sa validation en deux étapes protège l'accès). La session n'est gardée qu'en mémoire : fermer ou recharger la page déconnecte. Rien dans le stockage du navigateur, que les scripts tiers des autres pages du site (même origine) pourraient lire.
- La page refuse de démarrer si une autre page l'a ouverte (`window.open`) : celle-ci garderait la main sur elle.
- La page n'utilise pas le layout du site, qui charge le pixel TikTok : elle affiche des données personnelles (nom, e-mail et précisions des signaleurs). Elle est en `noindex`, hors du sitemap et en une seule langue (pas de copie `/en/` ni `/es/`). Elle n'est surtout pas dans `robots.txt`, qui publierait son adresse.
- Une politique de sécurité (CSP) stricte : scripts du site et du SDK Firebase seulement, aucun script ni style en ligne, images de couverture des seuls hôtes de l'app (`coverHosts` de `_config.yml`). Les textes du serveur entrent dans la page comme du texte, jamais comme du HTML, sans les caractères qui inversent le sens du texte.
- Elle refuse de s'afficher dans un cadre. GitHub Pages n'envoie pas d'en-têtes, et `frame-ancestors` est ignoré dans une CSP posée par `<meta>` : la feuille de style cache la page tant que le script n'a pas vérifié qu'elle est la fenêtre principale, et Firebase ne démarre qu'à cette condition.

La logique vient de l'app, compilée et non recopiée : les questions et réponses de chaque cas, l'« Annuler », l'horloge des 24 h, le contrôle de version d'un cas, la clé de livre et les textes. `_tools/sync-moderation-logic.mjs` compile les fichiers purs de l'app (ceux que son Jest teste) dans `app-logic.js`, dont l'en-tête cite le dernier commit de chaque source :

```
node _tools/sync-moderation-logic.mjs            # régénère app-logic.js depuis l'app (../react_native/Book Nova)
node _tools/sync-moderation-logic.mjs --check    # échoue si app-logic.js ne correspond plus aux sources de l'app
```

Le relancer après tout changement de ces sources dans l'app, et avant chaque commit qui touche la page. La CI ne peut pas le faire : elle n'a pas accès à l'app.

Tester en local, sur le projet Firebase de DEV :
1. Copier `_config.dev.example.yml` en `_config.dev.yml` et le remplir (le fichier est ignoré par git).
2. `bundle exec jekyll serve --config _config.yml,_config.dev.yml`, puis ouvrir l'adresse de la page sur `localhost:4000`. Un bandeau orange rappelle qu'elle vise DEV.
3. `bundle exec jekyll serve` seul sert la PROD, avec un bandeau rouge.

La configuration DEV n'est jamais publiée, et trois verrous y veillent : elle n'existe que dans `_config.dev.yml`, ignoré par git ; la CI refuse de publier un site où figure un identifiant Firebase autre que ceux de la PROD (elle ne connaît que ceux-là, et n'affiche que des noms de fichiers) ; publiée par erreur, la page refuserait de démarrer sur un autre projet que la PROD.

Ajouter un compte modérateur (son uid dans `MODERATOR_UIDS`, puis le redéploiement ciblé des fonctions des avis) : voir le § 6.5 de `docs/ideas/AVIS_COMMUNAUTE.md`, dans le dépôt de l'app.

## Contact
- Support : `book-nova@outlook.fr`

N'hésite pas à ouvrir une issue pour partager une idée, un bug ou une suggestion de traduction. Merci encore pour ton soutien et bonne lecture !
