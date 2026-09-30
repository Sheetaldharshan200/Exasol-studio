# Marketplace installs the rest

## Why

After `marketplace-installs-everything`, 121 of 149 catalogue items install
from a coordinate. Seventeen are still links, each for a reason — but a reason
is not a plan. Someone who comes for the Spark connector, a language container
or row-level security still leaves with a URL.

Every one of the seventeen fits one of a small number of **mechanisms**, none
of which exists yet. This change adds those mechanisms, keeps the rule that no
item is handled by name, and — for the first time — gives every mechanism a
real **uninstall**, including the ones that install into a database.

## What "install" truthfully means, per item

| Mechanism (new) | Items | Install | Uninstall |
|---|---|---|---|
| `gh-asset` **with a variant choice** | `spark-connector` (5 Scala/Spark JARs) | the person picks the variant; download, verify | delete the folder |
| `deliver` — download, verify, reveal, per-**format** instruction | `driver-lua`, `error-reporting-lua` (`rockspec` → `luarocks install`); `dbt-exasol-utils` (`dbt-package` → `packages.yml`); `remotelog-lua`, `parquet-edml-generator`, `udf-runner-cpp`, `preprocessor-library`, `lakehouse-engine-rs` (`source`: the tag's archive — each installs through its own tool or script); `panorama` (`desktop-app`, platform-picked dmg/AppImage/msi) | file lands in Studio's folder, is revealed, and the format's own install step is stated | delete the folder |
| `host-plugin`, new hosts | `power-apps-connector` (`.zip` → Power Apps), `azure-data-factory` (`.zip` → Azure Functions) | as today | as today |
| `slc` — a language container for the managed local database, through the official launcher | `script-languages-release` (a language picked from the launcher's catalogue), `language-container-rs` (`rust`) | `exasol slc install <alias>`: the launcher fetches the container for this machine, registers the alias beside the existing ones and restarts the local database once | `exasol slc remove <alias>` after a confirmation |
| `db-scripts` — SQL/Lua run into a schema | `row-level-security` | run the release's verified scripts into a schema on the chosen connection, after the person has reviewed the connection, the schema and every statement; the record names the connection, the schema, whether it was created, and every object created | drop exactly those objects, and the schema only if the install created it — never CASCADE |
| `registry` (exists) | `error-reporting-go` — the resolver never read `go.mod` | Go proxy | delete the folder |
| `vm-appliance` — a database image into the hypervisor on this machine | `community-edition` (x86-64 `.ova`, VirtualBox or VMware) | detect the hypervisor, find the downloaded image (the download page is sign-up gated, so Studio opens it and waits for the file), import it as a named VM and start it | power the VM off and delete it with its disks, after a confirmation that says so |

Community Edition is the one item whose mechanism is bounded by its
publisher: the image is x86-64 only (Apple Silicon and ARM hosts are told so
instead of being offered a button), it is downloaded through a sign-up page
Studio cannot drive, and no checksum is published for it. Within those bounds
the install is real — the VM is imported, named and started — and so is the
uninstall. Studio drives VirtualBox itself through `VBoxManage`; for VMware
it hands the image to the application, which owns the VM from then on.

Two stay links, deliberately, and the proposal says why so nobody re-litigates
them by accident:

- `grafana-datasource` — distributed only through Grafana's own plugin
  catalogue, never as a release asset. Installing it is `grafana-cli` inside
  a Grafana installation Studio does not own.
- `starter-kit` — a second *managed* local database next to Exasol Personal.
  The user's standing rule is that the marketplace's managed database install
  is the official launcher and never the starter kit.

The documentation, tutorial, specification and style-guide repositories
(`tutorials`, `virtual-schemas`, `exasol-java-tutorial`, `lua-styleguide`,
`connection-parameter-specification`, `schemas`, `compatibility-test-suite`)
have nothing to install and keep saying so.

## Uninstall, made whole

Uninstall today deletes an item's folder, unlinks what it put on PATH, removes
a uv tool and clears driver overrides. It does not touch anything that lives in
a **database**. This change closes that: a virtual schema adapter can be
un-staged from the local database's bucket; a language container can be
removed through the launcher; a script library's objects can be dropped on
the connection they went to; a Community Edition machine can be deleted. The
Installed view names **where** a database-side item lives (which connection),
and removal asks before it drops anything there. Semantic Views, the one
in-database install that predates this, keeps its own lifecycle for now — it
records no objects, so nothing could be dropped truthfully.

## Capabilities

- `marketplace-installs` (modified) — new mechanisms, the variant choice, and
  the uninstall contract for database-side installs.

## Non-goals

- **No writes into another application's installation.** `deliver` and
  `host-plugin` reveal and instruct; they do not copy into VS Code, Grafana,
  Power BI or a LuaRocks tree the person owns.
- **No second managed database.** Community Edition is imported into the
  hypervisor the person already has and is theirs from then on: Studio does
  not download the sign-up-gated image, does not run the VM for them, and
  does not become its lifecycle manager. The starter kit stays a link.
- **No dependency resolution.** A Lua rock, a dbt package or a Go module is
  delivered or fetched as one artifact; its own tool resolves the rest.
- **No unattended database changes.** Every `slc` and `db-scripts` action
  runs on a connection the person chose, after they have seen what will run,
  and never on a database they did not pick.
