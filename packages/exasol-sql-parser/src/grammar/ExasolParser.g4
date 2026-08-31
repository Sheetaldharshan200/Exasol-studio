parser grammar ExasolParser;

options { tokenVocab = ExasolLexer; }

// Entity positions ALWAYS go through schemaName/tableName/columnName/
// functionName — the antlr4-c3 completion contract.

program: statement (SEMI statement)* SEMI? EOF;

statement
    : selectStatement
    | insertStatement
    | updateStatement
    | deleteStatement
    | mergeStatement
    | truncateStatement
    | createSchemaStatement
    | createTableStatement
    | dropStatement
    | importStatement
    | exportStatement
    | scriptStatement
    | executeScriptStatement
    | createVirtualSchemaStatement
    ;

// ── Phase 4: Exasol-specific surface ────────────────────────────────────
importStatement
    : IMPORT INTO schemaQualifiedTable (LPAREN columnName (COMMA columnName)* RPAREN)?
      FROM importSource importOption* errorsClause?
    ;
importSource
    : LOCAL SECURE? (CSV | FBV) fileClause+
    | (CSV | FBV) AT_KW connectionRef fileClause+
    | (JDBC | EXA) AT_KW connectionRef (TABLE schemaQualifiedTable | STATEMENT STRING+)
    ;
exportStatement
    : EXPORT (schemaQualifiedTable | LPAREN selectStatement RPAREN)
      INTO exportTarget importOption* errorsClause?
    ;
exportTarget
    : LOCAL SECURE? (CSV | FBV) fileClause+
    | (CSV | FBV) AT_KW connectionRef fileClause+
    | (JDBC | EXA) AT_KW connectionRef (TABLE schemaQualifiedTable | STATEMENT STRING+)
    ;
connectionRef: (identifier | STRING) (USER STRING IDENTIFIED BY STRING)?;
fileClause: FILE_KW STRING;
importOption
    : ENCODING EQ? STRING
    | SKIP_KW EQ? NUMBER
    | ROW IDENT EQ? STRING
    | COLUMN IDENT EQ? STRING
    | identifier EQ (STRING | NUMBER | identifier)
    ;
errorsClause: REJECT_KW LIMIT (NUMBER | IDENT) ERRORS?;

scriptStatement
    : CREATE (OR REPLACE)? scriptLang? (SCALAR | SET)? SCRIPT schemaQualifiedTable
      (LPAREN scriptParam (COMMA scriptParam)* RPAREN | LPAREN RPAREN)?
      (RETURNS (dataType | TABLE) | EMITS LPAREN scriptParam (COMMA scriptParam)* RPAREN)?
      AS SCRIPT_BODY
    ;
scriptLang: PYTHON3 | LUA | JAVA | R_LANG | ADAPTER;
scriptParam: columnName dataType?;
executeScriptStatement
    : EXECUTE SCRIPT schemaQualifiedTable (LPAREN (expression (COMMA expression)*)? RPAREN)?
    ;
createVirtualSchemaStatement
    : CREATE VIRTUAL SCHEMA (IF NOT EXISTS)? schemaName
      USING schemaQualifiedTable (WITH (identifier EQ literal)+)?
    ;

// ── Query expression with set operators ─────────────────────────────────
selectStatement: withClause? queryExpression orderByClause? limitClause?;
queryExpression
    : queryExpression (UNION ALL? | INTERSECT | MINUS | EXCEPT) queryExpression
    | querySpec
    | LPAREN selectStatement RPAREN
    ;
querySpec
    : SELECT (ALL | DISTINCT)? selectList
      fromClause? whereClause? connectByClause? groupByClause? havingClause? qualifyClause?
    | VALUES LPAREN expression (COMMA expression)* RPAREN (COMMA LPAREN expression (COMMA expression)* RPAREN)*
    ;

withClause: WITH cteItem (COMMA cteItem)*;
cteItem: tableName (LPAREN columnName (COMMA columnName)* RPAREN)? AS LPAREN selectStatement RPAREN;

selectList: selectItem (COMMA selectItem)*;
selectItem: (tableName DOT)? STAR | expression (AS? alias)?;

