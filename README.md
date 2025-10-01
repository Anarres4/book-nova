# Book Nova

## Merci d'etre la
Merci d'avoir pris le temps de decouvrir Book Nova jusqu'au README. Ton interet compte beaucoup pour ce projet indie qui veut rendre la gestion de bibliotheque plus simple, plus belle et plus respectueuse de tes donnees.

## Ce que propose ce site
- Une landing page multilingue (FR, EN, ES) avec un hero, les fonctionnalites cle et un carrousel de screenshots pour montrer l'application.
- Un rappel clair que les versions iOS et Android arrivent bientot via un modal "Disponible bientot".
- Des pages legales dediees (`privacy.html`, `terms.html`, `support.html`, `thanks.html`) alimentees par les memes traductions afin de garder un ton coherent.
- Un theme personnalise dans `_layouts/default.html` qui applique le gradient signature Book Nova et un menu responsive avec bascule de langue.

## L'application mobile Book Nova
Book Nova est l'application compagnon du site : une bibliotheque personnelle dans ta poche. Objet principal : te donner une vue claire et enthousiaste de tes lectures, sans siphonner tes donnees.

Fonctionnalites majeures :
- Scanner ou saisir des ISBN pour enrichir automatiquement les fiches via ISBNdb.
- Organiser ta collection par statuts, genres ou envies, avec suivi de progression et badges de motivation.
- Visualiser la hauteur de ta pile de livres en fonction de ta taille pour garder la motivation.
- Suivre les prets et emprunts pour ne plus perdre la trace de tes livres.
- Obtenir des statistiques detaillees sur ton rythme de lecture.
- Choisir la langue de l'interface (FR/EN/ES) et un theme clair ou sombre.

Respect des donnees :
- Stockage 100 % local (AsyncStorage + SecureStore) : aucune donnee personnelle n'est envoyee sur un serveur.
- Notifications uniquement locales (rappel de prets, encouragement mensuel optionnel).
- RevenueCat gere la synchronisation de l'abonnement premium sans que Book Nova accede a tes informations de paiement.

Offre premium :
- Validations illimitees avec metadonnees, ajouts sans limite quotidienne et exports avances.
- Limite actuelle en version gratuite : 3 validations enrichies par jour.

## Stack technique
- `Jekyll` pour la generation statique et la configuration via `_config.yml`.
- Layout unique dans `_layouts/default.html` avec CSS inline optimise et un script JavaScript maison pour la localisation et la gestion du menu mobile.
- `index.html` pilote la landing et s'appuie sur `assets/screenshots/<lang>/` pour afficher les captures localisees.
- `_data/translations.yml` heberge tout le texte marketing et legal en trois langues; le JSON est injecte directement dans la page pour rester statique.
- Bootstrap 5.3 + Bootstrap Icons charges depuis JSDelivr pour eviter une pipeline front lourde.

## Contact
- Support : `book-nova@outlook.fr`

N'hesite pas a ouvrir une issue pour partager une idee, un bug ou une suggestion de traduction. Merci encore pour ton soutien et bonne lecture !
