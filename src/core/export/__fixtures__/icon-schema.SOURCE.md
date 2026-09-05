# icon-schema.json — source

- **Repository:** [giginet/apple-icon-composer-skill](https://github.com/giginet/apple-icon-composer-skill)
- **Path:** `plugins/icon-composer/skills/compose-app-icon/scripts/icon-schema.json`
- **Raw URL:** https://raw.githubusercontent.com/giginet/apple-icon-composer-skill/112bf8856783e906419d61cc89af397fa767ee5c/plugins/icon-composer/skills/compose-app-icon/scripts/icon-schema.json
- **Commit:** `112bf8856783e906419d61cc89af397fa767ee5c` (2026-08-25)
- **Retrieved:** 2026-09-05
- **License:** MIT (repository LICENSE)

Community-maintained JSON Schema (draft 2020-12) for Apple Icon Composer `.icon`
package `icon.json` files, covering Icon Composer 1.x plus the Icon Composer 2.0
additions (`features`, `blur-material`, `refractivity`,
`specular-highlight-placement`, whole-object `-specializations`).

Vendored verbatim — do not hand-edit. Used by `iconjson.test.ts` to validate our
generated `icon.json` with ajv.

## Where the schema contradicted the task brief

- The brief's `features` list named `"specular-highlight-placement"`. The schema's
  `features` enum is `["refractivity", "specular-location"]`; we follow the schema
  and emit `"specular-location"`.
- The brief did not mention gradient direction. The schema expresses it as an
  optional `orientation: { start: {x,y}, stop: {x,y} }` sibling of
  `linear-gradient` (normalized 0..1 canvas points), not as an angle. We emit
  `orientation` whenever our gradient angle is not 0 (0 = bottom -> top, the
  Icon Composer default).
- The schema's `blend-mode` enum is a subset of our model's `BlendMode` union;
  modes outside the enum are omitted from `icon.json`.