fromClause: FROM tableRef (COMMA tableRef)*;
tableRef: tablePrimary joinClause*;
tablePrimary
    : schemaQualifiedTable (AS? alias)?
    | LPAREN selectStatement RPAREN (AS? alias)?
    ;
joinClause
    : (INNER | LEFT OUTER? | RIGHT OUTER? | FULL OUTER? | CROSS)? JOIN tablePrimary
      (ON expression | USING LPAREN columnName (COMMA columnName)* RPAREN)?
    ;

whereClause: WHERE expression;
connectByClause
    : CONNECT BY NOCYCLE? expression (START WITH expression)?
    | START WITH expression CONNECT BY NOCYCLE? expression
    ;
groupByClause: GROUP BY groupItem (COMMA groupItem)*;
groupItem
    : CUBE LPAREN expression (COMMA expression)* RPAREN
    | ROLLUP LPAREN expression (COMMA expression)* RPAREN
    | GROUPING SETS LPAREN groupItem (COMMA groupItem)* RPAREN
    | LPAREN RPAREN
    | LPAREN expression (COMMA expression)* RPAREN
    | expression
    ;
havingClause: HAVING expression;
qualifyClause: QUALIFY expression;
orderByClause: ORDER BY orderItem (COMMA orderItem)*;
orderItem: expression (ASC | DESC)? (NULLS (FIRST | LAST))?;
limitClause: LIMIT NUMBER (OFFSET NUMBER)? | LIMIT NUMBER COMMA NUMBER;

// ── DML ─────────────────────────────────────────────────────────────────
insertStatement
    : INSERT INTO schemaQualifiedTable (LPAREN columnName (COMMA columnName)* RPAREN)?
      (VALUES LPAREN insertValue (COMMA insertValue)* RPAREN (COMMA LPAREN insertValue (COMMA insertValue)* RPAREN)* | selectStatement | DEFAULT VALUES)
    ;
insertValue: expression | DEFAULT;
updateStatement
    : UPDATE schemaQualifiedTable (AS? alias)? SET columnName EQ expression
      (COMMA columnName EQ expression)* fromClause? whereClause?
    ;
deleteStatement: DELETE FROM schemaQualifiedTable (AS? alias)? whereClause?;
mergeStatement
    : MERGE INTO schemaQualifiedTable (AS? alias)? USING tablePrimary ON expression
      mergeWhen+
    ;
mergeWhen
    : WHEN MATCHED THEN (UPDATE SET columnName EQ expression (COMMA columnName EQ expression)* whereClause? | DELETE whereClause?)
    | WHEN NOT MATCHED THEN INSERT (LPAREN columnName (COMMA columnName)* RPAREN)? VALUES LPAREN insertValue (COMMA insertValue)* RPAREN whereClause?
    ;
truncateStatement: TRUNCATE TABLE schemaQualifiedTable;

// ── DDL (starter) ───────────────────────────────────────────────────────
createSchemaStatement: CREATE VIRTUAL? SCHEMA (IF NOT EXISTS)? schemaName;
createTableStatement
    : CREATE (OR REPLACE)? TABLE (IF NOT EXISTS)? schemaQualifiedTable
      (LPAREN tableElement (COMMA tableElement)* RPAREN | AS selectStatement)
    ;
tableElement
    : columnName dataType (DEFAULT expression)? (NOT? NULL_)? (PRIMARY KEY)? (COMMENT IS? STRING)?
    | CONSTRAINT alias? (PRIMARY KEY | FOREIGN KEY) LPAREN columnName (COMMA columnName)* RPAREN (REFERENCES schemaQualifiedTable)?
    | DISTRIBUTE BY columnName (COMMA columnName)*
    ;
dropStatement
    : DROP (TABLE | VIEW | SCHEMA | FUNCTION | SCRIPT | CONNECTION) (IF EXISTS)? schemaQualifiedTable (CASCADE_OPT=IDENT)?
    ;

