# Theming

Colors, fonts, logos and images change without a rebuild. Only the application title needs a rebuilt image.

## Colors and fonts

[`custom.css`](https://github.com/suitenumerique/meet/blob/main/docs/examples/meet/custom.css) is a theme to edit in place: a teal primary color, and a font to uncomment. Download it; on Docker Compose, from `~/docker/meet`:

```bash
RAW="https://raw.githubusercontent.com/suitenumerique/meet/refs/heads/main"
curl -fsSL -O $RAW/docs/examples/meet/custom.css
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

In `custom.css`, put your colors in place of the teal ones. For the font, uncomment the `@import` line and `--fonts-sans`, then name your font in both.

### Load your CSS file

Set [`FRONTEND_CUSTOM_CSS_URL`](../../reference/env-variables.md#FRONTEND_CUSTOM_CSS_URL), on the **backend** container, to your CSS file's URL. To serve the file from the frontend container, mount it into `/usr/share/nginx/html` and set the variable to its path:

=== "Docker Compose"

    Uncomment the `custom.css` line in the `frontend` service's `volumes:` of `compose.yml`, and [`FRONTEND_CUSTOM_CSS_URL`](../../reference/env-variables.md#FRONTEND_CUSTOM_CSS_URL) in `env.d/common`:

    ```bash
    docker compose up -d --force-recreate frontend backend
    ```

=== "Kubernetes"

    Store the file in a ConfigMap:

    ```bash
    kubectl -n meet create configmap meet-custom-css --from-file=custom.css
    ```

    Then, in your `values.yaml`, uncomment `FRONTEND_CUSTOM_CSS_URL` in `backend.envVars`, and under `frontend` uncomment `extraVolumes`, `extraVolumeMounts` and their `custom-css` entries.

## Custom assets (logo, images)

Mount your own file over a built-in one in the frontend container, under `/usr/share/nginx/html/assets`. The landing page carousel shows `1.png` to `3.png`; the recording and transcription panels show `3.png` and `4.png`, and the recording download page `4.png`, all four under `assets/intro-slider/`.

The favicon is six files directly under `/usr/share/nginx/html`:

- `favicon.ico`
- `favicon-16x16.png` and `favicon-32x32.png`
- `apple-touch-icon.png`
- `android-chrome-192x192.png` and `android-chrome-512x512.png`

Mount each file, or `assets/intro-slider/` whole with its four images, never the whole `assets/` directory: that would hide the compiled JS and CSS bundles and break the app.

=== "Docker Compose"

    Put your files in `~/docker/meet/custom-assets/`, then uncomment their two lines in the `frontend` service's `volumes:` of `compose.yml`, for `logo.svg` and for `intro-slider/`.

=== "Kubernetes"

    Store the files in a ConfigMap. Each `--from-file` names the key the mount's `subPath` refers to:

    ```bash
    kubectl -n meet create configmap meet-custom-assets \
      --from-file=logo.svg=./custom-assets/logo.svg \
      --from-file=intro-slider-1.png=./custom-assets/intro-slider/1.png
    ```

    Then, under `frontend` in your `values.yaml`, uncomment `extraVolumes`, `extraVolumeMounts` and their `custom-assets` entries, which mount the two keys above. Each further key takes one more mount.

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
