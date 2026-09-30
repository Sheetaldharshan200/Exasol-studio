## ADDED Requirements

### Requirement: A component that needs a desktop shell gets one from Studio
For a component whose web build can only reach the database through a desktop shell, Studio SHALL serve the build to a tab on its own scheme, present the shell interface the component looks for, answer the component's shell commands from what Studio knows (its saved connections and their credentials, fetched at the moment of connecting), and run the component's loopback socket proxy — bound to loopback, refusing any origin but the tab's own and any token but this run's, connecting only to the address of a saved Studio connection, and verifying the certificate exactly when that connection's TLS mode verifies it.

#### Scenario: Connecting to the local database from Panorama
- **WHEN** the person opens Panorama's connection panel inside Studio and picks a saved connection
- **THEN** Panorama connects through Studio's proxy to that connection's address with its stored credential, and the self-signed certificate of a local database does not stop it

#### Scenario: A page asks the proxy for another host
- **WHEN** a WebSocket handshake to the proxy names a target that is not a saved connection's address, carries a wrong token, or comes from another origin
- **THEN** the proxy refuses and connects to nothing

#### Scenario: A command Studio cannot answer
- **WHEN** the component invokes a shell command outside the allow-list
- **THEN** the call is rejected with a plain message and the component keeps working

#### Scenario: The build is not installed
- **WHEN** the tab opens and no installed build is found
- **THEN** the tab offers the Marketplace item and serves nothing
