## MODIFIED Requirements

### Requirement: Every install is driven by the item's coordinate, not its identity
The marketplace SHALL install a component from a declared mechanism and coordinate (a Python package, a Maven group and artifact, a release asset pattern, a native-registry package, a repository snapshot, a driver runtime, a host-application plugin, a delivered file with a format, a language container, a script library with a schema, or a virtual-machine appliance). Adding a component SHALL require only a catalogue entry; no per-item install logic SHALL exist. A component that has no artifact to install SHALL be presented as a link and SHALL say so.

#### Scenario: A new component is added with a coordinate
- **WHEN** a catalogue entry is added naming a mechanism and a coordinate that resolves at its registry
- **THEN** the component is installable from the marketplace with no other change

#### Scenario: A component with nothing to install
- **WHEN** a catalogue entry declares no coordinate and is not a managed runtime or an in-database add-on
- **THEN** the marketplace links to the project and does not offer an install

### Requirement: A release asset is chosen unambiguously
When a component is installed from a repository release, the artifact SHALL be chosen by the item's declared pattern when it has one, and by the host platform otherwise. A pattern that matches no asset SHALL make the component unavailable for install rather than selecting a guess. A pattern that matches more than one asset SHALL make the component unavailable, unless the item declares that a choice is expected, in which case the person SHALL pick one of the matches and nothing SHALL be installed until they have. A platform-specific release with no build for the host operating system, or with a build only for another CPU architecture of that operating system, SHALL be reported as unavailable for this machine.

#### Scenario: The upstream file was renamed
- **WHEN** an item's pattern matches none of the newest release's assets
- **THEN** the marketplace shows the component as unavailable and installs nothing

#### Scenario: A release ships several variants
- **WHEN** an item's pattern matches more than one asset and the item does not declare a choice
- **THEN** the marketplace shows the component as unavailable and installs nothing

#### Scenario: A release ships several variants and the item expects a choice
- **WHEN** an item declaring a choice has a pattern that matches more than one asset
- **THEN** the marketplace offers the matches by name, installs only the one picked, and installs nothing before a pick

#### Scenario: Only one variant is published this time
- **WHEN** an item declaring a choice has a pattern that matches exactly one asset
- **THEN** that asset is installed without asking

#### Scenario: Only another architecture is published
- **WHEN** the newest release has a build for the host's operating system but only for a different CPU architecture
- **THEN** the component is reported as unavailable for this machine

### Requirement: Removal undoes what the install did, and nothing else
Removing a component SHALL delete its own files, remove any executable links it placed on the application's PATH, remove a tool it installed into the Python tool directory, and clear any driver override that pointed into its files — for every driver runtime. For a component installed into a database, removal SHALL undo the database-side change on the connection it was installed on: a staged adapter's files leave BucketFS, a language container leaves BucketFS and only its own alias leaves the language setting, a script library's schema is dropped. For a virtual-machine appliance imported into VirtualBox, removal SHALL power the machine off and delete it with its disks. Every database-side or machine-side removal SHALL first show a confirmation naming what is dropped and where. Removal SHALL NOT touch files or links belonging to another component, including one whose name merely shares a prefix, SHALL NOT delete a downloaded image the person placed themselves, and SHALL refuse an identifier that is not a single plain directory name.

#### Scenario: A tool is removed
- **WHEN** a component installed as a Python tool is removed
- **THEN** its command no longer exists on the application's PATH

#### Scenario: A neighbouring component is untouched
- **WHEN** a component is removed while another component's executable link exists in the same PATH directory
- **THEN** the other component's link remains

#### Scenario: A malformed identifier is refused
- **WHEN** removal is requested with an identifier containing a path separator or a parent-directory reference
- **THEN** nothing is deleted and the request fails

#### Scenario: A language container is removed
- **WHEN** a language container installed on a connection is removed
- **THEN** its alias is gone from that database's language setting, every other alias is unchanged, and its file is gone from BucketFS

#### Scenario: A script library is removed
- **WHEN** a script library installed into a schema on a connection is removed
- **THEN** the person is shown the schema and connection names and, on confirming, the schema is dropped with everything in it

