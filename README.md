# Balancing Lab

An interactive simulator for static & dynamic balancing of rotating masses — built for engineering students. Add masses to a rotor, drag them to set angle/radius (single plane) or angle/radius/axial position (two planes), and see the live m·r vector polygon, resultant/equilibrant, correction masses, and tabular method update in real time.

Plain HTML/CSS/JS, no build step, no dependencies (besides Google Fonts).

## Files

- `index.html` — page shell
- `style.css` — styling (light theme)
- `app.js` — state, physics/geometry, and rendering

## Run locally

Serve the folder with any static file server, e.g.:

```
python3 -m http.server 8000
```

then open `http://localhost:8000/`.

## Deploy to GitHub Pages

Settings → Pages → Deploy from branch → `main` / `/ (root)`. The site will be served from `index.html` at the repo root — no build step required.

## Embedding

The layout is responsive and designed to be embedded in a VLE via `<iframe>` at a range of widths (down to ~400px).

---

_Design source (Claude Design export, not part of the built app) is kept in `chats/` and `project/` for reference._
