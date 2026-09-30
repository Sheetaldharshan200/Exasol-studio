## MODIFIED Requirements

### Requirement: A release asset is chosen unambiguously
When a component is installed from a repository release, the artifact SHALL be chosen by the item's declared pattern when it has one, and by the host platform otherwise. A pattern that matches no asset SHALL make the component unavailable for install rather than selecting a guess. A pattern that matches more than one asset SHALL make the component unavailable, unless the item declares that a choice is expected — then the person picks one — or declares that the pattern matches one file per platform — then the host platform's rules pick among the matches. A platform-specific release with no build for the host operating system, or with a build only for another CPU architecture of that operating system, SHALL be reported as unavailable for this machine.

#### Scenario: The upstream file was renamed
- **WHEN** an item's pattern matches none of the newest release's assets
- **THEN** the marketplace shows the component as unavailable and installs nothing

#### Scenario: A release ships several variants
- **WHEN** an item's pattern matches more than one asset and the item declares neither a choice nor one file per platform
- **THEN** the marketplace shows the component as unavailable and installs nothing

#### Scenario: One file per platform
- **WHEN** an item declaring one file per platform has a pattern matching a macOS, a Windows and a Linux file
- **THEN** the host's file is installed, and a host with no matching file is told there is no build for it

#### Scenario: Only another architecture is published
- **WHEN** the newest release has a build for the host's operating system but only for a different CPU architecture
- **THEN** the component is reported as unavailable for this machine
