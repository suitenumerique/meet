# Documentation Site

This site is built with [Zensical](https://zensical.dev) from the Markdown sources in `docs/`.

## Quick start

Prerequisites: Docker.

From the repository root:

```bash
docker run --rm -it -p 8000:8000 -v .:/docs zensical/zensical
```

Open `http://localhost:8000`. The site auto-builds on first start.

## How it works

- `zensical.toml` - site configuration (name, URL, navigation tree).
- `docs/` - all Markdown source files. Each `.md` becomes a page.
- The container serves the site on port 8000. Place a reverse proxy in front of it for TLS in production.

!!!warning
    `docs/index.md` is the site's home page. Do not add a `docs/README.md` - Zensical treats both as the source for `index.html`, and which one wins is non-deterministic across builds.

## Editing content

All content lives under `docs/`. Edit `.md` files directly - the running container picks up changes automatically.

## Updating Zensical

```bash
docker pull zensical/zensical
```

Then re-run the `docker run` command above.

## File layout

```
.
├── zensical.toml
└── docs/           ← markdown source files
```
