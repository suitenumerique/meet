# Theming

Meet can carry your brand in two ways:

- **Runtime theming**: a CSS file of your own overrides the design tokens, the CSS variables holding Meet's colors, fonts and spacing. Changes apply on the next page load, with no rebuild. Logos and images are replaced at runtime too, by [mounting files](#custom-assets-logo-images).
- **Build-time theming**: the application title is a build argument, so changing it means rebuilding the Docker image.

## Runtime theming

### Load your CSS file

Set `FRONTEND_CUSTOM_CSS_URL` on the **backend** container to the URL of your CSS file.

The frontend container can serve the file itself: mount it into the frontend's web root, `/usr/share/nginx/html`, and point the variable at its path:

=== "Docker Compose"

    Add to the `frontend` service's `volumes:` in `compose.yml`:

    ```yaml
          - ./custom.css:/usr/share/nginx/html/custom.css:ro
    ```

    Add to `env.d/common`:

    ```dotenv
    FRONTEND_CUSTOM_CSS_URL=/custom.css
    ```

    ```bash
    docker compose up -d --force-recreate frontend backend
    ```

=== "Kubernetes"

    Store the file in a ConfigMap:

    ```bash
    kubectl -n meet create configmap meet-custom-css --from-file=custom.css
    ```

    Then mount it and set the variable in your `values.yaml`:

    ```yaml
    frontend:
      extraVolumes:
        - name: custom-css
          configMap:
            name: meet-custom-css
      extraVolumeMounts:
        - name: custom-css
          mountPath: /usr/share/nginx/html/custom.css
          subPath: custom.css
          readOnly: true

    backend:
      envVars:
        FRONTEND_CUSTOM_CSS_URL: "/custom.css"
    ```

A file on another host works too, with its full URL, for example `https://cdn.example.com/custom.css`.

### What to override

The compiled CSS uses two kinds of CSS variables:

- **Semantic tokens**, such as `--colors-primary`, used by some component styles. They are defined at build time inside `@layer tokens` and resolve to the preset blue palette: `--colors-primary` is `--colors-blue-700`.
- **Raw palette tokens**, such as `--colors-primary-800`, used directly by many component styles.

To rebrand the primary color fully, override the semantic tokens **and** the whole palette scale. Overriding only `--colors-primary` leaves every component that uses the scale in the default color. Meet is light outside a meeting and dark inside a room, where it uses its own scale, `--colors-primary-dark-*`: override that scale too.

### Key semantic tokens

| Category | Purpose | Example token |
|---|---|---|
| Primary | Brand color, buttons, links | `--colors-primary` |
| Dark mode | Primary color inside a room | `--colors-primary-dark-500` |
| Greyscale | Text, backgrounds, borders | `--colors-greyscale-500` |
| Success | Success states | `--colors-success` |
| Danger | Errors and destructive actions | `--colors-danger` |
| Warning | Warnings and alerts | `--colors-warning` |
| Alert | Notification backgrounds | `--colors-alert` |
| Font sans | Main UI font | `--fonts-sans` |
| Font serif | Alternate / reading font | `--fonts-serif` |
| Font mono | Code or technical font | `--fonts-mono` |

!!! info
    Every semantic token is defined in [`src/frontend/panda.config.ts`](https://github.com/suitenumerique/meet/blob/main/src/frontend/panda.config.ts).

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
  --colors-primary-950: #003D33;
}
```

### Example: custom font

```css
@import url(https://fonts.bunny.net/css?family=Roboto:wght@400;700&display=swap);

:root {
  --fonts-sans: 'Roboto', ui-sans-serif, system-ui, sans-serif;
}
```

## Custom assets (logo, images)

To replace a built-in asset, such as the logo or a landing page image, mount your own file over it in the frontend container, under `/usr/share/nginx/html/assets`. The landing page carousel images, for example, are:

```
/usr/share/nginx/html/
    └── assets/intro-slider/
        ├── 1.png
        ├── 2.png
        ├── 3.png
        └── 4.png
```

Mount each file individually. Mounting the whole `assets/` directory would hide the compiled JS and CSS bundles and break the app.

=== "Docker Compose"

    Add to the `frontend` service's `volumes:` in `compose.yml`:

    ```yaml
          - ./custom-assets/logo.svg:/usr/share/nginx/html/assets/logo.svg:ro
          - ./custom-assets/intro-slider/1.png:/usr/share/nginx/html/assets/intro-slider/1.png:ro
          - ./custom-assets/intro-slider/2.png:/usr/share/nginx/html/assets/intro-slider/2.png:ro
          - ./custom-assets/intro-slider/3.png:/usr/share/nginx/html/assets/intro-slider/3.png:ro
          - ./custom-assets/intro-slider/4.png:/usr/share/nginx/html/assets/intro-slider/4.png:ro
    ```

=== "Kubernetes"

    Store the files in a ConfigMap. Each `--from-file` names the key the mount's `subPath` refers to:

    ```bash
    kubectl -n meet create configmap meet-custom-assets \
      --from-file=logo.svg=./custom-assets/logo.svg \
      --from-file=intro-slider-1.png=./custom-assets/intro-slider/1.png
    ```

    Then mount each key in your `values.yaml`:

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

## Build-time theming

The title in the browser tab, also the installed app's name, comes from the `VITE_APP_TITLE` build argument, `LaSuite Meet` by default. To change it, build the frontend image from the repository root:

```bash
docker build \
  -f src/frontend/Dockerfile \
  --target frontend-production \
  --build-arg VITE_APP_TITLE="My Custom Meet" \
  -t my-org/meet-frontend:latest .
```

[`docker/dinum-frontend/Dockerfile`](https://github.com/suitenumerique/meet/blob/main/docker/dinum-frontend/Dockerfile) is a real-world example.

## Footer

The footer cannot be fully customized. `FRONTEND_USE_FRENCH_GOV_FOOTER=True` shows the official French government footer, see [Environment Variables: Frontend](../../reference/env-variables.md#frontend).
