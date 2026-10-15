# Map data

Simplified from [Natural Earth](https://www.naturalearthdata.com/) 1:10m (public domain):

- `india.geojson` – India from `ne_10m_admin_0_countries_ind` (India's point of view, so the borders match India's official map).
- `india_state_lines.geojson` – internal state boundaries from `ne_10m_admin_1_states_provinces`.
- `neighbours.geojson` – neighbouring countries for context, clipped to the map frame.

Rebuilt with mapshaper (`-simplify 3–4% keep-shapes`). `python scripts/build-india-map.py` projects them into `web/lib/india-map.ts`.
