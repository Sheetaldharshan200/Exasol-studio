## ADDED Requirements

### Requirement: The agent builds dashboards and artifacts through dash-server
The in-app agent SHALL have dash-server's MCP server registered and SHALL be told to build dashboards and artifacts with it. It SHALL NOT have tools of its own that write dashboard specifications or render HTML artifacts.

#### Scenario: dash-server is not running
- **WHEN** the agent is asked for a dashboard and dash-server's tools are unavailable
- **THEN** it says to open the Dashboards tab and start the server, and builds nothing elsewhere

#### Scenario: A narrated dashboard save
- **WHEN** a small model narrates a dashboard save in prose
- **THEN** no dashboard tool call is rescued from the text, since none exists
