# vec2icon

Browser app that turns SVGs into an Apple Icon Composer `.icon` bundle, along 
with some useful editing capabilities. It's obviously recommended to actually 
put the generated icon bundle through Icon Composer to make sure it looks right, 
but this should work well enough for prototyping.

Live instance: [**sebseager.github.io/vec2icon**](https://sebseager.github.io/vec2icon/)

AI Compose can draw an icon from a text description using your own Anthropic API key.
The key stays in your browser and is only ever sent to api.anthropic.com; each run costs
a few cents on your account, and the dialog shows the upper bound before you start.

Everything runs exclusively in the browser (no server-side dependencies). You can 
build it yourself with:

- `pnpm i` — install dependencies
- `pnpm dev` — start the dev server
- `pnpm test` — run the test suite
- `pnpm build` — typecheck and build for production
