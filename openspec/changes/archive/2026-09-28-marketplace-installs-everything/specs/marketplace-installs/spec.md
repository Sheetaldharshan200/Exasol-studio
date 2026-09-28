# Spec Delta

## Purpose
Installing, updating and removing published Exasol ecosystem components from the marketplace onto this machine, from each component's own registry, with every artifact verified and no item handled by name.

## ADDED Requirements

### Requirement: Every install is driven by the item's coordinate, not its identity
The marketplace SHALL install a component from a declared mechanism and coordinate (a Python package, a Maven group and artifact, a release asset pattern, a native-registry package, a repository snapshot, a driver runtime, or a host-application plugin). Adding a component SHALL require only a catalogue entry; no per-item install logic SHALL exist. A component that has no artifact to install SHALL be presented as a link and SHALL say so.

#### Scenario: A new component is added with a coordinate
- **WHEN** a catalogue entry is added naming a mechanism and a coordinate that resolves at its registry
- **THEN** the component is installable from the marketplace with no other change

#### Scenario: A component with nothing to install
- **WHEN** a catalogue entry declares no coordinate and is not a managed runtime or an in-database add-on
- **THEN** the marketplace links to the project and does not offer an install

### Requirement: Artifacts are verified against a digest their publisher provides
Every downloaded artifact SHALL be checked against the digest its publisher makes available for it — a per-asset release digest or a checksum file published beside the artifact, a Maven `.sha1`, an npm tarball checksum, a crates.io version checksum, or the Exasol downloads portal's checksum. A published digest that does not match, or that cannot be read as the digest it claims to be, SHALL cause the download to be discarded and the install to fail. An artifact for which the publisher provides no digest MAY be installed.

#### Scenario: A published digest disagrees
- **WHEN** a downloaded artifact's digest differs from the one its publisher declares
- **THEN** the file is deleted and the install reports the mismatch

#### Scenario: A published digest is unreadable
- **WHEN** the publisher's declared digest is present but not a well-formed digest of the declared kind
- **THEN** the install is refused rather than proceeding unverified

#### Scenario: No digest is published
- **WHEN** the publisher provides no digest for the artifact
- **THEN** the install proceeds and does not claim verification

### Requirement: A release asset is chosen unambiguously
When a component is installed from a repository release, the artifact SHALL be chosen by the item's declared pattern when it has one, and by the host platform otherwise. A pattern that matches no asset or more than one SHALL make the component unavailable for install rather than selecting a guess. A platform-specific release with no build for the host operating system, or with a build only for another CPU architecture of that operating system, SHALL be reported as unavailable for this machine.

#### Scenario: The upstream file was renamed
- **WHEN** an item's pattern matches none of the newest release's assets
- **THEN** the marketplace shows the component as unavailable and installs nothing

#### Scenario: A release ships several variants
- **WHEN** an item's pattern matches more than one asset
- **THEN** the marketplace shows the component as unavailable and installs nothing

#### Scenario: Only another architecture is published
- **WHEN** the newest release has a build for the host's operating system but only for a different CPU architecture
- **THEN** the component is reported as unavailable for this machine

### Requirement: Versions come from the mechanism's own registry
The versions offered for a component SHALL come from the registry the component installs from. A Maven artifact's versions SHALL come from Maven Central's metadata and SHALL be used verbatim; a repository release tag SHALL NOT be used as a Maven version.

#### Scenario: Maven and GitHub disagree
- **WHEN** a Java library's newest GitHub release tag differs from the newest version on Maven Central
- **THEN** the marketplace offers the Maven Central version and installs that artifact

### Requirement: Removal undoes what the install did, and nothing else
Removing a component SHALL delete its own files, remove any executable links it placed on the application's PATH, remove a tool it installed into the Python tool directory, and clear any driver override that pointed into its files — for every driver runtime. Removal SHALL NOT touch files or links belonging to another component, including one whose name merely shares a prefix, and SHALL refuse an identifier that is not a single plain directory name.

#### Scenario: A tool is removed
- **WHEN** a component installed as a Python tool is removed
- **THEN** its command no longer exists on the application's PATH

#### Scenario: A neighbouring component is untouched
- **WHEN** a component is removed while another component's executable link exists in the same PATH directory
- **THEN** the other component's link remains

#### Scenario: A malformed identifier is refused
- **WHEN** removal is requested with an identifier containing a path separator or a parent-directory reference
- **THEN** nothing is deleted and the request fails

### Requirement: Plugins for other applications are delivered, not installed into them
For a component that belongs to another application, the marketplace SHALL download and verify the file into its own folder without extracting or linking it, SHALL reveal the file, and SHALL state where it belongs and how to install it for the host application on the user's operating system. The marketplace SHALL NOT write into another application's installation.

#### Scenario: A plugin is fetched on a platform its host does not run on
- **WHEN** a plugin for a Windows-only application is fetched on macOS
- **THEN** the file is verified and revealed, and the message says to carry it to a Windows machine rather than naming a local folder

#### Scenario: The host application's directories are never written
- **WHEN** any plugin install completes
- **THEN** no file has been created or modified outside the marketplace's own folder

### Requirement: Coordinates are confirmed before they ship
Every coordinate in the catalogue SHALL be confirmable against its registry by a repeatable check that fails on a package or artifact that does not exist, a pattern that does not match exactly one asset, or a repository that is archived. A newest release that has not yet published any asset SHALL be reported as an upstream condition, not as a catalogue failure.

#### Scenario: A coordinate is wrong
- **WHEN** the check runs against a catalogue entry whose package name does not exist at its registry
- **THEN** the check fails and names the entry

#### Scenario: Upstream has not uploaded yet
- **WHEN** a repository's newest release exists but has no downloadable asset
- **THEN** the check reports a warning for that entry and does not fail
