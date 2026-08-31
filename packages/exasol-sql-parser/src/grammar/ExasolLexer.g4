lexer grammar ExasolLexer;

@members {
// CREATE ... SCRIPT ... AS <body> / — the body is an opaque island (Python/
// Lua/Java/R code does not lex as SQL). SCRIPT arms it; AS enters the island
// mode; ';' disarms (non-script AS usage everywhere else stays untouched).
scriptPending = false;
}

// ── Phase 1 starter: core keyword set. Extend from SYS.EXA_SQL_KEYWORDS
// (reserved vs non-reserved) per TASKS.md before Phase 2. ──────────────────

// Statement heads
SELECT: 'SELECT'; INSERT: 'INSERT'; UPDATE: 'UPDATE'; DELETE: 'DELETE';
MERGE: 'MERGE'; CREATE: 'CREATE'; ALTER: 'ALTER'; DROP: 'DROP';
TRUNCATE: 'TRUNCATE'; GRANT: 'GRANT'; REVOKE: 'REVOKE'; COMMENT: 'COMMENT';
IMPORT: 'IMPORT'; EXPORT: 'EXPORT'; EXECUTE: 'EXECUTE'; EXPLAIN: 'EXPLAIN';

// Clauses
FROM: 'FROM'; WHERE: 'WHERE'; GROUP: 'GROUP'; BY: 'BY'; HAVING: 'HAVING';
QUALIFY: 'QUALIFY'; ORDER: 'ORDER'; LIMIT: 'LIMIT'; OFFSET: 'OFFSET';
WITH: 'WITH'; AS: 'AS' { if (this.scriptPending) { this.scriptPending = false; this.pushMode(ExasolLexer.SCRIPT_ISLAND); } }; INTO: 'INTO'; VALUES: 'VALUES'; SET: 'SET';
UNION: 'UNION'; INTERSECT: 'INTERSECT'; MINUS: 'MINUS'; EXCEPT: 'EXCEPT';
ALL: 'ALL'; DISTINCT: 'DISTINCT';

// Joins
JOIN: 'JOIN'; INNER: 'INNER'; LEFT: 'LEFT'; RIGHT: 'RIGHT'; FULL: 'FULL';
OUTER: 'OUTER'; CROSS: 'CROSS'; ON: 'ON'; USING: 'USING';

// Predicates / expressions
AND: 'AND'; OR: 'OR'; NOT: 'NOT'; IN: 'IN'; EXISTS: 'EXISTS';
BETWEEN: 'BETWEEN'; LIKE: 'LIKE'; REGEXP_LIKE: 'REGEXP_LIKE'; IS: 'IS';
NULL_: 'NULL'; TRUE_: 'TRUE'; FALSE_: 'FALSE'; CASE: 'CASE'; WHEN: 'WHEN';
THEN: 'THEN'; ELSE: 'ELSE'; END: 'END'; CAST: 'CAST'; OVER: 'OVER';
PARTITION: 'PARTITION'; ROWS: 'ROWS'; RANGE: 'RANGE'; PRECEDING: 'PRECEDING';
FOLLOWING: 'FOLLOWING'; UNBOUNDED: 'UNBOUNDED'; CURRENT: 'CURRENT'; ROW: 'ROW';
NULLS: 'NULLS'; FIRST: 'FIRST'; LAST: 'LAST'; ASC: 'ASC'; DESC: 'DESC';

// Objects
SCHEMA: 'SCHEMA'; TABLE: 'TABLE'; VIEW: 'VIEW'; FUNCTION: 'FUNCTION';
SCRIPT: 'SCRIPT' { this.scriptPending = true; }; CONNECTION: 'CONNECTION'; USER: 'USER'; ROLE: 'ROLE';
VIRTUAL: 'VIRTUAL'; ADAPTER: 'ADAPTER'; IF: 'IF'; REPLACE: 'REPLACE';
COLUMN: 'COLUMN'; CONSTRAINT: 'CONSTRAINT'; PRIMARY: 'PRIMARY'; KEY: 'KEY';
FOREIGN: 'FOREIGN'; REFERENCES: 'REFERENCES'; DEFAULT: 'DEFAULT';
IDENTITY: 'IDENTITY'; DISTRIBUTE: 'DISTRIBUTE'; IDENTIFIED: 'IDENTIFIED';

// Scripts / UDFs
SCALAR: 'SCALAR'; RETURNS: 'RETURNS'; EMITS: 'EMITS'; LUA: 'LUA';
PYTHON3: 'PYTHON3'; JAVA: 'JAVA'; R_LANG: 'R';

// IMPORT/EXPORT surface
CSV: 'CSV'; FBV: 'FBV'; JDBC: 'JDBC'; EXA: 'EXA'; LOCAL: 'LOCAL';
AT_KW: 'AT'; FILE_KW: 'FILE'; SECURE: 'SECURE';

// ── Phase 1/2 additions ────────────────────────────────────────────────
CUBE: 'CUBE'; ROLLUP: 'ROLLUP'; GROUPING: 'GROUPING'; SETS: 'SETS';
CONNECT: 'CONNECT'; START: 'START'; PRIOR: 'PRIOR'; NOCYCLE: 'NOCYCLE';
ANY: 'ANY'; SOME: 'SOME'; MATCHED: 'MATCHED';
INTERVAL: 'INTERVAL'; TO: 'TO';
YEAR: 'YEAR'; MONTH: 'MONTH'; DAY: 'DAY'; HOUR: 'HOUR'; MINUTE: 'MINUTE'; SECOND: 'SECOND';
DATE: 'DATE'; TIMESTAMP: 'TIMESTAMP'; EXTRACT: 'EXTRACT'; POSITION: 'POSITION';
DECIMAL_T: 'DECIMAL'; VARCHAR_T: 'VARCHAR'; CHAR_T: 'CHAR'; BOOLEAN_T: 'BOOLEAN';
DOUBLE_T: 'DOUBLE'; PRECISION: 'PRECISION'; GEOMETRY: 'GEOMETRY'; HASHTYPE: 'HASHTYPE';
CHARACTER: 'CHARACTER'; VARYING: 'VARYING'; UTF8: 'UTF8'; ASCII_CS: 'ASCII';

STATEMENT: 'STATEMENT'; ERRORS: 'ERRORS'; REJECT_KW: 'REJECT'; SKIP_KW: 'SKIP';
ENCODING: 'ENCODING';

// Literals & identifiers
STRING: '\'' ('\'\'' | ~'\'')* '\'';
NUMBER: [0-9]+ ('.' [0-9]*)? ([eE] [+-]? [0-9]+)?;
QUOTED_IDENT: '"' ('""' | ~'"')* '"';
IDENT: [A-Za-z_] [A-Za-z0-9_$#]*;

// Punctuation
LPAREN: '('; RPAREN: ')'; COMMA: ','; DOT: '.'; SEMI: ';' { this.scriptPending = false; }; STAR: '*';
EQ: '='; NEQ: '!=' | '<>'; LT: '<'; LTE: '<='; GT: '>'; GTE: '>=';
PLUS: '+'; MINUS_OP: '-'; SLASH: '/'; CONCAT_OP: '||'; PARAM: '?' | ':' IDENT;

// Trivia
LINE_COMMENT: '--' ~[\r\n]* -> channel(HIDDEN);
BLOCK_COMMENT: '/*' .*? '*/' -> channel(HIDDEN);
WS: [ \t\r\n]+ -> channel(HIDDEN);

// Script body island: everything up to the first line that starts with '/'.
mode SCRIPT_ISLAND;
SCRIPT_BODY: .+? [\r\n] '/' -> popMode;
