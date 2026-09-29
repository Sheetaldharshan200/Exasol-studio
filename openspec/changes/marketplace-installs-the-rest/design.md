# Design

## One rule carried forward

An item declares a mechanism and a coordinate; the installer dispatches on the
mechanism. Nothing below matches an item's id. Three coordinate shapes are new:

```ts
| { kind: "gh-asset"; assetPattern?: string; onPath?: boolean; choose?: boolean }
| { kind: "deliver"; format: "rockspec" | "dbt-package" | "source" | "desktop-app"; assetPattern?: string }
| { kind: "slc"; assetPattern: string; choose?: boolean; alias: string }
| { kind: "db-scripts"; assetPattern: string; schema: string }
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

## `slc` — a language container into BucketFS

Builds on what the virtual-schema prerequisites already do for the Java
container. On the chosen connection: upload the verified container to the
default bucket under `slc/`, then register the alias with
`ALTER SYSTEM SET SCRIPT_LANGUAGES` **appended**, never replaced — a
container install must not remove the languages already there. The install
record carries the connection and the alias.

Uninstall: drop only this alias from `SCRIPT_LANGUAGES`, then delete the
container from BucketFS. BucketFS gains a `delete` beside `list`, `upload` and
`download` — the same URL with the DELETE method.

## `db-scripts` — a script library into a schema

Builds on Semantic Views: resolve the chosen connection (or the managed local
database), run the release's verified SQL and Lua files into a dedicated
schema named by the coordinate, record the version **and the connection**.
Before anything runs, the permission screen shows the statements that will
run — the person is changing their database and sees exactly how.

Uninstall: `DROP SCHEMA <schema> CASCADE` on that connection, after a
confirmation that names the schema and the connection. Semantic Views gets the
same uninstall, since it is the same shape and has none today.

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

Staging puts a JAR (and a driver) into BucketFS under `vs/`. Un-staging
removes those files. The adapter *script* in the database, if one was created
by attaching a schema, is out of scope here — it belongs to the schema that
uses it and is dropped with it.

## Where a database-side item lives

The manifest entry for `slc`, `db-scripts`, `vs-adapter` and Semantic Views
records `connection` (profile id and name). The Installed view shows it, and
removal names it in its confirmation. Two connections can hold the same item;
each is its own record.

## Order of work

1. Data-only: `error-reporting-go` (Go proxy); `power-apps-connector` and
   `azure-data-factory` (host-plugin, two new destination texts).
2. `deliver` with its four formats — seven items become installable.
3. The variant choice — `spark-connector`.
4. BucketFS delete + `slc` install/uninstall — three items, plus adapter
   un-staging.
5. `db-scripts` install/uninstall, and Semantic Views uninstall.
6. Installed view: connection shown, database-side removal confirms.
7. `vm-appliance`: hypervisor detection, image lookup, import/start, delete —
   `community-edition` becomes an install on x86-64 hosts.
