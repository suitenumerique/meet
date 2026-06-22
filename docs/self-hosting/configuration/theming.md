# Theming

You can customize the look and feel of LaSuite Meet to match your brand. Two approaches are available:

- **Runtime theming** - load a custom CSS file to override design tokens (colors, fonts, spacing). Changes take effect instantly, no rebuild needed.
- **Build-time theming** - change the application title via a build argument. Requires rebuilding the Docker image.

---

## Runtime theming

### How it works

Set the `FRONTEND_CUSTOM_CSS_URL` environment variable on the **backend** container:

```bash
FRONTEND_CUSTOM_CSS_URL=https://visio6.bebopo.eu/custom.css
```

!!!info 
    If you serve your CSS file on the same domain as Meet, same-origin URLs work too. The backend exposes this URL via `/api/v1.0/config/` as `custom_css_url`, and the frontend injects a `<link>` element into `<head>` at runtime.

The app loads your CSS at runtime by adding a `<link>` element to `<head>`. You can override any CSS variable without rebuilding the frontend.

### Key semantic tokens

These CSS variables control the main visual aspects of the interface:

| Category | Purpose | Example token |
|---|---|---|
| Primary | Brand color, buttons, links | `--colors-primary` |
| Dark mode | Primary color in room/dark mode | `--colors-primary-dark-500` |
| Greyscale | Text, backgrounds, borders | `--colors-greyscale-500` |
| Success | Success states | `--colors-success` |
| Error | Errors and destructive actions | `--colors-error` |
| Warning | Warnings and alerts | `--colors-warning` |
| Alert | Notification backgrounds | `--colors-alert` |
| Font sans | Main UI font | `--fonts-sans` |
| Font serif | Alternate / reading font | `--fonts-serif` |
| Font mono | Code or technical font | `--fonts-mono` |

!!!info 
    See `src/frontend/panda.config.ts` in the Meet repository for all defined semantic tokens.

### What to override

The compiled CSS uses two kinds of CSS variables:

- **Semantic tokens** (e.g. `--colors-primary`) - referenced by some component styles. These are defined at build time inside `@layer tokens` and resolve to a palette token.
- **Raw palette tokens** (e.g. `--colors-primary-800`) - referenced directly by many component styles. You must override these too, otherwise components that use them will keep the default color.

In practice, to fully rebrand the primary color you need to override both the semantic token **and** the full palette scale. Overriding only `--colors-primary` will change some elements but leave others untouched.

### Example: full primary color override

```css
:root {
  /* Semantic tokens */
  --colors-primary: #00796B;
  --colors-primary-hover: #00695C;
  --colors-primary-active: #004D40;
  --colors-primary-text: #ffffff;
  --colors-primary-subtle: #E0F2F1;
  --colors-primary-subtle-text: #00695C;
  --colors-primary-warm: #80CBC4;

  /* Raw palette scale - components reference these directly */
  --colors-primary-50:  #E0F2F1;
  --colors-primary-100: #B2DFDB;
  --colors-primary-200: #80CBC4;
  --colors-primary-300: #4DB6AC;
  --colors-primary-400: #26A69A;
  --colors-primary-500: #009688;
  --colors-primary-600: #00897B;
  --colors-primary-700: #00796B;
  --colors-primary-800: #00695C;
  --colors-primary-900: #004D40;
  --colors-primary-950: #1B1B35;
}
```

### Example: custom font

```css
@import url(https://fonts.bunny.net/css?family=Roboto:wght@400;700&display=swap);

:root {
  --fonts-sans: 'Roboto', ui-sans-serif, system-ui, sans-serif;
}
```

Set `FRONTEND_CUSTOM_CSS_URL` to the URL of this file. The UI will render with Roboto immediately.

### Light and dark mode

Outside a meeting, Meet uses a light theme by default. Inside a room, it switches to dark. Your custom CSS should account for both modes.

---

## Custom assets (logo, images)

You can override built-in assets (logo, landing page images, etc.) by bind-mounting your own files into the frontend container.

Mount your files to:

```
/usr/share/nginx/html/assets
```

Any file you place here overrides the default at runtime. For example, to replace the landing page carousel images:

```
/usr/share/nginx/html/
    └── assets/intro-slider/
        ├── 1.png
        ├── 2.png
        ├── 3.png
        └── 4.png
```

### Docker Compose example

Mount each file individually - do **not** mount the whole `assets/` directory, as that would hide the compiled JS/CSS bundles and break the app.

```yaml
frontend:
  image: lasuite/meet-frontend:latest
  volumes:
    - ./custom-assets/logo.svg:/usr/share/nginx/html/assets/logo.svg:ro
    - ./custom-assets/intro-slider/1.png:/usr/share/nginx/html/assets/intro-slider/1.png:ro
    - ./custom-assets/intro-slider/2.png:/usr/share/nginx/html/assets/intro-slider/2.png:ro
    - ./custom-assets/intro-slider/3.png:/usr/share/nginx/html/assets/intro-slider/3.png:ro
    - ./custom-assets/intro-slider/4.png:/usr/share/nginx/html/assets/intro-slider/4.png:ro
```

### Kubernetes example

```yaml
frontend:
  extraVolumes:
    - name: custom-assets
      configMap:
        name: meet-custom-assets
  extraVolumeMounts:
    - name: custom-assets
      mountPath: /usr/share/nginx/html/assets/logo.svg
      subPath: logo.svg
      readOnly: true
    - name: custom-assets
      mountPath: /usr/share/nginx/html/assets/intro-slider/1.png
      subPath: intro-slider-1.png
      readOnly: true
```

---

## Build-time theming

Some settings require rebuilding the Docker image. The most common one is the application title shown in the browser tab, controlled by the `VITE_APP_TITLE` build argument.

**Default:** `LaSuite Meet`

**Override at build time:**

```bash
docker build \
  --build-arg VITE_APP_TITLE="My Custom Meet" \
  -t my-org/meet:latest .
```

---

## Footer

The footer cannot be fully customized yet. This is a work in progress.

You can enable the official French government footer by setting:

```
FRONTEND_USE_FRENCH_GOV_FOOTER=True
```

Disabled (`False`) by default.