dataType
    : DECIMAL_T (LPAREN NUMBER (COMMA NUMBER)? RPAREN)?
    | VARCHAR_T LPAREN NUMBER RPAREN (CHARACTER SET (UTF8 | ASCII_CS))?
    | CHAR_T (LPAREN NUMBER RPAREN)?
    | CHARACTER (VARYING)? (LPAREN NUMBER RPAREN)?
    | BOOLEAN_T
    | DOUBLE_T PRECISION?
    | DATE
    | TIMESTAMP (WITH LOCAL? IDENT IDENT?)?   // WITH [LOCAL] TIME ZONE (TIME/ZONE as idents)
    | INTERVAL YEAR (LPAREN NUMBER RPAREN)? TO MONTH
    | INTERVAL DAY (LPAREN NUMBER RPAREN)? TO SECOND (LPAREN NUMBER RPAREN)?
    | GEOMETRY (LPAREN NUMBER RPAREN)?
    | HASHTYPE (LPAREN NUMBER IDENT? RPAREN)?
    | IDENT (LPAREN NUMBER (COMMA NUMBER)? RPAREN)?
    ;

// ── Expressions ─────────────────────────────────────────────────────────
expression
    : NOT expression
    | expression AND expression
    | expression OR expression
    | predicate
    ;
predicate
    : valueExpr (EQ | NEQ | LT | LTE | GT | GTE) (ANY | SOME | ALL)? (valueExpr | LPAREN selectStatement RPAREN)
    | valueExpr NOT? BETWEEN valueExpr AND valueExpr
    | valueExpr NOT? IN LPAREN (selectStatement | expression (COMMA expression)*) RPAREN
    | valueExpr NOT? (LIKE | REGEXP_LIKE) valueExpr
    | valueExpr IS NOT? NULL_
    | EXISTS LPAREN selectStatement RPAREN
    | valueExpr
    ;
valueExpr
    : valueExpr CONCAT_OP valueExpr
    | valueExpr (STAR | SLASH) valueExpr
    | valueExpr (PLUS | MINUS_OP) valueExpr
    | MINUS_OP valueExpr
    | PRIOR valueExpr
    | primaryExpr
    ;
primaryExpr
    : literal
    | caseExpr
    | castExpr
    | extractExpr
    | positionExpr
    | functionCall
    | columnRef
    | LPAREN (selectStatement | expression) RPAREN
    ;
caseExpr: CASE expression? (WHEN expression THEN expression)+ (ELSE expression)? END;
castExpr: CAST LPAREN expression AS dataType RPAREN;
extractExpr: EXTRACT LPAREN (YEAR | MONTH | DAY | HOUR | MINUTE | SECOND) FROM expression RPAREN;
positionExpr: POSITION LPAREN expression IN expression RPAREN;
functionCall
    : functionName LPAREN (STAR | DISTINCT? expression (COMMA expression)*)? RPAREN overClause?
    ;
overClause
    : OVER LPAREN (PARTITION BY expression (COMMA expression)*)? orderByClause? windowFrame? RPAREN
    ;
windowFrame
    : (ROWS | RANGE) (frameBound | BETWEEN frameBound AND frameBound)
    ;
frameBound
    : UNBOUNDED (PRECEDING | FOLLOWING)
    | CURRENT ROW
    | valueExpr (PRECEDING | FOLLOWING)
    ;

// ── Entities (antlr4-c3 preferredRules) ─────────────────────────────────
schemaQualifiedTable: (schemaName DOT)? tableName;
columnRef: ((schemaName DOT)? tableName DOT)? columnName;
schemaName: identifier;
tableName: identifier;
columnName: identifier;
functionName: identifier;
alias: identifier;
// Non-reserved keywords stay usable as identifiers.
identifier
    : IDENT | QUOTED_IDENT
    | YEAR | MONTH | DAY | HOUR | MINUTE | SECOND | ANY | SOME | MATCHED | SETS
    | CUBE | ROLLUP | GROUPING | START | PRIOR | LOCAL | FILE_KW | AT_KW | CSV | FBV
    ;
literal
    : STRING | NUMBER | NULL_ | TRUE_ | FALSE_ | PARAM
    | DATE STRING
    | TIMESTAMP STRING
    | INTERVAL STRING (YEAR | MONTH | DAY | HOUR | MINUTE | SECOND) (LPAREN NUMBER RPAREN)? (TO (YEAR | MONTH | DAY | HOUR | MINUTE | SECOND))?
    ;
