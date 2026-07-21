parser grammar ExasolParser;

options { tokenVocab = ExasolLexer; }

// ── Phase 2 starter: SELECT-family skeleton with the rules antlr4-c3 uses as
// preferredRules for entity completion (schemaName/tableName/columnName/
// functionName). Every entity position MUST go through these rules — that is
// what lets the completion core say "a table belongs here". ────────────────

program: statement (SEMI statement)* SEMI? EOF;

statement
    : selectStatement
    | insertStatement
    | updateStatement
    | deleteStatement
    ;

// ── SELECT ──────────────────────────────────────────────────────────────
selectStatement
    : withClause? SELECT (ALL | DISTINCT)? selectList
      fromClause? whereClause? groupByClause? havingClause? qualifyClause?
      orderByClause? limitClause?
      ((UNION ALL? | INTERSECT | MINUS | EXCEPT) selectStatement)?
    ;

withClause: WITH cteItem (COMMA cteItem)*;
cteItem: tableName (LPAREN columnName (COMMA columnName)* RPAREN)? AS LPAREN selectStatement RPAREN;

selectList: selectItem (COMMA selectItem)*;
selectItem: (tableName DOT)? STAR | expression (AS? alias)?;

fromClause: FROM tableRef (COMMA tableRef)* joinClause*;
tableRef
    : schemaQualifiedTable (AS? alias)?
    | LPAREN selectStatement RPAREN (AS? alias)?
    ;
joinClause
    : (INNER | LEFT OUTER? | RIGHT OUTER? | FULL OUTER? | CROSS)? JOIN tableRef
      (ON expression | USING LPAREN columnName (COMMA columnName)* RPAREN)?
    ;

whereClause: WHERE expression;
groupByClause: GROUP BY expression (COMMA expression)*;
havingClause: HAVING expression;
qualifyClause: QUALIFY expression;
orderByClause: ORDER BY orderItem (COMMA orderItem)*;
orderItem: expression (ASC | DESC)? (NULLS (FIRST | LAST))?;
limitClause: LIMIT NUMBER (OFFSET NUMBER)?;

// ── DML skeletons ───────────────────────────────────────────────────────
insertStatement
    : INSERT INTO schemaQualifiedTable (LPAREN columnName (COMMA columnName)* RPAREN)?
      (VALUES LPAREN expression (COMMA expression)* RPAREN | selectStatement)
    ;
updateStatement
    : UPDATE schemaQualifiedTable (AS? alias)? SET columnName EQ expression
      (COMMA columnName EQ expression)* whereClause?
    ;
deleteStatement: DELETE FROM schemaQualifiedTable (AS? alias)? whereClause?;

// ── Expressions (precedence-flattened starter; refine in Phase 2) ───────
expression
    : expression (AND | OR) expression
    | NOT expression
    | predicate
    ;
predicate
    : valueExpr (EQ | NEQ | LT | LTE | GT | GTE) valueExpr
    | valueExpr NOT? BETWEEN valueExpr AND valueExpr
    | valueExpr NOT? IN LPAREN (selectStatement | expression (COMMA expression)*) RPAREN
    | valueExpr NOT? LIKE valueExpr
    | valueExpr IS NOT? NULL_
    | EXISTS LPAREN selectStatement RPAREN
    | valueExpr
    ;
valueExpr
    : valueExpr (PLUS | MINUS_OP | STAR | SLASH | CONCAT_OP) valueExpr
    | functionCall
    | columnRef
    | literal
    | LPAREN (selectStatement | expression) RPAREN
    | caseExpr
    ;
caseExpr: CASE expression? (WHEN expression THEN expression)+ (ELSE expression)? END;
functionCall
    : functionName LPAREN (STAR | DISTINCT? expression (COMMA expression)*)? RPAREN overClause?
    ;
overClause
    : OVER LPAREN (PARTITION BY expression (COMMA expression)*)? orderByClause? RPAREN
    ;

// ── Entity rules (antlr4-c3 preferredRules) ─────────────────────────────
schemaQualifiedTable: (schemaName DOT)? tableName;
columnRef: ((schemaName DOT)? tableName DOT)? columnName;
schemaName: IDENT | QUOTED_IDENT;
tableName: IDENT | QUOTED_IDENT;
columnName: IDENT | QUOTED_IDENT;
functionName: IDENT | QUOTED_IDENT;
alias: IDENT | QUOTED_IDENT;
literal: STRING | NUMBER | NULL_ | TRUE_ | FALSE_ | PARAM;
