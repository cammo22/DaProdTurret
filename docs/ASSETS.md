# v0.2 Meshy fleet — delivered assets and integration contract

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
