# Data Flow Graph

```mermaid
flowchart LR
  Editor[SQL Editor]
  Core[Rust Core]
  Safety[Safety Engine]
  Driver[Connectivity Layer]
  Spool[Result Spool]
  Grid[Result Grid]
  AI[AI Layer]

  Editor --> Core
  Core --> Safety
  Safety --> Driver
  Driver --> Spool
  Spool --> Grid
  Core --> AI
  AI --> Core
  Core --> Grid
```

