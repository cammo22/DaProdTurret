# v0.3 Meshy assets — replacement Tesla and airstrike bomber

## v0.3 delivered artifacts

Two new `meshy-6-lite` assets were generated with exactly **2 preview + 2 PBR refine jobs**. All four exact task readbacks returned `SUCCEEDED`. Actual provider `consumed_credits`: **5 + 10 per asset, 30 total**, within the separate **40-credit** batch cap. No duplicate submissions, paid remesh calls or extra candidate jobs were made. Current official Text-to-3D and pricing documentation was fetched before submission.

| Asset | Relative file under `public/` | Triangles | Bytes | Meshes/materials | Credits |
|---|---|---:|---:|---|---:|
| Replacement dual-Tesla | `assets/fleet/tesla.glb` | 10,159 | 1,327,392 | 1 / 1 | 15 |
| Airstrike bomber | `assets/fleet/bomber.glb` | 10,468 | 1,371,456 | 1 / 1 | 15 |

| Asset | Preview task | PBR refine task |
|---|---|---|
| Tesla | `01a17f06-346c-70db-9bd1-abeed753e97e` | `01a17f07-4adc-74ac-851b-a0cb2a089cea` |
| Bomber | `01a17f06-346d-76e4-a747-efba9cb319cf` | `01a17f06-f220-704b-8fdb-b48a86aa7780` |

SHA-256:
- Tesla: `2ddc4d571a584490d5bbfb6c260f85eb962a0db5590413e12b263a0948ed866a`
- Bomber: `73e2dc183708b0546bfbfdafa0f6466849f23705d6e683b30ece99531566235a`

`manifest.json` now contains **9 active GLBs**, totaling **45,334 triangles / 7,179,288 bytes**. Lifetime generation spending is **150 credits / 20 jobs**, including the superseded v0.2 Tesla; active asset provenance accounts for135 credits. The original160 authorization and new40 cap are distinct batch records, not a new generation allowance. Full prior Tesla provenance/hash/parameters are preserved in `assetHistory.tesla`; its old provider thumbnails are preserved as `previews/tesla-v02*.png`.

### Visual acceptance and limitations

- **Tesla:** clearly separated twin upright copper coils, blue-cyan glossy electrode caps and compact dark metal circular pedestal. No long cannon barrel. Provider produced a short central cable/socket rather than the fully requested horizontal discharge fork; caps are not emissive glass. The integral pedestal belongs to the rigid rotating head, not a separate sea platform. Game-owned arcs/glow can supply the electrical effect; that integration is not claimed here.
- **Bomber:** readable fuselage/cockpit, twin engine nacelles, wings and orange tail accents. The raw provider airframe had asymmetric crossed-looking wings. The coherent half was clipped at its centerline and mirrored with preserved UVs/materials, producing a symmetric **swept-wing/canard, jet-like strike aircraft**, not an exact conventional straight-wing propeller patrol bomber. Beige/orange dominates; olive green is limited mainly to nacelles/panels. Obvious generated pseudo-letter decals were locally removed from the base texture; incidental texture noise may remain.
- Both are **+Y up, +Z forward**, baked into positions/normals. Bomber originally faced-X. Do not apply an extra-X correction. Normalize by manifest bounds; units and origin are arbitrary. These are rigid single meshes without articulated parts or animation rigs.
- Requested target was10,000 triangles each; actual remeshed counts vary slightly. Bomber symmetry cleanup yielded10,468 triangles. Three embedded provider PBR images per model were reduced from2K to1024px JPEG quality86. No external buffer/image URI, compressed geometry decoder or credential is required at runtime.

### Verification performed for these two files

