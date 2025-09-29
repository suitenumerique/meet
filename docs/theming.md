
# Theming La Suite Meet

There are two ways to customize LaSuite Meet:

- **Runtime Theming**. You can load a custom CSS file to apply any CSS you want. You can change all design-system tokens through CSS variables: colors, fonts, spacing multipliers, and more.
- **Build-time Theming**. Some additional things, like the app name appearing in the browser tab, can be customized through environment variables that are applied at build-time.


## Runtime Theming

### How to Use

To use this feature, simply set the `FRONTEND_CSS_URL` environment variable to the URL of your custom CSS file. For example:

```javascript
FRONTEND_CSS_URL=https://example.com/custom-style.css
```

> [!TIP]
> If you serve your CSS file on the same domain as LaSuite Meet, paths are supported, i.e. `FRONTEND_CSS_URL=/custom/style.css` will load `https://your-domain.com/custom/style.css`.

Setting this variable makes the app load your CSS at runtime, adding a `<link>` to `<head>` so you can override CSS variables and customize the frontend without rebuilding.


This feature lets you customize the app’s look with any CSS, giving full flexibility and allowing changes to take effect instantly at runtime without touching the code.

### Example Use Case

Let's say you want to change the font of our application to a custom font. You can create a custom CSS file with the following contents:

```css
@import url(https://fonts.bunny.net/css?family=Roboto:wght@400;700&display=swap);

:root {
  --fonts-sans: 'Roboto', ui-sans-serif, system-ui, sans-serif;
}
```

Then, set the `FRONTEND_CSS_URL` environment variable to the URL of your custom CSS file. Once you've done this, our application will load your custom CSS file and apply the styles, changing the default font to the one you specified.

> [!IMPORTANT]
> You can override any CSS token—semantic or palette. See [panda.config.ts](../src/frontend/panda.config.ts) for all defined semantic tokens.
> The app does **not provide separate light/dark themes**: outside a meeting it defaults to light, and in a room it switches to dark.
 

### Key Semantic Tokens

These control the main visual aspects of the interface:

| Category   | Purpose                         | Example Token               |
| ---------- | ------------------------------- | --------------------------- |
| Primary    | Brand color, buttons, links     | `--colors-primary`          |
| Dark Mode  | Primary color in room/dark mode | `--colors-primary-dark-500` |
| Greyscale  | Text, backgrounds, borders      | `--colors-greyscale-500`    |
| Success    | Success states                  | `--colors-success`          |
| Error      | Errors and destructive actions  | `--colors-error`            |
| Warning    | Warnings and alerts             | `--colors-warning`          |
| Alert      | Notification backgrounds        | `--colors-alert`            |
| Font Sans  | Main UI font                    | `--fonts-sans`              |
| Font Serif | Alternate/reading font          | `--fonts-serif`             |
| Font Mono  | Code or technical font          | `--fonts-mono`              |


### Assets (Logo, Images)

You can override built-in assets (such as the logo or images) by mounting your own files into the container.
Simply bind-mount your custom assets to the following path inside the container:

```
/usr/share/nginx/html/assets
```

Any files you mount here will **override the defaults at runtime**.

For example, to replace the images used in the landing page carousel, provide your own versions with the same filenames and paths:

```
/usr/share/nginx/html/
    └── assets/intro-slider/
        ├── 1.png
        ├── 2.png
        ├── 3.png
        └── 4.png
```


## Build-Time Theming

Some settings cannot be applied at runtime and require rebuilding the Docker image.
One key example is the **application title and name**, controlled by the `VITE_APP_TITLE` build argument.

* **Default:** `La Suite Meet`
* **Override:** supply your own value at build time

```bash
docker build \
  --build-arg VITE_APP_TITLE="My Custom Meet" \
  -t my-org/meet:latest .
```

```dockerfile
# Dockerfile
ARG VITE_APP_TITLE="La Suite Meet"
ENV VITE_APP_TITLE=${VITE_APP_TITLE}
```

For a real-world example, see how DINUM rebuilds the frontend to match their branding:
[DINUM Dockerfile](../docker/dinum-frontend/Dockerfile)

----

# **Footer Configuration**

The footer cannot be customized yet. This is a work in progress, and we welcome contributions — feel free to open a pull request if you’d like to help add this feature.

You can enable the official French government footer by setting the environment variable `FRONTEND_USE_FRENCH_GOV_FOOTER` to true. This option is disabled (false) by default.

