Drop local images here and they will be imported automatically on build.

Supported folders:

- asset-drop/tiles/grass
- asset-drop/tiles/dirt
- asset-drop/tiles/stone
- asset-drop/tiles/water
- asset-drop/tiles/forest

- asset-drop/objects/house
- asset-drop/objects/pub
- asset-drop/objects/inn
- asset-drop/objects/barn
- asset-drop/objects/stable
- asset-drop/objects/blacksmith
- asset-drop/objects/windmill
- asset-drop/objects/chapel
- asset-drop/objects/market
- asset-drop/objects/manor
- asset-drop/objects/townhall
- asset-drop/objects/tree
- asset-drop/objects/stone
- asset-drop/objects/crate
- asset-drop/objects/well
- asset-drop/objects/ruins
- asset-drop/objects/sign
- asset-drop/objects/chest
- asset-drop/objects/horse
- asset-drop/objects/sheep
- asset-drop/objects/dog
- asset-drop/objects/cat
- asset-drop/objects/sparkmouse
- asset-drop/objects/grass-tuft

- asset-drop/players/local-player
- asset-drop/players/remote-player

- asset-drop/bridges/bridge-v
- asset-drop/bridges/bridge-h
- asset-drop/bridges/bridge-cross
- asset-drop/bridges/bridge-sw
- asset-drop/bridges/bridge-se
- asset-drop/bridges/bridge-nw
- asset-drop/bridges/bridge-ne
- asset-drop/bridges/bridge-t-east
- asset-drop/bridges/bridge-t-west
- asset-drop/bridges/bridge-t-north
- asset-drop/bridges/bridge-t-south

Notes:

- Put png, jpg, jpeg, or webp files into the matching folder.
- Run `npm run build` or `npm run assets:import-local`.
- Similar images are skipped using a local perceptual hash check.
- Imported source files move into `asset-drop/_imported/...`
- Similar skipped source files move into `asset-drop/_similar/...`
