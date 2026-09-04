## Purpose
Sharing lets a dashboard leave the machine it was built on — as a static file to send, or as a
live link others can open — while keeping the shared view read-only and under the owner's control.

## ADDED Requirements

### Requirement: Snapshot export to a portable file
A dashboard SHALL export to a self-contained snapshot in HTML, PDF, or Markdown that renders its
current text, charts, KPIs, and tables without a running server or database connection.

#### Scenario: Export renders offline
- **WHEN** the user exports a dashboard to HTML and opens the file on another machine with no database access
- **THEN** the file shows the dashboard's content as of export

#### Scenario: Format choice
- **WHEN** the user chooses PDF or Markdown instead of HTML
- **THEN** the exported file is in the chosen format with the same content

### Requirement: Live share is read-only, token-gated, and opt-in
A live shared view SHALL be read-only, reachable only with a per-share secret link, and off until
the user turns it on for a dashboard; a viewer SHALL NOT be able to edit, run arbitrary SQL, or
reach other dashboards or data.

#### Scenario: Sharing is off by default
- **WHEN** a dashboard has never been shared
- **THEN** no live link exists and no external endpoint serves it

#### Scenario: A link without the token is refused
- **WHEN** someone requests the share endpoint without the valid token
- **THEN** the request is refused

#### Scenario: The viewer cannot mutate
- **WHEN** a viewer opens a live shared dashboard
- **THEN** they can read it but cannot edit it, run new SQL, or open another dashboard

### Requirement: The shared endpoint is strongly gated
Every request under a share — the page and every asset, data, and API call it makes — SHALL
require the share's token; there SHALL be no unauthenticated route that reveals a dashboard, its
data, its SQL, connection details, or the existence of other shares. The token SHALL be
high-entropy and unguessable, scoped to exactly one dashboard, and SHALL carry no ambient app
authority (it grants viewing that one dashboard and nothing else). A shared endpoint SHALL NOT
enumerate or list other dashboards or shares, and SHALL return the same refusal for a wrong token
as for an unknown share so presence cannot be probed.

#### Scenario: Every sub-request is gated, not just the page
- **WHEN** a viewer loads the shared page and it requests its data
- **THEN** each of those requests also requires the token and is refused without it

#### Scenario: The token unlocks only its own dashboard
- **WHEN** a valid token for dashboard A is used to request dashboard B's share endpoint
- **THEN** the request is refused

#### Scenario: No probing of other shares
- **WHEN** a request carries a wrong or unknown token
- **THEN** the response is identical whether or not a share exists at that path, revealing nothing

#### Scenario: The shared payload carries no privileged detail
- **WHEN** a viewer inspects what the shared view receives
- **THEN** it contains only rendered results and never the widget SQL, the connection string, or credentials

### Requirement: A share can be revoked and rotated by the owner
The owner SHALL be able to stop a share and to rotate its token; after revocation or rotation the
previous link SHALL no longer grant access.

#### Scenario: Revoked link stops working
- **WHEN** the owner revokes a share
- **THEN** the previously working link is refused

#### Scenario: Rotation invalidates the old link
- **WHEN** the owner rotates a share's token
- **THEN** the old link is refused and only the new link works

### Requirement: Public sharing over a self-contained tunnel
Public internet sharing SHALL be available without the user installing external tooling, using a
tunnel bundled with the app. It SHALL offer a Quick mode (an ephemeral URL that changes each
session) and a Stable mode (a persistent URL that returns to the same address across restarts).

#### Scenario: Quick public link
- **WHEN** the user starts a Quick public share
- **THEN** a working public URL is produced without the user installing anything

#### Scenario: Stable link returns to the same address
- **WHEN** the user has a Stable share, closes the app, and reopens it and re-enables sharing
- **THEN** the dashboard is served at the same URL as before

### Requirement: Offline fallback for a live link
While the owner's machine is offline, a shared link SHALL serve the last published static snapshot
rather than an error, and SHALL return to live data when the owner's machine is back and sharing
is on.

#### Scenario: Visitor while owner is offline
- **WHEN** a visitor opens a stable shared link while the owner's app is closed
- **THEN** they see the last published snapshot instead of a dead page

#### Scenario: Back to live
- **WHEN** the owner reopens the app with sharing on
- **THEN** the link serves live, refreshing data again