1. Parsed actual shipping GLB headers/chunks: valid GLB2, exact declared byte length, valid buffer-view ranges, finite decoded positions and no required compression extensions.
2. Independently counted decoded triangles, meshes/materials, bounds, sizes and SHA-256; details are recorded in the manifest. Native loader bounds agree within1e-6 float32 packing tolerance.
3. Loaded both shipping files through the project's installed `three/addons/loaders/GLTFLoader.js` in headless Chromium: **2 successful models, zero loader errors**,1 mesh/material and4 texture slots each (metalness/roughness share the packed image).
4. Visually inspected provider thumbnails **and actual native textured meshes from perspective, top and front views**, including the corrected bomber silhouette. Provider pictures are `previews/{tesla,bomber}.png` and `*-geometry.png`; **shipping-mesh** perspective pictures are `previews/{tesla,bomber}-native.png`. Provider pictures intentionally still show the unprocessed generation.

Secret-free generation scripts, exact receipts, originals, native multi-view contact sheets and detailed verification are in `/home/cammo/.hermes/cache/scratch/meshy-v03/`. Durable provenance/receipts are also in the project manifest. No signed download URL or API key was published. The existing `verification.json` and `native-contact.png` refer to the historical v0.2 batch, not a new9-model verification.

**Not claimed:** app-side bomber unlock/airstrike wiring, final gameplay camera readability, pivot placement in the game, worst-case FPS, mobile performance, collision, final offline build or all-nine-model app verification. Parent owns integration/testing. No source/tests were edited, and no commit/push was made for this asset task.

## Historical v0.2 delivery report (superseded Tesla measurements)

The report below describes the original eight-asset batch only. Its Tesla file and totals are historical; use the v0.3 section and current manifest for shipping files.


## Delivered and measured

Eight real, newly generated **Meshy `meshy-6-lite` preview + PBR refine** actors are in `public/assets/fleet/`. All 16 provider jobs reached `SUCCEEDED`; exact per-task `consumed_credits` was **5 preview +10 refine =15 per actor**, **120 total new credits**, below the authorized160 cap. No extra previews, retries that create duplicates, or paid optimization calls were made.

| Asset | File relative to `public/` | Triangles | Bytes | New credits |
|---|---|---:|---:|---:|
| Cannon head | `assets/fleet/cannon.glb` | 2,460 | 643,496 | 15 |
| Tesla coil head | `assets/fleet/tesla.glb` | 4,101 | 658,516 | 15 |
| Twin-rail head | `assets/fleet/rail.glb` | 2,452 | 503,988 | 15 |
| Fast patrol skiff | `assets/fleet/skiff.glb` | 3,974 | 563,540 | 15 |
| Frigate/deck gun | `assets/fleet/frigate.glb` | 4,018 | 728,780 | 15 |
| Armored gunboat | `assets/fleet/armored.glb` | 3,884 | 618,428 | 15 |
| Boss battleship | `assets/fleet/boss.glb` | 3,911 | 779,536 | 15 |
| Periscope submarine | `assets/fleet/submarine.glb` | 4,008 | 642,672 | 15 |
| **Total** | **8 GLBs** | **28,808** | **5,138,956** | **120** |

Each GLB is below3MB; the largest is779,536 bytes. These are measured artifact sizes/triangle counts, **not a mobile frame-rate benchmark**. Provider-generated base-color, normal and metallic/roughness textures are embedded. Generation requested2K PBR; shipping textures were resized to1024px and JPEG quality86 for download/GPU budget. Palette is mostly navy steel/amber, with red hull accents particularly visible on frigate, submarine and boss; generated coloring did not obey every requested cyan/rust-red accent exactly.

`manifest.json` holds each relative file path, prompt, explicit model/request parameters, preview and refine IDs, successful receipts/timestamps, actual credits, geometry bounds, byte count, SHA-256 and processing notes. No credential, expiring model URL or external texture URI is included. `verification.json` records real native loader results. Provider images are in `previews/`; `previews/native-contact.png` is the post-cleanup native Three render, not a provider picture substituted for mesh validation.

## Renderer contract — important