#### Scenario: A virtual machine is removed
- **WHEN** a Community Edition machine imported into VirtualBox is removed
- **THEN** the person is shown the machine's name and that its disks are destroyed and, on confirming, the machine is powered off, unregistered and deleted; the downloaded image in their Downloads folder remains

## ADDED Requirements

### Requirement: Delivered files state their own next step
For a component whose artifact is used by another tool the person runs themselves (a Lua rock, a dbt package, a source snapshot, a desktop application build), the marketplace SHALL download and verify the file into its own folder without extracting or linking it, SHALL reveal it, and SHALL state the next step for the file's declared format. The next step SHALL be derived from the format, not the component.

#### Scenario: A rock is delivered
- **WHEN** a component with the rockspec format is installed
- **THEN** the rockspec is verified and revealed, and the message names the luarocks command to run on it

#### Scenario: A dbt package is delivered
- **WHEN** a component with the dbt-package format is installed
- **THEN** the archive is verified and revealed, and the message says what to add to the project's package list and to run dbt's dependency step

#### Scenario: A desktop application is delivered
- **WHEN** a component with the desktop-app format is installed
- **THEN** the build for this operating system is chosen, verified and revealed, and the message says to open it

#### Scenario: An unknown format is refused
- **WHEN** a catalogue entry declares a format the marketplace does not know
- **THEN** the component is not offered for install and the catalogue check fails

### Requirement: A language container is installed on a chosen connection without displacing others
Installing a language container SHALL upload the verified container into the chosen connection's BucketFS and SHALL register its alias by appending to the database's language setting. Existing aliases SHALL be preserved. The install record SHALL carry the connection and the alias.

#### Scenario: A container is installed next to the defaults
- **WHEN** a container is installed on a database whose language setting already names Python, Java and R
- **THEN** the setting afterwards names Python, Java, R and the new alias

#### Scenario: The same container is installed again
- **WHEN** a container whose alias is already in the setting is installed again
- **THEN** the alias appears once and the file in BucketFS is replaced

### Requirement: Database changes are shown before they run and happen only on the chosen connection
For a component installed into a database (a script library, a language container, an adapter, a semantic framework), the marketplace SHALL run on a connection the person chose, SHALL show the statements or uploads that will run before anything runs, and SHALL run nothing until they confirm. The install record SHALL name the connection, and the Installed view SHALL show it.

#### Scenario: A script library is installed
- **WHEN** a person installs a script library and picks a connection
- **THEN** every statement that will run is listed on the permission screen, nothing runs before confirmation, and afterwards the schema exists on that connection and the record names it

#### Scenario: The same library on two connections
- **WHEN** a script library is installed on two connections
- **THEN** each has its own install record, and removing one leaves the other

### Requirement: A virtual-machine appliance is imported only where it can run
For a component distributed as a virtual-machine image, the marketplace SHALL offer the install only on a host whose CPU architecture the image supports and SHALL otherwise report why it is unavailable. It SHALL find a hypervisor on the machine and, when none is found, name one and link to it. Because the image is downloaded through a page the marketplace cannot drive, it SHALL open that page and SHALL look for the downloaded image in the person's Downloads folder; when the image is absent, it SHALL record nothing and say what to download. With VirtualBox it SHALL import the image as a named machine and start it; with VMware it SHALL hand the image to the application. A machine of that name already present SHALL be reported as on this system and SHALL NOT be imported again.

#### Scenario: An ARM host
- **WHEN** the marketplace runs on an Apple Silicon or other ARM machine
- **THEN** Community Edition is shown as unavailable with that reason and no install is offered

#### Scenario: No hypervisor
- **WHEN** an x86-64 host has neither VirtualBox nor VMware
- **THEN** the install stops, names a hypervisor to install and links to it, and records nothing

#### Scenario: The image is not downloaded yet
- **WHEN** no file matching the image pattern for a found hypervisor is in Downloads
- **THEN** the download page is opened, the install says which file to download and where, and records nothing

#### Scenario: Import into VirtualBox
- **WHEN** a matching VirtualBox image is in Downloads and no machine of the appliance's name is registered
- **THEN** the image is imported under that name, the machine is started, the log says the image was not verified because no digest is published, and the record carries the hypervisor and the machine name

#### Scenario: The machine already exists
- **WHEN** VirtualBox already lists a machine of the appliance's name
- **THEN** the component shows as on this system and Install is not offered
