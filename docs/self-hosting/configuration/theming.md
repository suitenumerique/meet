# Theming

Colors, fonts, logos and images change without a rebuild. Only the application title needs a rebuilt image.

## Colors and fonts

### Load your CSS file

Set [`FRONTEND_CUSTOM_CSS_URL`](../../reference/env-variables.md#FRONTEND_CUSTOM_CSS_URL), on the **backend** container, to your CSS file's URL. To serve the file from the frontend container, mount it into `/usr/share/nginx/html` and set the variable to its path:

=== "Docker Compose"

    Add to the `frontend` service's `volumes:` in `compose.yml`:

    ```yaml title="compose.yml"
          - ./custom.css:/usr/share/nginx/html/custom.css:ro
    ```

    Add to `env.d/common`:

    ```dotenv title="env.d/common"
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

    ```yaml title="values.yaml"
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

### What to override

Override the semantic tokens, such as `--colors-primary`, **and** the whole palette scale, such as `--colors-primary-800`: many components read the scale directly. Inside a room Meet uses its dark scale, `--colors-primary-dark-*`: override it too.

The main semantic tokens, defined in [`src/frontend/panda.config.ts`](https://github.com/suitenumerique/meet/blob/main/src/frontend/panda.config.ts):

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
| Font serif | Alternate or reading font | `--fonts-serif` |
| Font mono | Code or technical font | `--fonts-mono` |

### Example: full primary color override

```css title="custom.css"
:root {
  /* Semantic tokens */
  --colors-primary: #00796B;
  --colors-primary-hover: #00695C;
  --colors-primary-active: #004D40;
  --colors-primary-text: #ffffff;
  --colors-primary-subtle: #E0F2F1;
  --colors-primary-subtle-text: #00695C;
  --colors-primary-warm: #80CBC4;

  /* Raw palette scale */
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

```css title="custom.css"
@import url(https://fonts.bunny.net/css?family=Roboto:wght@400;700&display=swap);

:root {
  --fonts-sans: 'Roboto', ui-sans-serif, system-ui, sans-serif;
}
```

## Custom assets (logo, images)

Mount your own file over a built-in one in the frontend container, under `/usr/share/nginx/html/assets`. The landing page carousel shows `1.png` to `3.png`; the recording and transcription panels show `3.png` and `4.png`, and the recording download page `4.png`, all four under `assets/intro-slider/`.

The favicon is six files directly under `/usr/share/nginx/html`:

- `favicon.ico`
- `favicon-16x16.png` and `favicon-32x32.png`
- `apple-touch-icon.png`
- `android-chrome-192x192.png` and `android-chrome-512x512.png`

Mount each file, or `assets/intro-slider/` whole with its four images, never the whole `assets/` directory: that would hide the compiled JS and CSS bundles and break the app.

=== "Docker Compose"

    Add to the `frontend` service's `volumes:` in `compose.yml`:

    ```yaml title="compose.yml"
          - ./custom-assets/logo.svg:/usr/share/nginx/html/assets/logo.svg:ro
          - ./custom-assets/intro-slider:/usr/share/nginx/html/assets/intro-slider:ro
    ```

=== "Kubernetes"

    Store the files in a ConfigMap. Each `--from-file` names the key the mount's `subPath` refers to:

    ```bash
    kubectl -n meet create configmap meet-custom-assets \
      --from-file=logo.svg=./custom-assets/logo.svg \
      --from-file=intro-slider-1.png=./custom-assets/intro-slider/1.png
    ```

    Then mount each key in your `values.yaml`:

    ```yaml title="values.yaml"
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

The `VITE_APP_TITLE` build argument sets the browser tab's title and the installed app's name; without it the title is empty. Build the frontend image from the repository root:

```bash
docker build \
  -f src/frontend/Dockerfile \
  --target frontend-production \
  --build-arg VITE_APP_TITLE="My Custom Meet" \
  -t my-org/meet-frontend:latest .
```

## Footer

The only footer is the French government one, shown with [`FRONTEND_USE_FRENCH_GOV_FOOTER`](../../reference/env-variables.md#FRONTEND_USE_FRENCH_GOV_FOOTER)`=True`.
