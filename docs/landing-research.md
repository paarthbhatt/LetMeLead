# LetMeLead landing-page research

Research date: **2026-11-11**. Package cutoff: **2026-10-31 inclusive (UTC)**.

## Evidence boundaries

All seven public sites below were HTTP-fetched, including human-facing HTML. These are live-page observations, not verified October snapshots. No browser interaction, animation playback, conversion testing or competitor runtime performance was verified.

Ekos means **Ekos Labs**, not Ekos.ai's community platform. Its leads page reports a November 3 update; its current pricing/offer is not an October claim. An archive query returned no matching pre-cutoff snapshot.

No funding claims are proposed or inferred. Funding, customer logos, traction, ROI and certifications require dated primary evidence before publication. Competitors' self-reported marketing figures are not independent proof or LetMeLead claims. Do not copy competitor code or assets.

## Observed patterns

| Source | Worthwhile pattern |
| --- | --- |
| [Ekos Labs](https://www.ekoslabs.com/leads) | Website-first onboarding; explicit lead contents, provenance/freshness and limitations; substantive pricing FAQs. Live layout reference only. |
| [Clay](https://www.clay.com/) | Tactile machinery explains orchestration; seven workflow tabs connect inputs, formulas and outputs with UI crops. Apparent 3D is delivered through video/AVIF, not verified live WebGL. |
| [Unify](https://www.unifygtm.com/) | Concrete prompt examples and campaign previews; demo entry and persona tabs. HTML marks videos for viewport playback with preload disabled. Behavior remains untested. |
| [Common Room](https://www.commonroom.io/) | Person-level context, explainable scoring, integration/security/onboarding objections. Its [September 16 Revenue OS announcement](https://www.commonroom.io/blog/revenue-os/) provides the dated Know/Act/Learn narrative. |
| [Apollo](https://www.apollo.io/) | Data/Intelligence/Execution mental model; direct hero signup with Google/Microsoft alternatives; trust information separated from feature exposition. |
| [Linear](https://linear.app/) | Detailed issues, activity, boards and diffs demonstrate real work. Restrained composition and figure labels support precision. |
| [Spline](https://spline.design/) | Canvas elements and a rover showcase make 3D demonstrate the product; prompt/connect/build/ship explanation. Canvas behavior was not exercised. |

## Eight concrete ideas

1. Outcome-first hero: explain audience, deliverable and next action. Keep Open dashboard visible; use the real onboarding offer.
2. One original 3D evidence sorter: signals pass through audience-fit and qualification gates into a lead dossier, not a decorative orb.
3. Resolve the scene into dashboard-styled lead details; reuse the redesigned product's tokens and typography.
4. Offer an ungated sample workflow with clearly labeled sample data. Do not simulate live research or fabricate results.
5. Three use-case tabs change the input, evidence and output together, adapting Clay's explanatory completeness and Unify's relevance.
6. An evidence drawer explains source URL, signal age, qualification reason and uncertainty: why this lead?
7. Explain pricing, delivery, limits, integrations and human control honestly; publish only implemented features and verified proof.
8. Native-scroll narrative: hero, workflow, sample lead, use cases, trust/pricing, FAQ, repeated primary CTA. No scroll hijacking or endless animated card grids.

## One recommended stack

Keep **Next 14 / React 18.2+ / the existing styling system**, with **Three.js r187 (`three@0.187.0`, matching types)** and **`motion@14.9.0`**. No R3F, Drei, GSAP, Lenis or Spline runtime is proposed.

This is documentation/peer compatibility research, not a LetMeLead build test. No runtime dependencies or framework files were changed by this task.

| Package | Latest stable by cutoff | Compatibility |
| --- | --- | --- |
| [Three.js](https://registry.npmjs.org/three) | 0.187.0, 2026-10-30 | No React peer coupling; [release r187](https://github.com/mrdoob/three.js/releases/tag/r187). |
| [Motion](https://registry.npmjs.org/motion) | 14.9.0, 2026-10-30 | [React 18.2+, Next App/Pages Routers](https://motion.dev/docs/react-installation). |
| [R3F](https://registry.npmjs.org/@react-three/fiber) | 9.8.2, 2026-10-14 | Requires React 19. |
| [Drei](https://registry.npmjs.org/@react-three/drei) | 10.7.9, 2026-09-25 | Requires React 19/R3F 9. |

React-18-compatible legacy branches are R3F 8.18.0 and Drei 9.122.0 (both 2025-02-19); these are not the proposed stack. Next 14 is [outside supported LTS](https://nextjs.org/support-policy); security maintenance needs a separate decision.

Motion's official [motion/three bridge](https://motion.dev/docs/three) drives transforms and TSL uniforms alongside DOM/SVG animation. It is [present in 14.9.0](https://cdn.jsdelivr.net/npm/motion@14.9.0/dist/three.d.ts), so one animation clock can cover both.

## Performance and fallback contract

- Server-render all information. Lazy-load one isolated canvas client component; reserve its dimensions and show a static poster first.
- Progressive enhancement: poster, WebGPU where usable, automatic WebGL2 fallback, poster again on initialization/device/context failure. Information and CTAs must never depend on GPU availability.
- Use [WebGPURenderer and TSL/node materials](https://threejs.org/manual/pages/webgpurenderer); await initialization before external-loop rendering.
- Target DPR 1 mobile/1.5 desktop; pause offscreen or hidden, avoid per-frame allocations/React state updates and dispose resources.
- Mobile/save-data defaults to the poster and equivalent 2D workflow. No large always-running background, compute-dependent feature or expensive post-processing is necessary.
- Respect [Motion reduced-motion settings](https://motion.dev/docs/react-accessibility), but separately disable imperative Three orbit/parallax; MotionConfig does not stop a canvas automatically. Keep controls keyboard-operable.
- Test forced WebGL2, unavailable GPU, reduced motion, context/device loss and mid-tier mobile before claiming runtime quality.

WebGPURenderer remains explicitly experimental. ShaderMaterial, RawShaderMaterial, onBeforeCompile and traditional EffectComposer do not transfer to it. Official r187 documentation outranks older community recipes.

## Vetted project-local skills

Only these two skills were installed, with unchanged upstream files and no installers/hooks/configuration:

| ID and path | Source commit | Provenance |
| --- | --- | --- |
| `motion`: `.opencode/skills/motion/` | `1e424943582cbbdb6e3f410687e39f96451447bb` (2026-10-26) | [Official Motion AI Kit](https://github.com/motiondivision/ai-kit); 12 skill files. |
| `webgpu-threejs-tsl`: `.opencode/skills/webgpu-threejs-tsl/` | `af2319bd01bb7cc881267a9ef42cafdaf5e9029d` (2026-04-10) | [Dan Greenheck's community skill](https://github.com/dgreenheck/webgpu-claude-skill); 16 skill/reference/example/template files. Not official Three.js material. |

Each directory has `SOURCE.md`, `source-manifest.json`, unchanged `UPSTREAM-README.md` and `LICENSE.upstream.md`. Both pins declare MIT but contain no standalone LICENSE/NOTICE; the real declarations are preserved, not fabricated license text. Raw-file hashes were checked against GitHub blob IDs. No whole repository, runtime dependencies or assets were downloaded.

Reviewed Motion's migration/paid-tool instructions before install: they do not grant permission to change packages or activate premium tools. The WebGPU skill's r183-era examples/browser notes need current r187 verification. No examples were executed.

Other free resources researched, **not installed**: [Anthropic frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design) (Apache-2.0), [Vercel React/interface skills](https://github.com/vercel-labs/agent-skills) (React skill declares MIT), and [alton47 Three.js skills](https://github.com/alton47/threejs-skills) (MIT, community-maintained; its own “official” wording is not endorsement evidence).

## Documentation tools and access

- Parent has connected `lml-docs` (Context7) and `lml-motion`. Context7 queries succeeded during research; use discovered tool signatures and version-scoped documentation.
- [Motion docs MCP](https://mcp.motion.dev/) is free/no account. [Motion+](https://motion.dev/docs/ai-kit-install) premium source/audits/editor require separate access; no premium source or grading was used here.
- [Context7](https://context7.com/docs/resources/all-clients) supports OAuth or API keys. Do not promise unlimited anonymous access.
- [21st/Magic](https://help.21st.dev/ai/mcp) requires an API key. Search is free, free-tier code retrieval is metered, and generation needs enabled AI/credits. **Magic is not enabled**; no key, credits or configuration were added.
- [shadcn MCP](https://ui.shadcn.com/docs/mcp) can use public registries without a provider key; private registries may require tokens. Not installed here.
- [Next runtime MCP](https://nextjs.org/docs/app/guides/mcp) requires Next 16+, so it is not promised on Next 14.

Installation scope: project `.opencode/skills` only. No global configuration, package/framework edits, commits or pushes were performed.
