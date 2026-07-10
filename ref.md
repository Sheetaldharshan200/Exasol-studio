DB
├── Schemas
│   ├── Schema-1
│   │   ├── tables
│   │   │   └── table-1
│   │   │       ├── columns
│   │   │       │   └── columns-name
│   │   │       └── constraints
│   │   ├── views
│   │   ├── functions
│   │   └── scripts
│   │       ├── adapters
│   │       ├── LUA scripting
│   │       ├── UDFs
│   │       └── Preprocessors
│   ├── virtual schemas     
│   └── Schema-2 
│       ├── tables
│       │   └── table-1
│       │       ├── columns
│       │       │   └── columns-name
│       │       └── constraints
│       ├── views
│       ├── functions
│       └── scripts
│           ├── adapters
│           ├── LUA scripting
│           ├── UDFs
│           └── Preprocessors  
├── System schemas
│   ├── Exa_statistics 
│   │   └── system tables
│   │       ├── EXA_dba_audit_impersonation
│   │       │   └── columns 
│   │       │       └── column names
│   │       ├── EXA_DB_size_Daily
│   │       └── etc..
│   └── SYS
│       └── system tables 
│           └── cat
│               └── columns
│                   └── column names
└── DBA
    ├── Users
    │   ├── sys
    │   └── user-1
    ├── roles
    │   ├── DBA
    │   │   └── sys
    │   └── Public
    ├── consumer groups
    │   ├── HIGH 
    │   ├── LOW
    │   ├── MEDIUM
    │   └── SYS_CONSUMER_GROUP
    ├── connections
    │   ├── EXASOL_CONNECTION_1
    │   └── EXAKIT_SELF
    ├── auditing
    ├── db size
    ├── usage
    ├── clusters
    │   └── Main
    │       ├── monitoring
    │       │   ├── monitoring lasthour
    │       │   ├── monitoring hourly
    │       │   ├── monitoring monthly
    │       │   └── monitoring daily
    │       └── SQL Statistics
    │           ├── Statistics hourly
    │           ├── Statistics daily
    │           └── Statistics monthly
    ├── system
    ├── locks
    └── sessions  
        ├── 4 SYS
        └── 64981263843698649813947217 sys