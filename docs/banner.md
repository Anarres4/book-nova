# Bannière de statut (Status Banner)

## Description

Bannière d'alerte sticky affichée en haut du site, sous la navbar. Elle sert à communiquer des messages importants aux utilisateurs (incidents, mises à jour, annonces).

> **État actuel** : la bannière est **désactivée** (HTML et JS commentés dans `_layouts/default.html`). Le CSS et les traductions sont conservés.

## Fichiers concernés

| Fichier | Rôle |
|---------|------|
| `_layouts/default.html` | Structure HTML + logique JS |
| `assets/css/main.css` | Styles (lignes ~3872-4034) |
| `_data/translations.yml` | Traductions (fr, en, es) |

## Structure HTML

```html
<div class="status-banner" id="statusBanner" role="status">
  <div class="status-banner__inner">
    <span class="status-banner__pulse"></span>    <!-- point pulsant -->
    <svg class="status-banner__icon">...</svg>     <!-- icône outil -->
    <p class="status-banner__text" data-i18n="banner.message">...</p>
    <button class="status-banner__close" id="dismissBanner">✕</button>
  </div>
</div>
```

## Fonctionnalités

- **Sticky** : reste visible sous la navbar (`top: 68px`, `z-index: 1055`)
- **Glassmorphism** : fond semi-transparent avec `backdrop-filter: blur(14px)`
- **Animations** : entrée (`bannerSlideIn`) et sortie (`bannerSlideOut`)
- **Point pulsant** : animation infinie pour attirer l'attention
- **i18n** : texte traduit en français, anglais et espagnol via `translations.yml`
- **Thème** : styles adaptés pour le mode clair (`.theme-light`) et sombre
- **Responsive** : icône masquée et tailles réduites sous 768px
- **Accessibilité** : `role="status"`, `aria-label` sur le bouton fermer

## Persistance du dismiss

Quand l'utilisateur ferme la bannière, une clé est enregistrée dans le `localStorage` :

```js
localStorage.setItem('bannerDismissed', 'api-feb2025');
```

Au chargement de la page, si cette clé existe, la bannière est supprimée du DOM.

## Réactiver la bannière

La bannière est actuellement commentée. Pour la remettre en service :

1. **Décommenter le HTML** dans `_layouts/default.html` — retirer `<!--` et `-->` autour du bloc `<div class="status-banner">`
2. **Décommenter le JS** dans le même fichier — retirer les `//` devant le bloc `statusBanner`
3. **Modifier le message** dans `_data/translations.yml` sous la clé `banner.message` :
   ```yaml
   fr:
     banner:
       message: "Votre nouveau message ici."
       dismiss: "Fermer"
   ```
4. **Changer la clé localStorage** dans le JS pour invalider les anciens dismiss :
   ```js
   // Remplacer l'ancienne valeur par une nouvelle unique
   localStorage.getItem('bannerDismissed') === 'maintenance-mar2026'
   ```

### Reset en local (dev)

Si la bannière a été fermée dans le navigateur et n'apparaît plus, supprimer la clé localStorage :

1. Ouvrir les **DevTools** (`F12`)
2. Console → exécuter :
   ```js
   localStorage.removeItem('bannerDismissed');
   ```
3. Recharger la page

> **Astuce** : on peut aussi vider tout le stockage via DevTools → Application → Storage → Clear site data.