- All delivered geometry is **+Y up, +Z forward**: gun muzzle/boat bow points+Z. The actual provider outputs were visually checked in native Three; most originally faced-X, not the prompted+Z. This was corrected by baking rotation into positions/normals. Do **not** apply an extra-X correction in the renderer.
- Center/scale from the bounding box, not assumptions about generator origin. Units are arbitrary. Bounds are in the manifest. Boats are roughly1.9 model units long; turret heads differ in dimensions.
- Mount weapon heads on the existing independent platform. **Cannon's generated circular pad/fixed plinth was removed.** Whole head may yaw/recoil; these GLBs are rigid meshes, not skinned rigs and not separately articulated pitch/recoil subassemblies. Cannon underside trimming is intended to sit over the existing mount, not be inspected from below.
- Tesla includes its coil mounting stem as part of the moving head, not a second sea platform.
- Rail had two detached generated rails. They were reassembled onto the breech and the original solid muzzle removed, yielding a visibly separated twin-rail silhouette. Original Meshy rail UVs were retained; no procedural replacement rail boxes were substituted.
- Frigate and boss initially had excessively narrow beams; their generated hulls were widened across the beam for overhead readability. These are intentionally stylized proportions.
- One mesh/material per actor. No Draco, Meshopt, Basis/KTX or external decoder required. No CDN/network asset dependency: GLTFLoader from the project's installed Three package reads embedded JPEGs directly.
- Preload/reuse each actor; clone scenes or instance compatible geometry/materials rather than loading a GLB per enemy. Parent owns real gameplay integration and representative worst-case FPS profiling.
- Resolve manifest paths against the app base URL (e.g. Vite `BASE_URL`); paths deliberately have no leading slash. Original independent `public/assets/meshy-platform.glb` remains untouched.

## Verification actually performed

1. Parsed all8 binary GLB headers/chunks: correct magic, version2 and exact byte length.
2. Checked buffer-view bounds, finite position data, embedded images/buffers and absence of required compression extensions.
3. Loaded **all8** through the project's native `three/addons/loaders/GLTFLoader.js` in local headless Chromium, then rendered actual textured WebGL meshes. **8 successful models, zero loader errors**; each has a nonzero bounding box and real geometry.
4. Counted actual decoded triangles and native texture/material use, matched against manifest values. Each material references the embedded base/normal/packed metal-roughness data (Three exposes the packed texture in both metalness/roughness slots).
5. Visually inspected both provider geometry thumbnails and native post-cleanup render: distinct skiff, frigate, armored boat, battleship and submarine silhouettes; cannon head without platform; vertical coil and twin-rail heads. The generated boss is recognizable as a battleship but not a guarantee of exactly three independently articulated triple turrets.

Not yet claimed: performance on the user's phone, parent game's final camera/UI visibility, collision meshes, barrel-part articulation, watertight fabrication geometry, or a complete original Aqua Turret asset roster. The generated texture/shape limitations are disclosed rather than described as exact original art.

## Provider documentation, provenance and terms

Current official docs were retrieved before any generation request:
- https://docs.meshy.ai/en/api/text-to-3d
- https://docs.meshy.ai/en/api/pricing

At retrieval these document `standard` + `meshy-6-lite`, standard geometry, triangle remesh and target4000 faces. Pricing explicitly separates the5-credit geometry preview and10-credit2K refine. Refines used the exact successful preview ID, inherited/explicitly matched `meshy-6-lite`, `enable_pbr:true`, `texture_resolution:"2k"`, `target_formats:["glb"]`; unsupported `remove_lighting` was not sent.

All eight prompts describe newly authored naval arcade interpretations without copied logos, people, water, scenery or text. Generation was authorized on the user's Meshy account. Usage remains subject to that account's Meshy terms; no independent blanket commercial-license clearance is asserted. Research on original gameplay is separately sourced and qualified in [REFERENCE.md](REFERENCE.md).
