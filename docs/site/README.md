# Exasol Studio documentation

The Studio notebook of the shared docs site. **This directory is the source
of truth** — the exa engine's release workflow copies it into
`packages/web/content/docs/studio/` before building the site that ships
inside the engine binary (which Studio serves from its sidecar).

Pages are Fumadocs MDX. Links to the exa notebook use `../../exa/...`
relative paths, resolved after the copy.
