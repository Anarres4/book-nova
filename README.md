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
- Stockage 100 % local (AsyncStorage + SecureStore) : aucune donnée personnelle n'est envoyée sur un serveur.
- Notifications uniquement locales (rappel de prêts, encouragement mensuel optionnel).
- RevenueCat gère la synchronisation de l'abonnement premium sans que Book Nova accède à tes informations de paiement.

Offre premium :
- Validations illimitées avec métadonnées, ajouts sans limite quotidienne et exports avancés.
- Limite actuelle en version gratuite : 3 validations enrichies par jour.

## Stack technique
- `Jekyll` pour la génération statique et la configuration via `_config.yml`.
- Layout unique dans `_layouts/default.html` avec CSS inline optimisé et un script JavaScript maison pour la localisation et la gestion du menu mobile.
- `index.html` pilote la landing et s'appuie sur `assets/screenshots/<lang>/` pour afficher les captures localisées.
- `_data/translations.yml` héberge tout le texte marketing et légal en trois langues; le JSON est injecté directement dans la page pour rester statique.
- Bootstrap 5.3 + Bootstrap Icons chargés depuis JSDelivr pour éviter une pipeline front lourde.

## Contact
- Support : `book-nova@outlook.fr`

N'hésite pas à ouvrir une issue pour partager une idée, un bug ou une suggestion de traduction. Merci encore pour ton soutien et bonne lecture !
