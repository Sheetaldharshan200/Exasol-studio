## ADDED Requirements

### Requirement: A component's web UI runs inside a Studio tab
Studio SHALL host dash-server inside a workspace tab: start its process from the Marketplace install for a connection the person chose, hand it that connection's credentials only through the process environment, list its hosted apps through the component's own inventory, render the chosen app in the tab, and stop the process when Studio exits. A server already answering on the port SHALL be adopted only when it answers like dash-server.

#### Scenario: Not installed
- **WHEN** the Dashboards tab opens and no dash-server command is found
- **THEN** the tab offers the Marketplace item and nothing else

#### Scenario: Started for a connection
- **WHEN** the person picks a connection and starts the server
- **THEN** the server runs with that connection bootstrapped as its profile, the password never touches a file, and the tab lists the hosted apps

#### Scenario: An app is shown
- **WHEN** an app is picked
- **THEN** its route on the local server renders in the tab, and it can also be opened in the browser

### Requirement: Studio does not duplicate a hosted component
Studio SHALL NOT keep its own dashboard engine beside dash-server: no dashboard canvas, document store, authoring actions or live-share server of its own. The notebook's cells, charts and the built-in System dashboards remain, as they are views of the engine rather than a dashboard product.

#### Scenario: Asking for a dashboard
- **WHEN** someone asks the in-app agent for a dashboard or an artifact
- **THEN** it is built in dash-server and opens in the Dashboards tab
