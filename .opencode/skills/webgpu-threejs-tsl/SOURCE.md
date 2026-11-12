# WebGPU Three.js TSL skill provenance

- Installed/reviewed: 2026-11-11.
- Skill ID: `webgpu-threejs-tsl`.
- Community source by Dan Greenheck: https://github.com/dgreenheck/webgpu-claude-skill
- Pinned commit: `af2319bd01bb7cc881267a9ef42cafdaf5e9029d` (2026-04-10).
- Source directory: `skills/webgpu-threejs-tsl/`.
- License declaration: MIT; see `LICENSE.upstream.md`.

All 16 skill/reference/example/template files and `UPSTREAM-README.md` are unchanged upstream bytes. `source-manifest.json` preserves original paths, Git blob IDs and SHA-256 hashes. Only provenance, the manifest and licensing evidence are local additions.

## Review and project boundaries

Reviewed the entry instructions, reference inventory and source provenance. Scanned supplementary files for shell execution, credential access and network calls. No installer, hooks, models/textures or example execution was included.

The README targets r183-era APIs and contains stale browser support notes. Treat examples as illustrative; verify against pinned r187 official documentation and connected `lml-docs` before implementation.

Keep WebGL2/poster fallbacks, reduced motion and mobile performance. Compute-only effects must not become required product functionality. Installing this skill does not authorize dependency/framework edits, global configuration or paid tools.
