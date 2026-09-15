# Documentation Site

This site is built with [Zensical](https://zensical.dev) from the Markdown sources in `docs/`.

## Quick start

Prerequisites: Docker.

1. Edit `compose.yml` - set your domain and adjust the reverse proxy configuration to match your setup.
2. Run:
```
docker run --rm -it -p 8000:8000 -v .:/docs zensical/zensical
```

3. Open your domain. The site auto-builds on first start.

## How it works

- `zensical.toml` - site configuration (name, URL, navigation tree).
- `docs/` - all Markdown source files. Each `.md` becomes a page.
- `site/` - built output, stored as a Docker volume.
- The Zensical image serves the site on port 8000. Place any reverse proxy in front of it for TLS.

!!!warning
    `docs/index.md` is the site's home page. Do not add a `docs/README.md` - Zensical treats both as the source for `index.html`, and which one wins is non-deterministic across builds.

## Editing content

All content lives under `docs/`. Edit `.md` files directly, then rebuild:

    docker compose restart zensical

## Updating Zensical

    docker compose pull && docker compose up -d

## File layout

```
.
├── zensical.toml
├── docs/           ← markdown source files
└── site/           ← built output (volume)
```
