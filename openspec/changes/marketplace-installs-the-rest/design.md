# Design

## One rule carried forward

An item declares a mechanism and a coordinate; the installer dispatches on the
mechanism. Nothing below matches an item's id. Three coordinate shapes are new:

```ts
| { kind: "gh-asset"; assetPattern?: string; onPath?: boolean; choose?: boolean }
| { kind: "deliver"; format: "rockspec" | "dbt-package" | "source" | "desktop-app"; assetPattern?: string }
| { kind: "slc"; alias?: string }
| { kind: "db-scripts"; schema: string }
| { kind: "vm-appliance"; imagePattern: string; downloadPage: string; vmName: string }
```

## The variant choice

`choose: true` on a release-asset coordinate means the pattern is expected to
match **several** assets and the person picks one. The card's version menu
already offers versions; a variant menu beside it offers the pattern's matches
for the chosen version, and the pick travels as the asset name. Without a
pick, the item is *choose a variant*, not *unavailable* — the release is not
broken, it is plural. The same choice serves `spark-connector` (Scala × Spark)
and `script-languages-release` (flavor × architecture).

## `deliver`

Generalises what `host-plugin` does: download, verify against the published
digest, place in Studio's folder without extracting or linking, reveal, and
state the next step. The statement comes from the **format**, not the item:
a `rockspec` says `luarocks install <file>`; a `dbt-package` says what to add
to `packages.yml` and to run `dbt deps`; `source` says it is the project's
source snapshot; `desktop-app` picks the build for this platform and says to
open it. `host-plugin` becomes `deliver` with `format: "host"` in spirit and
may be folded in later; it is not renamed in this change.

## `slc` — a language container through the launcher

The official launcher owns language containers for the managed local
database: `exasol slc install <alias>` fetches the official container for
this machine's architecture (and `rust`, which it maps to the newest
`language-container-rs` release), registers the alias beside the existing
ones and restarts the database once; `exasol slc remove <alias>` undoes it;
`exasol slc list --json` says what is offered and installed. Studio wraps
exactly that and adds nothing of its own — no BucketFS upload, no
`SCRIPT_LANGUAGES` string editing. A container item that names no alias
takes the pick from the launcher's list, through the same menu a plural
release uses. The manifest records the alias; a container the launcher
already lists shows as *on this system*, whoever installed it.

Containers for a database that is not the managed local one are out of this
change: the launcher only manages that one, and its scripts for the rest
(`install.sh` over `exapump`) are the projects' own.

## `db-scripts` — a script library into a schema

The release's `.sql` and `.lua` files are downloaded and verified (GitHub's
per-asset digest or the `.sha256` beside the file). A `.sql` file is a
bundle in Exasol's own convention — each script body ends with a line
holding only `/`, filler `;` lines between — and is split on that, never on
the `;` inside a Lua body; a `.lua` file becomes one
`CREATE OR REPLACE LUA ADAPTER SCRIPT` in the schema, named after the file.
Before anything runs, a review screen shows the connection (picked there),
the schema (the coordinate's default, editable — Row-Level Security's
administration scripts belong in the schema they protect) and every
statement's head. On confirmation the queue runs them on one connection:
`CREATE SCHEMA` only if the schema is missing, `OPEN SCHEMA`, then the
statements. The record carries the connection, the schema, whether the
install created it, and every object it created — read from the statement
heads.

Uninstall: after a confirmation naming the connection, `DROP <kind> <object>`
for exactly the recorded objects, then `DROP SCHEMA` only if the install
created it, and without CASCADE — a schema the person has since put their
own objects into is left, and the error says so. Semantic Views records no
objects and keeps its own lifecycle.

## `vm-appliance` — a database image into the hypervisor

The publisher fixes three things Studio cannot change: the image runs on
x86-64 hosts only, it is downloaded through a sign-up page, and no digest is
published for it. The mechanism is honest about each.

- **Platform.** On a host whose architecture is not `x86_64` the item is
  *unavailable*, with the reason (Apple Silicon / ARM), the same state a
  binary without a build for this platform already has. No button that can
  only fail.
- **Hypervisor.** Studio looks for VirtualBox (`VBoxManage` on PATH or in
  its standard install location) and VMware (Fusion / Workstation). Neither
  present: the install says which to install and links to it.
- **Image.** The download page is opened for the person; Studio then looks
  for a file matching `imagePattern` in their Downloads folder whose flavor
  (`virtualbox` / `vmware`) matches a hypervisor found. Not there yet: the
  install stops with "download the image into Downloads, then Install again"
  — nothing is recorded. The image is the person's file and is never moved
  or deleted.
- **Verification.** No digest is published, so the import proceeds and the
  log says it is unverified — the policy the spec already has for that case.
- **Import.** VirtualBox: `VBoxManage import <ova> --vsys 0 --vmname <vmName>`
  then `VBoxManage startvm <vmName>`; a VM of that name already registered is
  reported, not overwritten. VMware: the image is opened with the
  application, whose import wizard takes over; the record says so.
- **Record.** The manifest entry carries the hypervisor and the VM name — the
  two facts uninstall needs — and the release tag as the version, so a newer
  Community Edition release shows as an update.
- **Uninstall.** VirtualBox: after a confirmation that names the VM and says
  its disks are destroyed, `controlvm poweroff` (ignored if not running) then
  `unregistervm --delete`. VMware: the record is removed and the person is
  told to delete the VM in the application; Studio does not reach into it.
- **Presence.** `VBoxManage list vms` naming `vmName` counts as *on this
  system*, so a VM imported by hand is recognised and not offered again.

## Un-staging a virtual schema adapter

Staging writes a JAR (and a driver) into the managed local database's
default bucket under `vs/`. Un-staging removes the files the adapter's own
asset pattern names, matched directly under `vs/` and nowhere else, after a
confirmation. The adapter *script* in the database, if one was created by
attaching a schema, belongs to the schema that uses it and is dropped with
it.

## Where a database-side item lives

The manifest entry for `db-scripts` records `connection` (profile id and
name), `slc` the alias, `vm-appliance` the hypervisor and machine name. The
Installed view shows the connection, and removal names what goes where in
its confirmation. The manifest holds one record per item, so a library
installed on a second connection replaces the record of the first — a known
limit, stated here rather than hidden.

## Order of work

1. Data-only: `error-reporting-go` (Go proxy); `power-apps-connector` and
   `azure-data-factory` (host-plugin, two new destination texts).
2. `deliver` with its four formats — seven items become installable.
3. The variant choice — `spark-connector`.
4. `slc` through the launcher — two items — plus adapter un-staging.
5. `db-scripts` install/uninstall with the review screen.
6. Installed view: connection shown, database-side removal confirms.
7. `vm-appliance`: hypervisor detection, image lookup, import/start, delete —
   `community-edition` becomes an install on x86-64 hosts.
