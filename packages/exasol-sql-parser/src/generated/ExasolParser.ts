// Generated from src/grammar/ExasolParser.g4 by ANTLR 4.13.1

import * as antlr from "antlr4ng";
import { Token } from "antlr4ng";

import { ExasolParserListener } from "./ExasolParserListener.ts";
import { ExasolParserVisitor } from "./ExasolParserVisitor.ts";

// for running tests with parameters, TODO: discuss strategy for typed parameters in CI
// eslint-disable-next-line no-unused-vars
type int = number;


export class ExasolParser extends antlr.Parser {
    public static readonly SELECT = 1;
    public static readonly INSERT = 2;
    public static readonly UPDATE = 3;
    public static readonly DELETE = 4;
    public static readonly MERGE = 5;
    public static readonly CREATE = 6;
    public static readonly ALTER = 7;
    public static readonly DROP = 8;
    public static readonly TRUNCATE = 9;
    public static readonly GRANT = 10;
    public static readonly REVOKE = 11;
    public static readonly COMMENT = 12;
    public static readonly IMPORT = 13;
    public static readonly EXPORT = 14;
    public static readonly EXECUTE = 15;
    public static readonly EXPLAIN = 16;
    public static readonly FROM = 17;
    public static readonly WHERE = 18;
    public static readonly GROUP = 19;
    public static readonly BY = 20;
    public static readonly HAVING = 21;
    public static readonly QUALIFY = 22;
    public static readonly ORDER = 23;
    public static readonly LIMIT = 24;
    public static readonly OFFSET = 25;
    public static readonly WITH = 26;
    public static readonly AS = 27;
    public static readonly INTO = 28;
    public static readonly VALUES = 29;
    public static readonly SET = 30;
    public static readonly UNION = 31;
    public static readonly INTERSECT = 32;
    public static readonly MINUS = 33;
    public static readonly EXCEPT = 34;
    public static readonly ALL = 35;
    public static readonly DISTINCT = 36;
    public static readonly JOIN = 37;
    public static readonly INNER = 38;
    public static readonly LEFT = 39;
    public static readonly RIGHT = 40;
    public static readonly FULL = 41;
    public static readonly OUTER = 42;
    public static readonly CROSS = 43;
    public static readonly ON = 44;
    public static readonly USING = 45;
    public static readonly AND = 46;
    public static readonly OR = 47;
    public static readonly NOT = 48;
    public static readonly IN = 49;
    public static readonly EXISTS = 50;
    public static readonly BETWEEN = 51;
    public static readonly LIKE = 52;
    public static readonly REGEXP_LIKE = 53;
    public static readonly IS = 54;
    public static readonly NULL_ = 55;
    public static readonly TRUE_ = 56;
    public static readonly FALSE_ = 57;
    public static readonly CASE = 58;
    public static readonly WHEN = 59;
    public static readonly THEN = 60;
    public static readonly ELSE = 61;
    public static readonly END = 62;
    public static readonly CAST = 63;
    public static readonly OVER = 64;
    public static readonly PARTITION = 65;
    public static readonly ROWS = 66;
    public static readonly RANGE = 67;
    public static readonly PRECEDING = 68;
    public static readonly FOLLOWING = 69;
    public static readonly UNBOUNDED = 70;
    public static readonly CURRENT = 71;
    public static readonly ROW = 72;
    public static readonly NULLS = 73;
    public static readonly FIRST = 74;
    public static readonly LAST = 75;
    public static readonly ASC = 76;
    public static readonly DESC = 77;
    public static readonly SCHEMA = 78;
    public static readonly TABLE = 79;
    public static readonly VIEW = 80;
    public static readonly FUNCTION = 81;
    public static readonly SCRIPT = 82;
    public static readonly CONNECTION = 83;
    public static readonly USER = 84;
    public static readonly ROLE = 85;
    public static readonly VIRTUAL = 86;
    public static readonly ADAPTER = 87;
    public static readonly IF = 88;
    public static readonly REPLACE = 89;
    public static readonly COLUMN = 90;
    public static readonly CONSTRAINT = 91;
    public static readonly PRIMARY = 92;
    public static readonly KEY = 93;
    public static readonly FOREIGN = 94;
    public static readonly REFERENCES = 95;
    public static readonly DEFAULT = 96;
    public static readonly IDENTITY = 97;
    public static readonly DISTRIBUTE = 98;
    public static readonly IDENTIFIED = 99;
    public static readonly SCALAR = 100;
    public static readonly RETURNS = 101;
    public static readonly EMITS = 102;
    public static readonly LUA = 103;
    public static readonly PYTHON3 = 104;
    public static readonly JAVA = 105;
    public static readonly R_LANG = 106;
    public static readonly CSV = 107;
    public static readonly FBV = 108;
    public static readonly JDBC = 109;
    public static readonly EXA = 110;
    public static readonly LOCAL = 111;
    public static readonly AT_KW = 112;
    public static readonly FILE_KW = 113;
    public static readonly SECURE = 114;
    public static readonly CUBE = 115;
    public static readonly ROLLUP = 116;
    public static readonly GROUPING = 117;
    public static readonly SETS = 118;
    public static readonly CONNECT = 119;
    public static readonly START = 120;
    public static readonly PRIOR = 121;
    public static readonly NOCYCLE = 122;
    public static readonly ANY = 123;
    public static readonly SOME = 124;
    public static readonly MATCHED = 125;
    public static readonly INTERVAL = 126;
    public static readonly TO = 127;
    public static readonly YEAR = 128;
    public static readonly MONTH = 129;
    public static readonly DAY = 130;
    public static readonly HOUR = 131;
    public static readonly MINUTE = 132;
    public static readonly SECOND = 133;
    public static readonly DATE = 134;
    public static readonly TIMESTAMP = 135;
    public static readonly EXTRACT = 136;
    public static readonly POSITION = 137;
    public static readonly DECIMAL_T = 138;
    public static readonly VARCHAR_T = 139;
    public static readonly CHAR_T = 140;
    public static readonly BOOLEAN_T = 141;
    public static readonly DOUBLE_T = 142;
    public static readonly PRECISION = 143;
    public static readonly GEOMETRY = 144;
    public static readonly HASHTYPE = 145;
    public static readonly CHARACTER = 146;
    public static readonly VARYING = 147;
    public static readonly UTF8 = 148;
    public static readonly ASCII_CS = 149;
    public static readonly STRING = 150;
    public static readonly NUMBER = 151;
    public static readonly QUOTED_IDENT = 152;
    public static readonly IDENT = 153;
    public static readonly LPAREN = 154;
    public static readonly RPAREN = 155;
    public static readonly COMMA = 156;
    public static readonly DOT = 157;
    public static readonly SEMI = 158;
    public static readonly STAR = 159;
    public static readonly EQ = 160;
    public static readonly NEQ = 161;
    public static readonly LT = 162;
    public static readonly LTE = 163;
    public static readonly GT = 164;
    public static readonly GTE = 165;
    public static readonly PLUS = 166;
    public static readonly MINUS_OP = 167;
    public static readonly SLASH = 168;
    public static readonly CONCAT_OP = 169;
    public static readonly PARAM = 170;
    public static readonly LINE_COMMENT = 171;
    public static readonly BLOCK_COMMENT = 172;
    public static readonly WS = 173;
    public static readonly RULE_program = 0;
    public static readonly RULE_statement = 1;
    public static readonly RULE_selectStatement = 2;
    public static readonly RULE_queryExpression = 3;
    public static readonly RULE_querySpec = 4;
    public static readonly RULE_withClause = 5;
    public static readonly RULE_cteItem = 6;
    public static readonly RULE_selectList = 7;
    public static readonly RULE_selectItem = 8;
    public static readonly RULE_fromClause = 9;
    public static readonly RULE_tableRef = 10;
    public static readonly RULE_tablePrimary = 11;
    public static readonly RULE_joinClause = 12;
    public static readonly RULE_whereClause = 13;
    public static readonly RULE_connectByClause = 14;
    public static readonly RULE_groupByClause = 15;
    public static readonly RULE_groupItem = 16;
    public static readonly RULE_havingClause = 17;
    public static readonly RULE_qualifyClause = 18;
    public static readonly RULE_orderByClause = 19;
    public static readonly RULE_orderItem = 20;
    public static readonly RULE_limitClause = 21;
    public static readonly RULE_insertStatement = 22;
    public static readonly RULE_insertValue = 23;
    public static readonly RULE_updateStatement = 24;
    public static readonly RULE_deleteStatement = 25;
    public static readonly RULE_mergeStatement = 26;
    public static readonly RULE_mergeWhen = 27;
    public static readonly RULE_truncateStatement = 28;
    public static readonly RULE_createSchemaStatement = 29;
    public static readonly RULE_createTableStatement = 30;
    public static readonly RULE_tableElement = 31;
    public static readonly RULE_dropStatement = 32;
    public static readonly RULE_dataType = 33;
    public static readonly RULE_expression = 34;
    public static readonly RULE_predicate = 35;
    public static readonly RULE_valueExpr = 36;
    public static readonly RULE_primaryExpr = 37;
    public static readonly RULE_caseExpr = 38;
    public static readonly RULE_castExpr = 39;
    public static readonly RULE_extractExpr = 40;
    public static readonly RULE_positionExpr = 41;
    public static readonly RULE_functionCall = 42;
    public static readonly RULE_overClause = 43;
    public static readonly RULE_windowFrame = 44;
    public static readonly RULE_frameBound = 45;
    public static readonly RULE_schemaQualifiedTable = 46;
    public static readonly RULE_columnRef = 47;
    public static readonly RULE_schemaName = 48;
    public static readonly RULE_tableName = 49;
    public static readonly RULE_columnName = 50;
    public static readonly RULE_functionName = 51;
    public static readonly RULE_alias = 52;
    public static readonly RULE_identifier = 53;
    public static readonly RULE_literal = 54;

    public static readonly literalNames = [
        null, "'SELECT'", "'INSERT'", "'UPDATE'", "'DELETE'", "'MERGE'", 
        "'CREATE'", "'ALTER'", "'DROP'", "'TRUNCATE'", "'GRANT'", "'REVOKE'", 
        "'COMMENT'", "'IMPORT'", "'EXPORT'", "'EXECUTE'", "'EXPLAIN'", "'FROM'", 
        "'WHERE'", "'GROUP'", "'BY'", "'HAVING'", "'QUALIFY'", "'ORDER'", 
        "'LIMIT'", "'OFFSET'", "'WITH'", "'AS'", "'INTO'", "'VALUES'", "'SET'", 
        "'UNION'", "'INTERSECT'", "'MINUS'", "'EXCEPT'", "'ALL'", "'DISTINCT'", 
        "'JOIN'", "'INNER'", "'LEFT'", "'RIGHT'", "'FULL'", "'OUTER'", "'CROSS'", 
        "'ON'", "'USING'", "'AND'", "'OR'", "'NOT'", "'IN'", "'EXISTS'", 
        "'BETWEEN'", "'LIKE'", "'REGEXP_LIKE'", "'IS'", "'NULL'", "'TRUE'", 
        "'FALSE'", "'CASE'", "'WHEN'", "'THEN'", "'ELSE'", "'END'", "'CAST'", 
        "'OVER'", "'PARTITION'", "'ROWS'", "'RANGE'", "'PRECEDING'", "'FOLLOWING'", 
        "'UNBOUNDED'", "'CURRENT'", "'ROW'", "'NULLS'", "'FIRST'", "'LAST'", 
        "'ASC'", "'DESC'", "'SCHEMA'", "'TABLE'", "'VIEW'", "'FUNCTION'", 
        "'SCRIPT'", "'CONNECTION'", "'USER'", "'ROLE'", "'VIRTUAL'", "'ADAPTER'", 
        "'IF'", "'REPLACE'", "'COLUMN'", "'CONSTRAINT'", "'PRIMARY'", "'KEY'", 
        "'FOREIGN'", "'REFERENCES'", "'DEFAULT'", "'IDENTITY'", "'DISTRIBUTE'", 
        "'IDENTIFIED'", "'SCALAR'", "'RETURNS'", "'EMITS'", "'LUA'", "'PYTHON3'", 
        "'JAVA'", "'R'", "'CSV'", "'FBV'", "'JDBC'", "'EXA'", "'LOCAL'", 
        "'AT'", "'FILE'", "'SECURE'", "'CUBE'", "'ROLLUP'", "'GROUPING'", 
        "'SETS'", "'CONNECT'", "'START'", "'PRIOR'", "'NOCYCLE'", "'ANY'", 
        "'SOME'", "'MATCHED'", "'INTERVAL'", "'TO'", "'YEAR'", "'MONTH'", 
        "'DAY'", "'HOUR'", "'MINUTE'", "'SECOND'", "'DATE'", "'TIMESTAMP'", 
        "'EXTRACT'", "'POSITION'", "'DECIMAL'", "'VARCHAR'", "'CHAR'", "'BOOLEAN'", 
        "'DOUBLE'", "'PRECISION'", "'GEOMETRY'", "'HASHTYPE'", "'CHARACTER'", 
        "'VARYING'", "'UTF8'", "'ASCII'", null, null, null, null, "'('", 
        "')'", "','", "'.'", "';'", "'*'", "'='", null, "'<'", "'<='", "'>'", 
        "'>='", "'+'", "'-'", "'/'", "'||'"
    ];

    public static readonly symbolicNames = [
        null, "SELECT", "INSERT", "UPDATE", "DELETE", "MERGE", "CREATE", 
        "ALTER", "DROP", "TRUNCATE", "GRANT", "REVOKE", "COMMENT", "IMPORT", 
        "EXPORT", "EXECUTE", "EXPLAIN", "FROM", "WHERE", "GROUP", "BY", 
        "HAVING", "QUALIFY", "ORDER", "LIMIT", "OFFSET", "WITH", "AS", "INTO", 
        "VALUES", "SET", "UNION", "INTERSECT", "MINUS", "EXCEPT", "ALL", 
        "DISTINCT", "JOIN", "INNER", "LEFT", "RIGHT", "FULL", "OUTER", "CROSS", 
        "ON", "USING", "AND", "OR", "NOT", "IN", "EXISTS", "BETWEEN", "LIKE", 
        "REGEXP_LIKE", "IS", "NULL_", "TRUE_", "FALSE_", "CASE", "WHEN", 
        "THEN", "ELSE", "END", "CAST", "OVER", "PARTITION", "ROWS", "RANGE", 
        "PRECEDING", "FOLLOWING", "UNBOUNDED", "CURRENT", "ROW", "NULLS", 
        "FIRST", "LAST", "ASC", "DESC", "SCHEMA", "TABLE", "VIEW", "FUNCTION", 
        "SCRIPT", "CONNECTION", "USER", "ROLE", "VIRTUAL", "ADAPTER", "IF", 
        "REPLACE", "COLUMN", "CONSTRAINT", "PRIMARY", "KEY", "FOREIGN", 
        "REFERENCES", "DEFAULT", "IDENTITY", "DISTRIBUTE", "IDENTIFIED", 
        "SCALAR", "RETURNS", "EMITS", "LUA", "PYTHON3", "JAVA", "R_LANG", 
        "CSV", "FBV", "JDBC", "EXA", "LOCAL", "AT_KW", "FILE_KW", "SECURE", 
        "CUBE", "ROLLUP", "GROUPING", "SETS", "CONNECT", "START", "PRIOR", 
        "NOCYCLE", "ANY", "SOME", "MATCHED", "INTERVAL", "TO", "YEAR", "MONTH", 
        "DAY", "HOUR", "MINUTE", "SECOND", "DATE", "TIMESTAMP", "EXTRACT", 
        "POSITION", "DECIMAL_T", "VARCHAR_T", "CHAR_T", "BOOLEAN_T", "DOUBLE_T", 
        "PRECISION", "GEOMETRY", "HASHTYPE", "CHARACTER", "VARYING", "UTF8", 
        "ASCII_CS", "STRING", "NUMBER", "QUOTED_IDENT", "IDENT", "LPAREN", 
        "RPAREN", "COMMA", "DOT", "SEMI", "STAR", "EQ", "NEQ", "LT", "LTE", 
        "GT", "GTE", "PLUS", "MINUS_OP", "SLASH", "CONCAT_OP", "PARAM", 
        "LINE_COMMENT", "BLOCK_COMMENT", "WS"
    ];
    public static readonly ruleNames = [
        "program", "statement", "selectStatement", "queryExpression", "querySpec", 
        "withClause", "cteItem", "selectList", "selectItem", "fromClause", 
        "tableRef", "tablePrimary", "joinClause", "whereClause", "connectByClause", 
        "groupByClause", "groupItem", "havingClause", "qualifyClause", "orderByClause", 
        "orderItem", "limitClause", "insertStatement", "insertValue", "updateStatement", 
        "deleteStatement", "mergeStatement", "mergeWhen", "truncateStatement", 
        "createSchemaStatement", "createTableStatement", "tableElement", 
        "dropStatement", "dataType", "expression", "predicate", "valueExpr", 
        "primaryExpr", "caseExpr", "castExpr", "extractExpr", "positionExpr", 
        "functionCall", "overClause", "windowFrame", "frameBound", "schemaQualifiedTable", 
        "columnRef", "schemaName", "tableName", "columnName", "functionName", 
        "alias", "identifier", "literal",
    ];

    public get grammarFileName(): string { return "ExasolParser.g4"; }
    public get literalNames(): (string | null)[] { return ExasolParser.literalNames; }
    public get symbolicNames(): (string | null)[] { return ExasolParser.symbolicNames; }
    public get ruleNames(): string[] { return ExasolParser.ruleNames; }
    public get serializedATN(): number[] { return ExasolParser._serializedATN; }

    protected createFailedPredicateException(predicate?: string, message?: string): antlr.FailedPredicateException {
        return new antlr.FailedPredicateException(this, predicate, message);
    }

    public constructor(input: antlr.TokenStream) {
        super(input);
        this.interpreter = new antlr.ParserATNSimulator(this, ExasolParser._ATN, ExasolParser.decisionsToDFA, new antlr.PredictionContextCache());
    }
    public program(): ProgramContext {
        let localContext = new ProgramContext(this.context, this.state);
        this.enterRule(localContext, 0, ExasolParser.RULE_program);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 110;
            this.statement();
            this.state = 115;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 0, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 111;
                    this.match(ExasolParser.SEMI);
                    this.state = 112;
                    this.statement();
                    }
                    }
                }
                this.state = 117;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 0, this.context);
            }
            this.state = 119;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 158) {
                {
                this.state = 118;
                this.match(ExasolParser.SEMI);
                }
            }

            this.state = 121;
            this.match(ExasolParser.EOF);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public statement(): StatementContext {
        let localContext = new StatementContext(this.context, this.state);
        this.enterRule(localContext, 2, ExasolParser.RULE_statement);
        try {
            this.state = 132;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 2, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 123;
                this.selectStatement();
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 124;
                this.insertStatement();
                }
                break;
            case 3:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 125;
                this.updateStatement();
                }
                break;
            case 4:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 126;
                this.deleteStatement();
                }
                break;
            case 5:
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 127;
                this.mergeStatement();
                }
                break;
            case 6:
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 128;
                this.truncateStatement();
                }
                break;
            case 7:
                this.enterOuterAlt(localContext, 7);
                {
                this.state = 129;
                this.createSchemaStatement();
                }
                break;
            case 8:
                this.enterOuterAlt(localContext, 8);
                {
                this.state = 130;
                this.createTableStatement();
                }
                break;
            case 9:
                this.enterOuterAlt(localContext, 9);
                {
                this.state = 131;
                this.dropStatement();
                }
                break;
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public selectStatement(): SelectStatementContext {
        let localContext = new SelectStatementContext(this.context, this.state);
        this.enterRule(localContext, 4, ExasolParser.RULE_selectStatement);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 135;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 26) {
                {
                this.state = 134;
                this.withClause();
                }
            }

            this.state = 137;
            this.queryExpression(0);
            this.state = 139;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 23) {
                {
                this.state = 138;
                this.orderByClause();
                }
            }

            this.state = 142;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 24) {
                {
                this.state = 141;
                this.limitClause();
                }
            }

            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }

    public queryExpression(): QueryExpressionContext;
    public queryExpression(_p: number): QueryExpressionContext;
    public queryExpression(_p?: number): QueryExpressionContext {
        if (_p === undefined) {
            _p = 0;
        }

        let parentContext = this.context;
        let parentState = this.state;
        let localContext = new QueryExpressionContext(this.context, parentState);
        let previousContext = localContext;
        let _startState = 6;
        this.enterRecursionRule(localContext, 6, ExasolParser.RULE_queryExpression, _p);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 150;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ExasolParser.SELECT:
            case ExasolParser.VALUES:
                {
                this.state = 145;
                this.querySpec();
                }
                break;
            case ExasolParser.LPAREN:
                {
                this.state = 146;
                this.match(ExasolParser.LPAREN);
                this.state = 147;
                this.selectStatement();
                this.state = 148;
                this.match(ExasolParser.RPAREN);
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
            this.context!.stop = this.tokenStream.LT(-1);
            this.state = 165;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 9, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    if (this.parseListeners != null) {
                        this.triggerExitRuleEvent();
                    }
                    previousContext = localContext;
                    {
                    {
                    localContext = new QueryExpressionContext(parentContext, parentState);
                    this.pushNewRecursionContext(localContext, _startState, ExasolParser.RULE_queryExpression);
                    this.state = 152;
                    if (!(this.precpred(this.context, 3))) {
                        throw this.createFailedPredicateException("this.precpred(this.context, 3)");
                    }
                    this.state = 160;
                    this.errorHandler.sync(this);
                    switch (this.tokenStream.LA(1)) {
                    case ExasolParser.UNION:
                        {
                        this.state = 153;
                        this.match(ExasolParser.UNION);
                        this.state = 155;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 35) {
                            {
                            this.state = 154;
                            this.match(ExasolParser.ALL);
                            }
                        }

                        }
                        break;
                    case ExasolParser.INTERSECT:
                        {
                        this.state = 157;
                        this.match(ExasolParser.INTERSECT);
                        }
                        break;
                    case ExasolParser.MINUS:
                        {
                        this.state = 158;
                        this.match(ExasolParser.MINUS);
                        }
                        break;
                    case ExasolParser.EXCEPT:
                        {
                        this.state = 159;
                        this.match(ExasolParser.EXCEPT);
                        }
                        break;
                    default:
                        throw new antlr.NoViableAltException(this);
                    }
                    this.state = 162;
                    this.queryExpression(4);
                    }
                    }
                }
                this.state = 167;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 9, this.context);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.unrollRecursionContexts(parentContext);
        }
        return localContext;
    }
    public querySpec(): QuerySpecContext {
        let localContext = new QuerySpecContext(this.context, this.state);
        this.enterRule(localContext, 8, ExasolParser.RULE_querySpec);
        let _la: number;
        try {
            let alternative: number;
            this.state = 219;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ExasolParser.SELECT:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 168;
                this.match(ExasolParser.SELECT);
                this.state = 170;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 35 || _la === 36) {
                    {
                    this.state = 169;
                    _la = this.tokenStream.LA(1);
                    if(!(_la === 35 || _la === 36)) {
                    this.errorHandler.recoverInline(this);
                    }
                    else {
                        this.errorHandler.reportMatch(this);
                        this.consume();
                    }
                    }
                }

                this.state = 172;
                this.selectList();
                this.state = 174;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 11, this.context) ) {
                case 1:
                    {
                    this.state = 173;
                    this.fromClause();
                    }
                    break;
                }
                this.state = 177;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 12, this.context) ) {
                case 1:
                    {
                    this.state = 176;
                    this.whereClause();
                    }
                    break;
                }
                this.state = 180;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 13, this.context) ) {
                case 1:
                    {
                    this.state = 179;
                    this.connectByClause();
                    }
                    break;
                }
                this.state = 183;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 14, this.context) ) {
                case 1:
                    {
                    this.state = 182;
                    this.groupByClause();
                    }
                    break;
                }
                this.state = 186;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 15, this.context) ) {
                case 1:
                    {
                    this.state = 185;
                    this.havingClause();
                    }
                    break;
                }
                this.state = 189;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 16, this.context) ) {
                case 1:
                    {
                    this.state = 188;
                    this.qualifyClause();
                    }
                    break;
                }
                }
                break;
            case ExasolParser.VALUES:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 191;
                this.match(ExasolParser.VALUES);
                this.state = 192;
                this.match(ExasolParser.LPAREN);
                this.state = 193;
                this.expression(0);
                this.state = 198;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 156) {
                    {
                    {
                    this.state = 194;
                    this.match(ExasolParser.COMMA);
                    this.state = 195;
                    this.expression(0);
                    }
                    }
                    this.state = 200;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 201;
                this.match(ExasolParser.RPAREN);
                this.state = 216;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 19, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                        {
                        {
                        this.state = 202;
                        this.match(ExasolParser.COMMA);
                        this.state = 203;
                        this.match(ExasolParser.LPAREN);
                        this.state = 204;
                        this.expression(0);
                        this.state = 209;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        while (_la === 156) {
                            {
                            {
                            this.state = 205;
                            this.match(ExasolParser.COMMA);
                            this.state = 206;
                            this.expression(0);
                            }
                            }
                            this.state = 211;
                            this.errorHandler.sync(this);
                            _la = this.tokenStream.LA(1);
                        }
                        this.state = 212;
                        this.match(ExasolParser.RPAREN);
                        }
                        }
                    }
                    this.state = 218;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 19, this.context);
                }
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public withClause(): WithClauseContext {
        let localContext = new WithClauseContext(this.context, this.state);
        this.enterRule(localContext, 10, ExasolParser.RULE_withClause);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 221;
            this.match(ExasolParser.WITH);
            this.state = 222;
            this.cteItem();
            this.state = 227;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 156) {
                {
                {
                this.state = 223;
                this.match(ExasolParser.COMMA);
                this.state = 224;
                this.cteItem();
                }
                }
                this.state = 229;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public cteItem(): CteItemContext {
        let localContext = new CteItemContext(this.context, this.state);
        this.enterRule(localContext, 12, ExasolParser.RULE_cteItem);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 230;
            this.tableName();
            this.state = 242;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 154) {
                {
                this.state = 231;
                this.match(ExasolParser.LPAREN);
                this.state = 232;
                this.columnName();
                this.state = 237;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 156) {
                    {
                    {
                    this.state = 233;
                    this.match(ExasolParser.COMMA);
                    this.state = 234;
                    this.columnName();
                    }
                    }
                    this.state = 239;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 240;
                this.match(ExasolParser.RPAREN);
                }
            }

            this.state = 244;
            this.match(ExasolParser.AS);
            this.state = 245;
            this.match(ExasolParser.LPAREN);
            this.state = 246;
            this.selectStatement();
            this.state = 247;
            this.match(ExasolParser.RPAREN);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public selectList(): SelectListContext {
        let localContext = new SelectListContext(this.context, this.state);
        this.enterRule(localContext, 14, ExasolParser.RULE_selectList);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 249;
            this.selectItem();
            this.state = 254;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 24, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 250;
                    this.match(ExasolParser.COMMA);
                    this.state = 251;
                    this.selectItem();
                    }
                    }
                }
                this.state = 256;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 24, this.context);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public selectItem(): SelectItemContext {
        let localContext = new SelectItemContext(this.context, this.state);
        this.enterRule(localContext, 16, ExasolParser.RULE_selectItem);
        let _la: number;
        try {
            this.state = 270;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 28, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 260;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (((((_la - 107)) & ~0x1F) === 0 && ((1 << (_la - 107)) & 132607859) !== 0) || _la === 152 || _la === 153) {
                    {
                    this.state = 257;
                    this.tableName();
                    this.state = 258;
                    this.match(ExasolParser.DOT);
                    }
                }

                this.state = 262;
                this.match(ExasolParser.STAR);
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 263;
                this.expression(0);
                this.state = 268;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 27, this.context) ) {
                case 1:
                    {
                    this.state = 265;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 27) {
                        {
                        this.state = 264;
                        this.match(ExasolParser.AS);
                        }
                    }

                    this.state = 267;
                    this.alias();
                    }
                    break;
                }
                }
                break;
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public fromClause(): FromClauseContext {
        let localContext = new FromClauseContext(this.context, this.state);
        this.enterRule(localContext, 18, ExasolParser.RULE_fromClause);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 272;
            this.match(ExasolParser.FROM);
            this.state = 273;
            this.tableRef();
            this.state = 278;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 29, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 274;
                    this.match(ExasolParser.COMMA);
                    this.state = 275;
                    this.tableRef();
                    }
                    }
                }
                this.state = 280;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 29, this.context);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public tableRef(): TableRefContext {
        let localContext = new TableRefContext(this.context, this.state);
        this.enterRule(localContext, 20, ExasolParser.RULE_tableRef);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 281;
            this.tablePrimary();
            this.state = 285;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 30, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 282;
                    this.joinClause();
                    }
                    }
                }
                this.state = 287;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 30, this.context);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public tablePrimary(): TablePrimaryContext {
        let localContext = new TablePrimaryContext(this.context, this.state);
        this.enterRule(localContext, 22, ExasolParser.RULE_tablePrimary);
        let _la: number;
        try {
            this.state = 304;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ExasolParser.CSV:
            case ExasolParser.FBV:
            case ExasolParser.LOCAL:
            case ExasolParser.AT_KW:
            case ExasolParser.FILE_KW:
            case ExasolParser.CUBE:
            case ExasolParser.ROLLUP:
            case ExasolParser.GROUPING:
            case ExasolParser.SETS:
            case ExasolParser.START:
            case ExasolParser.PRIOR:
            case ExasolParser.ANY:
            case ExasolParser.SOME:
            case ExasolParser.MATCHED:
            case ExasolParser.YEAR:
            case ExasolParser.MONTH:
            case ExasolParser.DAY:
            case ExasolParser.HOUR:
            case ExasolParser.MINUTE:
            case ExasolParser.SECOND:
            case ExasolParser.QUOTED_IDENT:
            case ExasolParser.IDENT:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 288;
                this.schemaQualifiedTable();
                this.state = 293;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 32, this.context) ) {
                case 1:
                    {
                    this.state = 290;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 27) {
                        {
                        this.state = 289;
                        this.match(ExasolParser.AS);
                        }
                    }

                    this.state = 292;
                    this.alias();
                    }
                    break;
                }
                }
                break;
            case ExasolParser.LPAREN:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 295;
                this.match(ExasolParser.LPAREN);
                this.state = 296;
                this.selectStatement();
                this.state = 297;
                this.match(ExasolParser.RPAREN);
                this.state = 302;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 34, this.context) ) {
                case 1:
                    {
                    this.state = 299;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 27) {
                        {
                        this.state = 298;
                        this.match(ExasolParser.AS);
                        }
                    }

                    this.state = 301;
                    this.alias();
                    }
                    break;
                }
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public joinClause(): JoinClauseContext {
        let localContext = new JoinClauseContext(this.context, this.state);
        this.enterRule(localContext, 24, ExasolParser.RULE_joinClause);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 320;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ExasolParser.INNER:
                {
                this.state = 306;
                this.match(ExasolParser.INNER);
                }
                break;
            case ExasolParser.LEFT:
                {
                this.state = 307;
                this.match(ExasolParser.LEFT);
                this.state = 309;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 42) {
                    {
                    this.state = 308;
                    this.match(ExasolParser.OUTER);
                    }
                }

                }
                break;
            case ExasolParser.RIGHT:
                {
                this.state = 311;
                this.match(ExasolParser.RIGHT);
                this.state = 313;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 42) {
                    {
                    this.state = 312;
                    this.match(ExasolParser.OUTER);
                    }
                }

                }
                break;
            case ExasolParser.FULL:
                {
                this.state = 315;
                this.match(ExasolParser.FULL);
                this.state = 317;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 42) {
                    {
                    this.state = 316;
                    this.match(ExasolParser.OUTER);
                    }
                }

                }
                break;
            case ExasolParser.CROSS:
                {
                this.state = 319;
                this.match(ExasolParser.CROSS);
                }
                break;
            case ExasolParser.JOIN:
                break;
            default:
                break;
            }
            this.state = 322;
            this.match(ExasolParser.JOIN);
            this.state = 323;
            this.tablePrimary();
            this.state = 338;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 41, this.context) ) {
            case 1:
                {
                this.state = 324;
                this.match(ExasolParser.ON);
                this.state = 325;
                this.expression(0);
                }
                break;
            case 2:
                {
                this.state = 326;
                this.match(ExasolParser.USING);
                this.state = 327;
                this.match(ExasolParser.LPAREN);
                this.state = 328;
                this.columnName();
                this.state = 333;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 156) {
                    {
                    {
                    this.state = 329;
                    this.match(ExasolParser.COMMA);
                    this.state = 330;
                    this.columnName();
                    }
                    }
                    this.state = 335;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 336;
                this.match(ExasolParser.RPAREN);
                }
                break;
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public whereClause(): WhereClauseContext {
        let localContext = new WhereClauseContext(this.context, this.state);
        this.enterRule(localContext, 26, ExasolParser.RULE_whereClause);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 340;
            this.match(ExasolParser.WHERE);
            this.state = 341;
            this.expression(0);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public connectByClause(): ConnectByClauseContext {
        let localContext = new ConnectByClauseContext(this.context, this.state);
        this.enterRule(localContext, 28, ExasolParser.RULE_connectByClause);
        let _la: number;
        try {
            this.state = 364;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ExasolParser.CONNECT:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 343;
                this.match(ExasolParser.CONNECT);
                this.state = 344;
                this.match(ExasolParser.BY);
                this.state = 346;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 122) {
                    {
                    this.state = 345;
                    this.match(ExasolParser.NOCYCLE);
                    }
                }

                this.state = 348;
                this.expression(0);
                this.state = 352;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 43, this.context) ) {
                case 1:
                    {
                    this.state = 349;
                    this.match(ExasolParser.START);
                    this.state = 350;
                    this.match(ExasolParser.WITH);
                    this.state = 351;
                    this.expression(0);
                    }
                    break;
                }
                }
                break;
            case ExasolParser.START:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 354;
                this.match(ExasolParser.START);
                this.state = 355;
                this.match(ExasolParser.WITH);
                this.state = 356;
                this.expression(0);
                this.state = 357;
                this.match(ExasolParser.CONNECT);
                this.state = 358;
                this.match(ExasolParser.BY);
                this.state = 360;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 122) {
                    {
                    this.state = 359;
                    this.match(ExasolParser.NOCYCLE);
                    }
                }

                this.state = 362;
                this.expression(0);
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public groupByClause(): GroupByClauseContext {
        let localContext = new GroupByClauseContext(this.context, this.state);
        this.enterRule(localContext, 30, ExasolParser.RULE_groupByClause);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 366;
            this.match(ExasolParser.GROUP);
            this.state = 367;
            this.match(ExasolParser.BY);
            this.state = 368;
            this.groupItem();
            this.state = 373;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 46, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 369;
                    this.match(ExasolParser.COMMA);
                    this.state = 370;
                    this.groupItem();
                    }
                    }
                }
                this.state = 375;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 46, this.context);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public groupItem(): GroupItemContext {
        let localContext = new GroupItemContext(this.context, this.state);
        this.enterRule(localContext, 32, ExasolParser.RULE_groupItem);
        let _la: number;
        try {
            this.state = 427;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 51, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 376;
                this.match(ExasolParser.CUBE);
                this.state = 377;
                this.match(ExasolParser.LPAREN);
                this.state = 378;
                this.expression(0);
                this.state = 383;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 156) {
                    {
                    {
                    this.state = 379;
                    this.match(ExasolParser.COMMA);
                    this.state = 380;
                    this.expression(0);
                    }
                    }
                    this.state = 385;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 386;
                this.match(ExasolParser.RPAREN);
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 388;
                this.match(ExasolParser.ROLLUP);
                this.state = 389;
                this.match(ExasolParser.LPAREN);
                this.state = 390;
                this.expression(0);
                this.state = 395;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 156) {
                    {
                    {
                    this.state = 391;
                    this.match(ExasolParser.COMMA);
                    this.state = 392;
                    this.expression(0);
                    }
                    }
                    this.state = 397;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 398;
                this.match(ExasolParser.RPAREN);
                }
                break;
            case 3:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 400;
                this.match(ExasolParser.GROUPING);
                this.state = 401;
                this.match(ExasolParser.SETS);
                this.state = 402;
                this.match(ExasolParser.LPAREN);
                this.state = 403;
                this.groupItem();
                this.state = 408;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 156) {
                    {
                    {
                    this.state = 404;
                    this.match(ExasolParser.COMMA);
                    this.state = 405;
                    this.groupItem();
                    }
                    }
                    this.state = 410;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 411;
                this.match(ExasolParser.RPAREN);
                }
                break;
            case 4:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 413;
                this.match(ExasolParser.LPAREN);
                this.state = 414;
                this.match(ExasolParser.RPAREN);
                }
                break;
            case 5:
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 415;
                this.match(ExasolParser.LPAREN);
                this.state = 416;
                this.expression(0);
                this.state = 421;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 156) {
                    {
                    {
                    this.state = 417;
                    this.match(ExasolParser.COMMA);
                    this.state = 418;
                    this.expression(0);
                    }
                    }
                    this.state = 423;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 424;
                this.match(ExasolParser.RPAREN);
                }
                break;
            case 6:
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 426;
                this.expression(0);
                }
                break;
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public havingClause(): HavingClauseContext {
        let localContext = new HavingClauseContext(this.context, this.state);
        this.enterRule(localContext, 34, ExasolParser.RULE_havingClause);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 429;
            this.match(ExasolParser.HAVING);
            this.state = 430;
            this.expression(0);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public qualifyClause(): QualifyClauseContext {
        let localContext = new QualifyClauseContext(this.context, this.state);
        this.enterRule(localContext, 36, ExasolParser.RULE_qualifyClause);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 432;
            this.match(ExasolParser.QUALIFY);
            this.state = 433;
            this.expression(0);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public orderByClause(): OrderByClauseContext {
        let localContext = new OrderByClauseContext(this.context, this.state);
        this.enterRule(localContext, 38, ExasolParser.RULE_orderByClause);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 435;
            this.match(ExasolParser.ORDER);
            this.state = 436;
            this.match(ExasolParser.BY);
            this.state = 437;
            this.orderItem();
            this.state = 442;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 156) {
                {
                {
                this.state = 438;
                this.match(ExasolParser.COMMA);
                this.state = 439;
                this.orderItem();
                }
                }
                this.state = 444;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public orderItem(): OrderItemContext {
        let localContext = new OrderItemContext(this.context, this.state);
        this.enterRule(localContext, 40, ExasolParser.RULE_orderItem);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 445;
            this.expression(0);
            this.state = 447;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 76 || _la === 77) {
                {
                this.state = 446;
                _la = this.tokenStream.LA(1);
                if(!(_la === 76 || _la === 77)) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                }
            }

            this.state = 451;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 73) {
                {
                this.state = 449;
                this.match(ExasolParser.NULLS);
                this.state = 450;
                _la = this.tokenStream.LA(1);
                if(!(_la === 74 || _la === 75)) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                }
            }

            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public limitClause(): LimitClauseContext {
        let localContext = new LimitClauseContext(this.context, this.state);
        this.enterRule(localContext, 42, ExasolParser.RULE_limitClause);
        let _la: number;
        try {
            this.state = 463;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 56, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 453;
                this.match(ExasolParser.LIMIT);
                this.state = 454;
                this.match(ExasolParser.NUMBER);
                this.state = 457;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 25) {
                    {
                    this.state = 455;
                    this.match(ExasolParser.OFFSET);
                    this.state = 456;
                    this.match(ExasolParser.NUMBER);
                    }
                }

                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 459;
                this.match(ExasolParser.LIMIT);
                this.state = 460;
                this.match(ExasolParser.NUMBER);
                this.state = 461;
                this.match(ExasolParser.COMMA);
                this.state = 462;
                this.match(ExasolParser.NUMBER);
                }
                break;
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public insertStatement(): InsertStatementContext {
        let localContext = new InsertStatementContext(this.context, this.state);
        this.enterRule(localContext, 44, ExasolParser.RULE_insertStatement);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 465;
            this.match(ExasolParser.INSERT);
            this.state = 466;
            this.match(ExasolParser.INTO);
            this.state = 467;
            this.schemaQualifiedTable();
            this.state = 479;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 58, this.context) ) {
            case 1:
                {
                this.state = 468;
                this.match(ExasolParser.LPAREN);
                this.state = 469;
                this.columnName();
                this.state = 474;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 156) {
                    {
                    {
                    this.state = 470;
                    this.match(ExasolParser.COMMA);
                    this.state = 471;
                    this.columnName();
                    }
                    }
                    this.state = 476;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 477;
                this.match(ExasolParser.RPAREN);
                }
                break;
            }
            this.state = 512;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 62, this.context) ) {
            case 1:
                {
                this.state = 481;
                this.match(ExasolParser.VALUES);
                this.state = 482;
                this.match(ExasolParser.LPAREN);
                this.state = 483;
                this.insertValue();
                this.state = 488;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 156) {
                    {
                    {
                    this.state = 484;
                    this.match(ExasolParser.COMMA);
                    this.state = 485;
                    this.insertValue();
                    }
                    }
                    this.state = 490;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 491;
                this.match(ExasolParser.RPAREN);
                this.state = 506;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 156) {
                    {
                    {
                    this.state = 492;
                    this.match(ExasolParser.COMMA);
                    this.state = 493;
                    this.match(ExasolParser.LPAREN);
                    this.state = 494;
                    this.insertValue();
                    this.state = 499;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    while (_la === 156) {
                        {
                        {
                        this.state = 495;
                        this.match(ExasolParser.COMMA);
                        this.state = 496;
                        this.insertValue();
                        }
                        }
                        this.state = 501;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                    }
                    this.state = 502;
                    this.match(ExasolParser.RPAREN);
                    }
                    }
                    this.state = 508;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                }
                break;
            case 2:
                {
                this.state = 509;
                this.selectStatement();
                }
                break;
            case 3:
                {
                this.state = 510;
                this.match(ExasolParser.DEFAULT);
                this.state = 511;
                this.match(ExasolParser.VALUES);
                }
                break;
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public insertValue(): InsertValueContext {
        let localContext = new InsertValueContext(this.context, this.state);
        this.enterRule(localContext, 46, ExasolParser.RULE_insertValue);
        try {
            this.state = 516;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ExasolParser.NOT:
            case ExasolParser.EXISTS:
            case ExasolParser.NULL_:
            case ExasolParser.TRUE_:
            case ExasolParser.FALSE_:
            case ExasolParser.CASE:
            case ExasolParser.CAST:
            case ExasolParser.CSV:
            case ExasolParser.FBV:
            case ExasolParser.LOCAL:
            case ExasolParser.AT_KW:
            case ExasolParser.FILE_KW:
            case ExasolParser.CUBE:
            case ExasolParser.ROLLUP:
            case ExasolParser.GROUPING:
            case ExasolParser.SETS:
            case ExasolParser.START:
            case ExasolParser.PRIOR:
            case ExasolParser.ANY:
            case ExasolParser.SOME:
            case ExasolParser.MATCHED:
            case ExasolParser.INTERVAL:
            case ExasolParser.YEAR:
            case ExasolParser.MONTH:
            case ExasolParser.DAY:
            case ExasolParser.HOUR:
            case ExasolParser.MINUTE:
            case ExasolParser.SECOND:
            case ExasolParser.DATE:
            case ExasolParser.TIMESTAMP:
            case ExasolParser.EXTRACT:
            case ExasolParser.POSITION:
            case ExasolParser.STRING:
            case ExasolParser.NUMBER:
            case ExasolParser.QUOTED_IDENT:
            case ExasolParser.IDENT:
            case ExasolParser.LPAREN:
            case ExasolParser.MINUS_OP:
            case ExasolParser.PARAM:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 514;
                this.expression(0);
                }
                break;
            case ExasolParser.DEFAULT:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 515;
                this.match(ExasolParser.DEFAULT);
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public updateStatement(): UpdateStatementContext {
        let localContext = new UpdateStatementContext(this.context, this.state);
        this.enterRule(localContext, 48, ExasolParser.RULE_updateStatement);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 518;
            this.match(ExasolParser.UPDATE);
            this.state = 519;
            this.schemaQualifiedTable();
            this.state = 524;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 27 || ((((_la - 107)) & ~0x1F) === 0 && ((1 << (_la - 107)) & 132607859) !== 0) || _la === 152 || _la === 153) {
                {
                this.state = 521;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 27) {
                    {
                    this.state = 520;
                    this.match(ExasolParser.AS);
                    }
                }

                this.state = 523;
                this.alias();
                }
            }

            this.state = 526;
            this.match(ExasolParser.SET);
            this.state = 527;
            this.columnName();
            this.state = 528;
            this.match(ExasolParser.EQ);
            this.state = 529;
            this.expression(0);
            this.state = 537;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 156) {
                {
                {
                this.state = 530;
                this.match(ExasolParser.COMMA);
                this.state = 531;
                this.columnName();
                this.state = 532;
                this.match(ExasolParser.EQ);
                this.state = 533;
                this.expression(0);
                }
                }
                this.state = 539;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 541;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 17) {
                {
                this.state = 540;
                this.fromClause();
                }
            }

            this.state = 544;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 18) {
                {
                this.state = 543;
                this.whereClause();
                }
            }

            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public deleteStatement(): DeleteStatementContext {
        let localContext = new DeleteStatementContext(this.context, this.state);
        this.enterRule(localContext, 50, ExasolParser.RULE_deleteStatement);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 546;
            this.match(ExasolParser.DELETE);
            this.state = 547;
            this.match(ExasolParser.FROM);
            this.state = 548;
            this.schemaQualifiedTable();
            this.state = 553;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 27 || ((((_la - 107)) & ~0x1F) === 0 && ((1 << (_la - 107)) & 132607859) !== 0) || _la === 152 || _la === 153) {
                {
                this.state = 550;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 27) {
                    {
                    this.state = 549;
                    this.match(ExasolParser.AS);
                    }
                }

                this.state = 552;
                this.alias();
                }
            }

            this.state = 556;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 18) {
                {
                this.state = 555;
                this.whereClause();
                }
            }

            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public mergeStatement(): MergeStatementContext {
        let localContext = new MergeStatementContext(this.context, this.state);
        this.enterRule(localContext, 52, ExasolParser.RULE_mergeStatement);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 558;
            this.match(ExasolParser.MERGE);
            this.state = 559;
            this.match(ExasolParser.INTO);
            this.state = 560;
            this.schemaQualifiedTable();
            this.state = 565;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 27 || ((((_la - 107)) & ~0x1F) === 0 && ((1 << (_la - 107)) & 132607859) !== 0) || _la === 152 || _la === 153) {
                {
                this.state = 562;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 27) {
                    {
                    this.state = 561;
                    this.match(ExasolParser.AS);
                    }
                }

                this.state = 564;
                this.alias();
                }
            }

            this.state = 567;
            this.match(ExasolParser.USING);
            this.state = 568;
            this.tablePrimary();
            this.state = 569;
            this.match(ExasolParser.ON);
            this.state = 570;
            this.expression(0);
            this.state = 572;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            do {
                {
                {
                this.state = 571;
                this.mergeWhen();
                }
                }
                this.state = 574;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            } while (_la === 59);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public mergeWhen(): MergeWhenContext {
        let localContext = new MergeWhenContext(this.context, this.state);
        this.enterRule(localContext, 54, ExasolParser.RULE_mergeWhen);
        let _la: number;
        try {
            this.state = 635;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 83, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 576;
                this.match(ExasolParser.WHEN);
                this.state = 577;
                this.match(ExasolParser.MATCHED);
                this.state = 578;
                this.match(ExasolParser.THEN);
                this.state = 601;
                this.errorHandler.sync(this);
                switch (this.tokenStream.LA(1)) {
                case ExasolParser.UPDATE:
                    {
                    this.state = 579;
                    this.match(ExasolParser.UPDATE);
                    this.state = 580;
                    this.match(ExasolParser.SET);
                    this.state = 581;
                    this.columnName();
                    this.state = 582;
                    this.match(ExasolParser.EQ);
                    this.state = 583;
                    this.expression(0);
                    this.state = 591;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    while (_la === 156) {
                        {
                        {
                        this.state = 584;
                        this.match(ExasolParser.COMMA);
                        this.state = 585;
                        this.columnName();
                        this.state = 586;
                        this.match(ExasolParser.EQ);
                        this.state = 587;
                        this.expression(0);
                        }
                        }
                        this.state = 593;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                    }
                    this.state = 595;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 18) {
                        {
                        this.state = 594;
                        this.whereClause();
                        }
                    }

                    }
                    break;
                case ExasolParser.DELETE:
                    {
                    this.state = 597;
                    this.match(ExasolParser.DELETE);
                    this.state = 599;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 18) {
                        {
                        this.state = 598;
                        this.whereClause();
                        }
                    }

                    }
                    break;
                default:
                    throw new antlr.NoViableAltException(this);
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 603;
                this.match(ExasolParser.WHEN);
                this.state = 604;
                this.match(ExasolParser.NOT);
                this.state = 605;
                this.match(ExasolParser.MATCHED);
                this.state = 606;
                this.match(ExasolParser.THEN);
                this.state = 607;
                this.match(ExasolParser.INSERT);
                this.state = 619;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 154) {
                    {
                    this.state = 608;
                    this.match(ExasolParser.LPAREN);
                    this.state = 609;
                    this.columnName();
                    this.state = 614;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    while (_la === 156) {
                        {
                        {
                        this.state = 610;
                        this.match(ExasolParser.COMMA);
                        this.state = 611;
                        this.columnName();
                        }
                        }
                        this.state = 616;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                    }
                    this.state = 617;
                    this.match(ExasolParser.RPAREN);
                    }
                }

                this.state = 621;
                this.match(ExasolParser.VALUES);
                this.state = 622;
                this.match(ExasolParser.LPAREN);
                this.state = 623;
                this.insertValue();
                this.state = 628;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 156) {
                    {
                    {
                    this.state = 624;
                    this.match(ExasolParser.COMMA);
                    this.state = 625;
                    this.insertValue();
                    }
                    }
                    this.state = 630;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 631;
                this.match(ExasolParser.RPAREN);
                this.state = 633;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 18) {
                    {
                    this.state = 632;
                    this.whereClause();
                    }
                }

                }
                break;
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public truncateStatement(): TruncateStatementContext {
        let localContext = new TruncateStatementContext(this.context, this.state);
        this.enterRule(localContext, 56, ExasolParser.RULE_truncateStatement);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 637;
            this.match(ExasolParser.TRUNCATE);
            this.state = 638;
            this.match(ExasolParser.TABLE);
            this.state = 639;
            this.schemaQualifiedTable();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public createSchemaStatement(): CreateSchemaStatementContext {
        let localContext = new CreateSchemaStatementContext(this.context, this.state);
        this.enterRule(localContext, 58, ExasolParser.RULE_createSchemaStatement);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 641;
            this.match(ExasolParser.CREATE);
            this.state = 643;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 86) {
                {
                this.state = 642;
                this.match(ExasolParser.VIRTUAL);
                }
            }

            this.state = 645;
            this.match(ExasolParser.SCHEMA);
            this.state = 649;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 88) {
                {
                this.state = 646;
                this.match(ExasolParser.IF);
                this.state = 647;
                this.match(ExasolParser.NOT);
                this.state = 648;
                this.match(ExasolParser.EXISTS);
                }
            }

            this.state = 651;
            this.schemaName();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public createTableStatement(): CreateTableStatementContext {
        let localContext = new CreateTableStatementContext(this.context, this.state);
        this.enterRule(localContext, 60, ExasolParser.RULE_createTableStatement);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 653;
            this.match(ExasolParser.CREATE);
            this.state = 656;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 47) {
                {
                this.state = 654;
                this.match(ExasolParser.OR);
                this.state = 655;
                this.match(ExasolParser.REPLACE);
                }
            }

            this.state = 658;
            this.match(ExasolParser.TABLE);
            this.state = 662;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 88) {
                {
                this.state = 659;
                this.match(ExasolParser.IF);
                this.state = 660;
                this.match(ExasolParser.NOT);
                this.state = 661;
                this.match(ExasolParser.EXISTS);
                }
            }

            this.state = 664;
            this.schemaQualifiedTable();
            this.state = 678;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ExasolParser.LPAREN:
                {
                this.state = 665;
                this.match(ExasolParser.LPAREN);
                this.state = 666;
                this.tableElement();
                this.state = 671;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 156) {
                    {
                    {
                    this.state = 667;
                    this.match(ExasolParser.COMMA);
                    this.state = 668;
                    this.tableElement();
                    }
                    }
                    this.state = 673;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 674;
                this.match(ExasolParser.RPAREN);
                }
                break;
            case ExasolParser.AS:
                {
                this.state = 676;
                this.match(ExasolParser.AS);
                this.state = 677;
                this.selectStatement();
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public tableElement(): TableElementContext {
        let localContext = new TableElementContext(this.context, this.state);
        this.enterRule(localContext, 62, ExasolParser.RULE_tableElement);
        let _la: number;
        try {
            let alternative: number;
            this.state = 737;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ExasolParser.CSV:
            case ExasolParser.FBV:
            case ExasolParser.LOCAL:
            case ExasolParser.AT_KW:
            case ExasolParser.FILE_KW:
            case ExasolParser.CUBE:
            case ExasolParser.ROLLUP:
            case ExasolParser.GROUPING:
            case ExasolParser.SETS:
            case ExasolParser.START:
            case ExasolParser.PRIOR:
            case ExasolParser.ANY:
            case ExasolParser.SOME:
            case ExasolParser.MATCHED:
            case ExasolParser.YEAR:
            case ExasolParser.MONTH:
            case ExasolParser.DAY:
            case ExasolParser.HOUR:
            case ExasolParser.MINUTE:
            case ExasolParser.SECOND:
            case ExasolParser.QUOTED_IDENT:
            case ExasolParser.IDENT:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 680;
                this.columnName();
                this.state = 681;
                this.dataType();
                this.state = 684;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 96) {
                    {
                    this.state = 682;
                    this.match(ExasolParser.DEFAULT);
                    this.state = 683;
                    this.expression(0);
                    }
                }

                this.state = 690;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 48 || _la === 55) {
                    {
                    this.state = 687;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 48) {
                        {
                        this.state = 686;
                        this.match(ExasolParser.NOT);
                        }
                    }

                    this.state = 689;
                    this.match(ExasolParser.NULL_);
                    }
                }

                this.state = 694;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 92) {
                    {
                    this.state = 692;
                    this.match(ExasolParser.PRIMARY);
                    this.state = 693;
                    this.match(ExasolParser.KEY);
                    }
                }

                this.state = 701;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 12) {
                    {
                    this.state = 696;
                    this.match(ExasolParser.COMMENT);
                    this.state = 698;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 54) {
                        {
                        this.state = 697;
                        this.match(ExasolParser.IS);
                        }
                    }

                    this.state = 700;
                    this.match(ExasolParser.STRING);
                    }
                }

                }
                break;
            case ExasolParser.CONSTRAINT:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 703;
                this.match(ExasolParser.CONSTRAINT);
                this.state = 705;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (((((_la - 107)) & ~0x1F) === 0 && ((1 << (_la - 107)) & 132607859) !== 0) || _la === 152 || _la === 153) {
                    {
                    this.state = 704;
                    this.alias();
                    }
                }

                this.state = 711;
                this.errorHandler.sync(this);
                switch (this.tokenStream.LA(1)) {
                case ExasolParser.PRIMARY:
                    {
                    this.state = 707;
                    this.match(ExasolParser.PRIMARY);
                    this.state = 708;
                    this.match(ExasolParser.KEY);
                    }
                    break;
                case ExasolParser.FOREIGN:
                    {
                    this.state = 709;
                    this.match(ExasolParser.FOREIGN);
                    this.state = 710;
                    this.match(ExasolParser.KEY);
                    }
                    break;
                default:
                    throw new antlr.NoViableAltException(this);
                }
                this.state = 713;
                this.match(ExasolParser.LPAREN);
                this.state = 714;
                this.columnName();
                this.state = 719;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 156) {
                    {
                    {
                    this.state = 715;
                    this.match(ExasolParser.COMMA);
                    this.state = 716;
                    this.columnName();
                    }
                    }
                    this.state = 721;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 722;
                this.match(ExasolParser.RPAREN);
                this.state = 725;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 95) {
                    {
                    this.state = 723;
                    this.match(ExasolParser.REFERENCES);
                    this.state = 724;
                    this.schemaQualifiedTable();
                    }
                }

                }
                break;
            case ExasolParser.DISTRIBUTE:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 727;
                this.match(ExasolParser.DISTRIBUTE);
                this.state = 728;
                this.match(ExasolParser.BY);
                this.state = 729;
                this.columnName();
                this.state = 734;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 100, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                        {
                        {
                        this.state = 730;
                        this.match(ExasolParser.COMMA);
                        this.state = 731;
                        this.columnName();
                        }
                        }
                    }
                    this.state = 736;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 100, this.context);
                }
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public dropStatement(): DropStatementContext {
        let localContext = new DropStatementContext(this.context, this.state);
        this.enterRule(localContext, 64, ExasolParser.RULE_dropStatement);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 739;
            this.match(ExasolParser.DROP);
            this.state = 740;
            _la = this.tokenStream.LA(1);
            if(!(((((_la - 78)) & ~0x1F) === 0 && ((1 << (_la - 78)) & 63) !== 0))) {
            this.errorHandler.recoverInline(this);
            }
            else {
                this.errorHandler.reportMatch(this);
                this.consume();
            }
            this.state = 743;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 88) {
                {
                this.state = 741;
                this.match(ExasolParser.IF);
                this.state = 742;
                this.match(ExasolParser.EXISTS);
                }
            }

            this.state = 745;
            this.schemaQualifiedTable();
            this.state = 747;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 153) {
                {
                this.state = 746;
                localContext._CASCADE_OPT = this.match(ExasolParser.IDENT);
                }
            }

            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public dataType(): DataTypeContext {
        let localContext = new DataTypeContext(this.context, this.state);
        this.enterRule(localContext, 66, ExasolParser.RULE_dataType);
        let _la: number;
        try {
            this.state = 848;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 122, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 749;
                this.match(ExasolParser.DECIMAL_T);
                this.state = 757;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 154) {
                    {
                    this.state = 750;
                    this.match(ExasolParser.LPAREN);
                    this.state = 751;
                    this.match(ExasolParser.NUMBER);
                    this.state = 754;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 156) {
                        {
                        this.state = 752;
                        this.match(ExasolParser.COMMA);
                        this.state = 753;
                        this.match(ExasolParser.NUMBER);
                        }
                    }

                    this.state = 756;
                    this.match(ExasolParser.RPAREN);
                    }
                }

                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 759;
                this.match(ExasolParser.VARCHAR_T);
                this.state = 760;
                this.match(ExasolParser.LPAREN);
                this.state = 761;
                this.match(ExasolParser.NUMBER);
                this.state = 762;
                this.match(ExasolParser.RPAREN);
                this.state = 766;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 146) {
                    {
                    this.state = 763;
                    this.match(ExasolParser.CHARACTER);
                    this.state = 764;
                    this.match(ExasolParser.SET);
                    this.state = 765;
                    _la = this.tokenStream.LA(1);
                    if(!(_la === 148 || _la === 149)) {
                    this.errorHandler.recoverInline(this);
                    }
                    else {
                        this.errorHandler.reportMatch(this);
                        this.consume();
                    }
                    }
                }

                }
                break;
            case 3:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 768;
                this.match(ExasolParser.CHAR_T);
                this.state = 772;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 154) {
                    {
                    this.state = 769;
                    this.match(ExasolParser.LPAREN);
                    this.state = 770;
                    this.match(ExasolParser.NUMBER);
                    this.state = 771;
                    this.match(ExasolParser.RPAREN);
                    }
                }

                }
                break;
            case 4:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 774;
                this.match(ExasolParser.CHARACTER);
                this.state = 776;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 147) {
                    {
                    this.state = 775;
                    this.match(ExasolParser.VARYING);
                    }
                }

                this.state = 781;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 154) {
                    {
                    this.state = 778;
                    this.match(ExasolParser.LPAREN);
                    this.state = 779;
                    this.match(ExasolParser.NUMBER);
                    this.state = 780;
                    this.match(ExasolParser.RPAREN);
                    }
                }

                }
                break;
            case 5:
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 783;
                this.match(ExasolParser.BOOLEAN_T);
                }
                break;
            case 6:
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 784;
                this.match(ExasolParser.DOUBLE_T);
                this.state = 786;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 143) {
                    {
                    this.state = 785;
                    this.match(ExasolParser.PRECISION);
                    }
                }

                }
                break;
            case 7:
                this.enterOuterAlt(localContext, 7);
                {
                this.state = 788;
                this.match(ExasolParser.DATE);
                }
                break;
            case 8:
                this.enterOuterAlt(localContext, 8);
                {
                this.state = 789;
                this.match(ExasolParser.TIMESTAMP);
                this.state = 798;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 26) {
                    {
                    this.state = 790;
                    this.match(ExasolParser.WITH);
                    this.state = 792;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 111) {
                        {
                        this.state = 791;
                        this.match(ExasolParser.LOCAL);
                        }
                    }

                    this.state = 794;
                    this.match(ExasolParser.IDENT);
                    this.state = 796;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 153) {
                        {
                        this.state = 795;
                        this.match(ExasolParser.IDENT);
                        }
                    }

                    }
                }

                }
                break;
            case 9:
                this.enterOuterAlt(localContext, 9);
                {
                this.state = 800;
                this.match(ExasolParser.INTERVAL);
                this.state = 801;
                this.match(ExasolParser.YEAR);
                this.state = 805;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 154) {
                    {
                    this.state = 802;
                    this.match(ExasolParser.LPAREN);
                    this.state = 803;
                    this.match(ExasolParser.NUMBER);
                    this.state = 804;
                    this.match(ExasolParser.RPAREN);
                    }
                }

                this.state = 807;
                this.match(ExasolParser.TO);
                this.state = 808;
                this.match(ExasolParser.MONTH);
                }
                break;
            case 10:
                this.enterOuterAlt(localContext, 10);
                {
                this.state = 809;
                this.match(ExasolParser.INTERVAL);
                this.state = 810;
                this.match(ExasolParser.DAY);
                this.state = 814;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 154) {
                    {
                    this.state = 811;
                    this.match(ExasolParser.LPAREN);
                    this.state = 812;
                    this.match(ExasolParser.NUMBER);
                    this.state = 813;
                    this.match(ExasolParser.RPAREN);
                    }
                }

                this.state = 816;
                this.match(ExasolParser.TO);
                this.state = 817;
                this.match(ExasolParser.SECOND);
                this.state = 821;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 154) {
                    {
                    this.state = 818;
                    this.match(ExasolParser.LPAREN);
                    this.state = 819;
                    this.match(ExasolParser.NUMBER);
                    this.state = 820;
                    this.match(ExasolParser.RPAREN);
                    }
                }

                }
                break;
            case 11:
                this.enterOuterAlt(localContext, 11);
                {
                this.state = 823;
                this.match(ExasolParser.GEOMETRY);
                this.state = 827;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 154) {
                    {
                    this.state = 824;
                    this.match(ExasolParser.LPAREN);
                    this.state = 825;
                    this.match(ExasolParser.NUMBER);
                    this.state = 826;
                    this.match(ExasolParser.RPAREN);
                    }
                }

                }
                break;
            case 12:
                this.enterOuterAlt(localContext, 12);
                {
                this.state = 829;
                this.match(ExasolParser.HASHTYPE);
                this.state = 836;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 154) {
                    {
                    this.state = 830;
                    this.match(ExasolParser.LPAREN);
                    this.state = 831;
                    this.match(ExasolParser.NUMBER);
                    this.state = 833;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 153) {
                        {
                        this.state = 832;
                        this.match(ExasolParser.IDENT);
                        }
                    }

                    this.state = 835;
                    this.match(ExasolParser.RPAREN);
                    }
                }

                }
                break;
            case 13:
                this.enterOuterAlt(localContext, 13);
                {
                this.state = 838;
                this.match(ExasolParser.IDENT);
                this.state = 846;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 154) {
                    {
                    this.state = 839;
                    this.match(ExasolParser.LPAREN);
                    this.state = 840;
                    this.match(ExasolParser.NUMBER);
                    this.state = 843;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 156) {
                        {
                        this.state = 841;
                        this.match(ExasolParser.COMMA);
                        this.state = 842;
                        this.match(ExasolParser.NUMBER);
                        }
                    }

                    this.state = 845;
                    this.match(ExasolParser.RPAREN);
                    }
                }

                }
                break;
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }

    public expression(): ExpressionContext;
    public expression(_p: number): ExpressionContext;
    public expression(_p?: number): ExpressionContext {
        if (_p === undefined) {
            _p = 0;
        }

        let parentContext = this.context;
        let parentState = this.state;
        let localContext = new ExpressionContext(this.context, parentState);
        let previousContext = localContext;
        let _startState = 68;
        this.enterRecursionRule(localContext, 68, ExasolParser.RULE_expression, _p);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 854;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ExasolParser.NOT:
                {
                this.state = 851;
                this.match(ExasolParser.NOT);
                this.state = 852;
                this.expression(4);
                }
                break;
            case ExasolParser.EXISTS:
            case ExasolParser.NULL_:
            case ExasolParser.TRUE_:
            case ExasolParser.FALSE_:
            case ExasolParser.CASE:
            case ExasolParser.CAST:
            case ExasolParser.CSV:
            case ExasolParser.FBV:
            case ExasolParser.LOCAL:
            case ExasolParser.AT_KW:
            case ExasolParser.FILE_KW:
            case ExasolParser.CUBE:
            case ExasolParser.ROLLUP:
            case ExasolParser.GROUPING:
            case ExasolParser.SETS:
            case ExasolParser.START:
            case ExasolParser.PRIOR:
            case ExasolParser.ANY:
            case ExasolParser.SOME:
            case ExasolParser.MATCHED:
            case ExasolParser.INTERVAL:
            case ExasolParser.YEAR:
            case ExasolParser.MONTH:
            case ExasolParser.DAY:
            case ExasolParser.HOUR:
            case ExasolParser.MINUTE:
            case ExasolParser.SECOND:
            case ExasolParser.DATE:
            case ExasolParser.TIMESTAMP:
            case ExasolParser.EXTRACT:
            case ExasolParser.POSITION:
            case ExasolParser.STRING:
            case ExasolParser.NUMBER:
            case ExasolParser.QUOTED_IDENT:
            case ExasolParser.IDENT:
            case ExasolParser.LPAREN:
            case ExasolParser.MINUS_OP:
            case ExasolParser.PARAM:
                {
                this.state = 853;
                this.predicate();
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
            this.context!.stop = this.tokenStream.LT(-1);
            this.state = 864;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 125, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    if (this.parseListeners != null) {
                        this.triggerExitRuleEvent();
                    }
                    previousContext = localContext;
                    {
                    this.state = 862;
                    this.errorHandler.sync(this);
                    switch (this.interpreter.adaptivePredict(this.tokenStream, 124, this.context) ) {
                    case 1:
                        {
                        localContext = new ExpressionContext(parentContext, parentState);
                        this.pushNewRecursionContext(localContext, _startState, ExasolParser.RULE_expression);
                        this.state = 856;
                        if (!(this.precpred(this.context, 3))) {
                            throw this.createFailedPredicateException("this.precpred(this.context, 3)");
                        }
                        this.state = 857;
                        this.match(ExasolParser.AND);
                        this.state = 858;
                        this.expression(4);
                        }
                        break;
                    case 2:
                        {
                        localContext = new ExpressionContext(parentContext, parentState);
                        this.pushNewRecursionContext(localContext, _startState, ExasolParser.RULE_expression);
                        this.state = 859;
                        if (!(this.precpred(this.context, 2))) {
                            throw this.createFailedPredicateException("this.precpred(this.context, 2)");
                        }
                        this.state = 860;
                        this.match(ExasolParser.OR);
                        this.state = 861;
                        this.expression(3);
                        }
                        break;
                    }
                    }
                }
                this.state = 866;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 125, this.context);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.unrollRecursionContexts(parentContext);
        }
        return localContext;
    }
    public predicate(): PredicateContext {
        let localContext = new PredicateContext(this.context, this.state);
        this.enterRule(localContext, 70, ExasolParser.RULE_predicate);
        let _la: number;
        try {
            this.state = 927;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 134, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 867;
                this.valueExpr(0);
                this.state = 868;
                _la = this.tokenStream.LA(1);
                if(!(((((_la - 160)) & ~0x1F) === 0 && ((1 << (_la - 160)) & 63) !== 0))) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                this.state = 870;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 126, this.context) ) {
                case 1:
                    {
                    this.state = 869;
                    _la = this.tokenStream.LA(1);
                    if(!(_la === 35 || _la === 123 || _la === 124)) {
                    this.errorHandler.recoverInline(this);
                    }
                    else {
                        this.errorHandler.reportMatch(this);
                        this.consume();
                    }
                    }
                    break;
                }
                this.state = 877;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 127, this.context) ) {
                case 1:
                    {
                    this.state = 872;
                    this.valueExpr(0);
                    }
                    break;
                case 2:
                    {
                    this.state = 873;
                    this.match(ExasolParser.LPAREN);
                    this.state = 874;
                    this.selectStatement();
                    this.state = 875;
                    this.match(ExasolParser.RPAREN);
                    }
                    break;
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 879;
                this.valueExpr(0);
                this.state = 881;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 48) {
                    {
                    this.state = 880;
                    this.match(ExasolParser.NOT);
                    }
                }

                this.state = 883;
                this.match(ExasolParser.BETWEEN);
                this.state = 884;
                this.valueExpr(0);
                this.state = 885;
                this.match(ExasolParser.AND);
                this.state = 886;
                this.valueExpr(0);
                }
                break;
            case 3:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 888;
                this.valueExpr(0);
                this.state = 890;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 48) {
                    {
                    this.state = 889;
                    this.match(ExasolParser.NOT);
                    }
                }

                this.state = 892;
                this.match(ExasolParser.IN);
                this.state = 893;
                this.match(ExasolParser.LPAREN);
                this.state = 903;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 131, this.context) ) {
                case 1:
                    {
                    this.state = 894;
                    this.selectStatement();
                    }
                    break;
                case 2:
                    {
                    this.state = 895;
                    this.expression(0);
                    this.state = 900;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    while (_la === 156) {
                        {
                        {
                        this.state = 896;
                        this.match(ExasolParser.COMMA);
                        this.state = 897;
                        this.expression(0);
                        }
                        }
                        this.state = 902;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                    }
                    }
                    break;
                }
                this.state = 905;
                this.match(ExasolParser.RPAREN);
                }
                break;
            case 4:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 907;
                this.valueExpr(0);
                this.state = 909;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 48) {
                    {
                    this.state = 908;
                    this.match(ExasolParser.NOT);
                    }
                }

                this.state = 911;
                _la = this.tokenStream.LA(1);
                if(!(_la === 52 || _la === 53)) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                this.state = 912;
                this.valueExpr(0);
                }
                break;
            case 5:
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 914;
                this.valueExpr(0);
                this.state = 915;
                this.match(ExasolParser.IS);
                this.state = 917;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 48) {
                    {
                    this.state = 916;
                    this.match(ExasolParser.NOT);
                    }
                }

                this.state = 919;
                this.match(ExasolParser.NULL_);
                }
                break;
            case 6:
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 921;
                this.match(ExasolParser.EXISTS);
                this.state = 922;
                this.match(ExasolParser.LPAREN);
                this.state = 923;
                this.selectStatement();
                this.state = 924;
                this.match(ExasolParser.RPAREN);
                }
                break;
            case 7:
                this.enterOuterAlt(localContext, 7);
                {
                this.state = 926;
                this.valueExpr(0);
                }
                break;
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }

    public valueExpr(): ValueExprContext;
    public valueExpr(_p: number): ValueExprContext;
    public valueExpr(_p?: number): ValueExprContext {
        if (_p === undefined) {
            _p = 0;
        }

        let parentContext = this.context;
        let parentState = this.state;
        let localContext = new ValueExprContext(this.context, parentState);
        let previousContext = localContext;
        let _startState = 72;
        this.enterRecursionRule(localContext, 72, ExasolParser.RULE_valueExpr, _p);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 935;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 135, this.context) ) {
            case 1:
                {
                this.state = 930;
                this.match(ExasolParser.MINUS_OP);
                this.state = 931;
                this.valueExpr(3);
                }
                break;
            case 2:
                {
                this.state = 932;
                this.match(ExasolParser.PRIOR);
                this.state = 933;
                this.valueExpr(2);
                }
                break;
            case 3:
                {
                this.state = 934;
                this.primaryExpr();
                }
                break;
            }
            this.context!.stop = this.tokenStream.LT(-1);
            this.state = 948;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 137, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    if (this.parseListeners != null) {
                        this.triggerExitRuleEvent();
                    }
                    previousContext = localContext;
                    {
                    this.state = 946;
                    this.errorHandler.sync(this);
                    switch (this.interpreter.adaptivePredict(this.tokenStream, 136, this.context) ) {
                    case 1:
                        {
                        localContext = new ValueExprContext(parentContext, parentState);
                        this.pushNewRecursionContext(localContext, _startState, ExasolParser.RULE_valueExpr);
                        this.state = 937;
                        if (!(this.precpred(this.context, 6))) {
                            throw this.createFailedPredicateException("this.precpred(this.context, 6)");
                        }
                        this.state = 938;
                        this.match(ExasolParser.CONCAT_OP);
                        this.state = 939;
                        this.valueExpr(7);
                        }
                        break;
                    case 2:
                        {
                        localContext = new ValueExprContext(parentContext, parentState);
                        this.pushNewRecursionContext(localContext, _startState, ExasolParser.RULE_valueExpr);
                        this.state = 940;
                        if (!(this.precpred(this.context, 5))) {
                            throw this.createFailedPredicateException("this.precpred(this.context, 5)");
                        }
                        this.state = 941;
                        _la = this.tokenStream.LA(1);
                        if(!(_la === 159 || _la === 168)) {
                        this.errorHandler.recoverInline(this);
                        }
                        else {
                            this.errorHandler.reportMatch(this);
                            this.consume();
                        }
                        this.state = 942;
                        this.valueExpr(6);
                        }
                        break;
                    case 3:
                        {
                        localContext = new ValueExprContext(parentContext, parentState);
                        this.pushNewRecursionContext(localContext, _startState, ExasolParser.RULE_valueExpr);
                        this.state = 943;
                        if (!(this.precpred(this.context, 4))) {
                            throw this.createFailedPredicateException("this.precpred(this.context, 4)");
                        }
                        this.state = 944;
                        _la = this.tokenStream.LA(1);
                        if(!(_la === 166 || _la === 167)) {
                        this.errorHandler.recoverInline(this);
                        }
                        else {
                            this.errorHandler.reportMatch(this);
                            this.consume();
                        }
                        this.state = 945;
                        this.valueExpr(5);
                        }
                        break;
                    }
                    }
                }
                this.state = 950;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 137, this.context);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.unrollRecursionContexts(parentContext);
        }
        return localContext;
    }
    public primaryExpr(): PrimaryExprContext {
        let localContext = new PrimaryExprContext(this.context, this.state);
        this.enterRule(localContext, 74, ExasolParser.RULE_primaryExpr);
        try {
            this.state = 965;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 139, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 951;
                this.literal();
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 952;
                this.caseExpr();
                }
                break;
            case 3:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 953;
                this.castExpr();
                }
                break;
            case 4:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 954;
                this.extractExpr();
                }
                break;
            case 5:
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 955;
                this.positionExpr();
                }
                break;
            case 6:
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 956;
                this.functionCall();
                }
                break;
            case 7:
                this.enterOuterAlt(localContext, 7);
                {
                this.state = 957;
                this.columnRef();
                }
                break;
            case 8:
                this.enterOuterAlt(localContext, 8);
                {
                this.state = 958;
                this.match(ExasolParser.LPAREN);
                this.state = 961;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 138, this.context) ) {
                case 1:
                    {
                    this.state = 959;
                    this.selectStatement();
                    }
                    break;
                case 2:
                    {
                    this.state = 960;
                    this.expression(0);
                    }
                    break;
                }
                this.state = 963;
                this.match(ExasolParser.RPAREN);
                }
                break;
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public caseExpr(): CaseExprContext {
        let localContext = new CaseExprContext(this.context, this.state);
        this.enterRule(localContext, 76, ExasolParser.RULE_caseExpr);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 967;
            this.match(ExasolParser.CASE);
            this.state = 969;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (((((_la - 48)) & ~0x1F) === 0 && ((1 << (_la - 48)) & 34693) !== 0) || ((((_la - 107)) & ~0x1F) === 0 && ((1 << (_la - 107)) & 2146398067) !== 0) || ((((_la - 150)) & ~0x1F) === 0 && ((1 << (_la - 150)) & 1179679) !== 0)) {
                {
                this.state = 968;
                this.expression(0);
                }
            }

            this.state = 976;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            do {
                {
                {
                this.state = 971;
                this.match(ExasolParser.WHEN);
                this.state = 972;
                this.expression(0);
                this.state = 973;
                this.match(ExasolParser.THEN);
                this.state = 974;
                this.expression(0);
                }
                }
                this.state = 978;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            } while (_la === 59);
            this.state = 982;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 61) {
                {
                this.state = 980;
                this.match(ExasolParser.ELSE);
                this.state = 981;
                this.expression(0);
                }
            }

            this.state = 984;
            this.match(ExasolParser.END);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public castExpr(): CastExprContext {
        let localContext = new CastExprContext(this.context, this.state);
        this.enterRule(localContext, 78, ExasolParser.RULE_castExpr);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 986;
            this.match(ExasolParser.CAST);
            this.state = 987;
            this.match(ExasolParser.LPAREN);
            this.state = 988;
            this.expression(0);
            this.state = 989;
            this.match(ExasolParser.AS);
            this.state = 990;
            this.dataType();
            this.state = 991;
            this.match(ExasolParser.RPAREN);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public extractExpr(): ExtractExprContext {
        let localContext = new ExtractExprContext(this.context, this.state);
        this.enterRule(localContext, 80, ExasolParser.RULE_extractExpr);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 993;
            this.match(ExasolParser.EXTRACT);
            this.state = 994;
            this.match(ExasolParser.LPAREN);
            this.state = 995;
            _la = this.tokenStream.LA(1);
            if(!(((((_la - 128)) & ~0x1F) === 0 && ((1 << (_la - 128)) & 63) !== 0))) {
            this.errorHandler.recoverInline(this);
            }
            else {
                this.errorHandler.reportMatch(this);
                this.consume();
            }
            this.state = 996;
            this.match(ExasolParser.FROM);
            this.state = 997;
            this.expression(0);
            this.state = 998;
            this.match(ExasolParser.RPAREN);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public positionExpr(): PositionExprContext {
        let localContext = new PositionExprContext(this.context, this.state);
        this.enterRule(localContext, 82, ExasolParser.RULE_positionExpr);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1000;
            this.match(ExasolParser.POSITION);
            this.state = 1001;
            this.match(ExasolParser.LPAREN);
            this.state = 1002;
            this.expression(0);
            this.state = 1003;
            this.match(ExasolParser.IN);
            this.state = 1004;
            this.expression(0);
            this.state = 1005;
            this.match(ExasolParser.RPAREN);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public functionCall(): FunctionCallContext {
        let localContext = new FunctionCallContext(this.context, this.state);
        this.enterRule(localContext, 84, ExasolParser.RULE_functionCall);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1007;
            this.functionName();
            this.state = 1008;
            this.match(ExasolParser.LPAREN);
            this.state = 1021;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ExasolParser.STAR:
                {
                this.state = 1009;
                this.match(ExasolParser.STAR);
                }
                break;
            case ExasolParser.DISTINCT:
            case ExasolParser.NOT:
            case ExasolParser.EXISTS:
            case ExasolParser.NULL_:
            case ExasolParser.TRUE_:
            case ExasolParser.FALSE_:
            case ExasolParser.CASE:
            case ExasolParser.CAST:
            case ExasolParser.CSV:
            case ExasolParser.FBV:
            case ExasolParser.LOCAL:
            case ExasolParser.AT_KW:
            case ExasolParser.FILE_KW:
            case ExasolParser.CUBE:
            case ExasolParser.ROLLUP:
            case ExasolParser.GROUPING:
            case ExasolParser.SETS:
            case ExasolParser.START:
            case ExasolParser.PRIOR:
            case ExasolParser.ANY:
            case ExasolParser.SOME:
            case ExasolParser.MATCHED:
            case ExasolParser.INTERVAL:
            case ExasolParser.YEAR:
            case ExasolParser.MONTH:
            case ExasolParser.DAY:
            case ExasolParser.HOUR:
            case ExasolParser.MINUTE:
            case ExasolParser.SECOND:
            case ExasolParser.DATE:
            case ExasolParser.TIMESTAMP:
            case ExasolParser.EXTRACT:
            case ExasolParser.POSITION:
            case ExasolParser.STRING:
            case ExasolParser.NUMBER:
            case ExasolParser.QUOTED_IDENT:
            case ExasolParser.IDENT:
            case ExasolParser.LPAREN:
            case ExasolParser.MINUS_OP:
            case ExasolParser.PARAM:
                {
                this.state = 1011;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 36) {
                    {
                    this.state = 1010;
                    this.match(ExasolParser.DISTINCT);
                    }
                }

                this.state = 1013;
                this.expression(0);
                this.state = 1018;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 156) {
                    {
                    {
                    this.state = 1014;
                    this.match(ExasolParser.COMMA);
                    this.state = 1015;
                    this.expression(0);
                    }
                    }
                    this.state = 1020;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                }
                break;
            case ExasolParser.RPAREN:
                break;
            default:
                break;
            }
            this.state = 1023;
            this.match(ExasolParser.RPAREN);
            this.state = 1025;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 146, this.context) ) {
            case 1:
                {
                this.state = 1024;
                this.overClause();
                }
                break;
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public overClause(): OverClauseContext {
        let localContext = new OverClauseContext(this.context, this.state);
        this.enterRule(localContext, 86, ExasolParser.RULE_overClause);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1027;
            this.match(ExasolParser.OVER);
            this.state = 1028;
            this.match(ExasolParser.LPAREN);
            this.state = 1039;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 65) {
                {
                this.state = 1029;
                this.match(ExasolParser.PARTITION);
                this.state = 1030;
                this.match(ExasolParser.BY);
                this.state = 1031;
                this.expression(0);
                this.state = 1036;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 156) {
                    {
                    {
                    this.state = 1032;
                    this.match(ExasolParser.COMMA);
                    this.state = 1033;
                    this.expression(0);
                    }
                    }
                    this.state = 1038;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                }
            }

            this.state = 1042;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 23) {
                {
                this.state = 1041;
                this.orderByClause();
                }
            }

            this.state = 1045;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 66 || _la === 67) {
                {
                this.state = 1044;
                this.windowFrame();
                }
            }

            this.state = 1047;
            this.match(ExasolParser.RPAREN);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public windowFrame(): WindowFrameContext {
        let localContext = new WindowFrameContext(this.context, this.state);
        this.enterRule(localContext, 88, ExasolParser.RULE_windowFrame);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1049;
            _la = this.tokenStream.LA(1);
            if(!(_la === 66 || _la === 67)) {
            this.errorHandler.recoverInline(this);
            }
            else {
                this.errorHandler.reportMatch(this);
                this.consume();
            }
            this.state = 1056;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ExasolParser.NULL_:
            case ExasolParser.TRUE_:
            case ExasolParser.FALSE_:
            case ExasolParser.CASE:
            case ExasolParser.CAST:
            case ExasolParser.UNBOUNDED:
            case ExasolParser.CURRENT:
            case ExasolParser.CSV:
            case ExasolParser.FBV:
            case ExasolParser.LOCAL:
            case ExasolParser.AT_KW:
            case ExasolParser.FILE_KW:
            case ExasolParser.CUBE:
            case ExasolParser.ROLLUP:
            case ExasolParser.GROUPING:
            case ExasolParser.SETS:
            case ExasolParser.START:
            case ExasolParser.PRIOR:
            case ExasolParser.ANY:
            case ExasolParser.SOME:
            case ExasolParser.MATCHED:
            case ExasolParser.INTERVAL:
            case ExasolParser.YEAR:
            case ExasolParser.MONTH:
            case ExasolParser.DAY:
            case ExasolParser.HOUR:
            case ExasolParser.MINUTE:
            case ExasolParser.SECOND:
            case ExasolParser.DATE:
            case ExasolParser.TIMESTAMP:
            case ExasolParser.EXTRACT:
            case ExasolParser.POSITION:
            case ExasolParser.STRING:
            case ExasolParser.NUMBER:
            case ExasolParser.QUOTED_IDENT:
            case ExasolParser.IDENT:
            case ExasolParser.LPAREN:
            case ExasolParser.MINUS_OP:
            case ExasolParser.PARAM:
                {
                this.state = 1050;
                this.frameBound();
                }
                break;
            case ExasolParser.BETWEEN:
                {
                this.state = 1051;
                this.match(ExasolParser.BETWEEN);
                this.state = 1052;
                this.frameBound();
                this.state = 1053;
                this.match(ExasolParser.AND);
                this.state = 1054;
                this.frameBound();
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public frameBound(): FrameBoundContext {
        let localContext = new FrameBoundContext(this.context, this.state);
        this.enterRule(localContext, 90, ExasolParser.RULE_frameBound);
        let _la: number;
        try {
            this.state = 1065;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ExasolParser.UNBOUNDED:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 1058;
                this.match(ExasolParser.UNBOUNDED);
                this.state = 1059;
                _la = this.tokenStream.LA(1);
                if(!(_la === 68 || _la === 69)) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                }
                break;
            case ExasolParser.CURRENT:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 1060;
                this.match(ExasolParser.CURRENT);
                this.state = 1061;
                this.match(ExasolParser.ROW);
                }
                break;
            case ExasolParser.NULL_:
            case ExasolParser.TRUE_:
            case ExasolParser.FALSE_:
            case ExasolParser.CASE:
            case ExasolParser.CAST:
            case ExasolParser.CSV:
            case ExasolParser.FBV:
            case ExasolParser.LOCAL:
            case ExasolParser.AT_KW:
            case ExasolParser.FILE_KW:
            case ExasolParser.CUBE:
            case ExasolParser.ROLLUP:
            case ExasolParser.GROUPING:
            case ExasolParser.SETS:
            case ExasolParser.START:
            case ExasolParser.PRIOR:
            case ExasolParser.ANY:
            case ExasolParser.SOME:
            case ExasolParser.MATCHED:
            case ExasolParser.INTERVAL:
            case ExasolParser.YEAR:
            case ExasolParser.MONTH:
            case ExasolParser.DAY:
            case ExasolParser.HOUR:
            case ExasolParser.MINUTE:
            case ExasolParser.SECOND:
            case ExasolParser.DATE:
            case ExasolParser.TIMESTAMP:
            case ExasolParser.EXTRACT:
            case ExasolParser.POSITION:
            case ExasolParser.STRING:
            case ExasolParser.NUMBER:
            case ExasolParser.QUOTED_IDENT:
            case ExasolParser.IDENT:
            case ExasolParser.LPAREN:
            case ExasolParser.MINUS_OP:
            case ExasolParser.PARAM:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 1062;
                this.valueExpr(0);
                this.state = 1063;
                _la = this.tokenStream.LA(1);
                if(!(_la === 68 || _la === 69)) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public schemaQualifiedTable(): SchemaQualifiedTableContext {
        let localContext = new SchemaQualifiedTableContext(this.context, this.state);
        this.enterRule(localContext, 92, ExasolParser.RULE_schemaQualifiedTable);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1070;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 153, this.context) ) {
            case 1:
                {
                this.state = 1067;
                this.schemaName();
                this.state = 1068;
                this.match(ExasolParser.DOT);
                }
                break;
            }
            this.state = 1072;
            this.tableName();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public columnRef(): ColumnRefContext {
        let localContext = new ColumnRefContext(this.context, this.state);
        this.enterRule(localContext, 94, ExasolParser.RULE_columnRef);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1082;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 155, this.context) ) {
            case 1:
                {
                this.state = 1077;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 154, this.context) ) {
                case 1:
                    {
                    this.state = 1074;
                    this.schemaName();
                    this.state = 1075;
                    this.match(ExasolParser.DOT);
                    }
                    break;
                }
                this.state = 1079;
                this.tableName();
                this.state = 1080;
                this.match(ExasolParser.DOT);
                }
                break;
            }
            this.state = 1084;
            this.columnName();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public schemaName(): SchemaNameContext {
        let localContext = new SchemaNameContext(this.context, this.state);
        this.enterRule(localContext, 96, ExasolParser.RULE_schemaName);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1086;
            this.identifier();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public tableName(): TableNameContext {
        let localContext = new TableNameContext(this.context, this.state);
        this.enterRule(localContext, 98, ExasolParser.RULE_tableName);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1088;
            this.identifier();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public columnName(): ColumnNameContext {
        let localContext = new ColumnNameContext(this.context, this.state);
        this.enterRule(localContext, 100, ExasolParser.RULE_columnName);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1090;
            this.identifier();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public functionName(): FunctionNameContext {
        let localContext = new FunctionNameContext(this.context, this.state);
        this.enterRule(localContext, 102, ExasolParser.RULE_functionName);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1092;
            this.identifier();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public alias(): AliasContext {
        let localContext = new AliasContext(this.context, this.state);
        this.enterRule(localContext, 104, ExasolParser.RULE_alias);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1094;
            this.identifier();
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public identifier(): IdentifierContext {
        let localContext = new IdentifierContext(this.context, this.state);
        this.enterRule(localContext, 106, ExasolParser.RULE_identifier);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1096;
            _la = this.tokenStream.LA(1);
            if(!(((((_la - 107)) & ~0x1F) === 0 && ((1 << (_la - 107)) & 132607859) !== 0) || _la === 152 || _la === 153)) {
            this.errorHandler.recoverInline(this);
            }
            else {
                this.errorHandler.reportMatch(this);
                this.consume();
            }
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }
    public literal(): LiteralContext {
        let localContext = new LiteralContext(this.context, this.state);
        this.enterRule(localContext, 108, ExasolParser.RULE_literal);
        let _la: number;
        try {
            this.state = 1120;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ExasolParser.STRING:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 1098;
                this.match(ExasolParser.STRING);
                }
                break;
            case ExasolParser.NUMBER:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 1099;
                this.match(ExasolParser.NUMBER);
                }
                break;
            case ExasolParser.NULL_:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 1100;
                this.match(ExasolParser.NULL_);
                }
                break;
            case ExasolParser.TRUE_:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 1101;
                this.match(ExasolParser.TRUE_);
                }
                break;
            case ExasolParser.FALSE_:
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 1102;
                this.match(ExasolParser.FALSE_);
                }
                break;
            case ExasolParser.PARAM:
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 1103;
                this.match(ExasolParser.PARAM);
                }
                break;
            case ExasolParser.DATE:
                this.enterOuterAlt(localContext, 7);
                {
                this.state = 1104;
                this.match(ExasolParser.DATE);
                this.state = 1105;
                this.match(ExasolParser.STRING);
                }
                break;
            case ExasolParser.TIMESTAMP:
                this.enterOuterAlt(localContext, 8);
                {
                this.state = 1106;
                this.match(ExasolParser.TIMESTAMP);
                this.state = 1107;
                this.match(ExasolParser.STRING);
                }
                break;
            case ExasolParser.INTERVAL:
                this.enterOuterAlt(localContext, 9);
                {
                this.state = 1108;
                this.match(ExasolParser.INTERVAL);
                this.state = 1109;
                this.match(ExasolParser.STRING);
                this.state = 1110;
                _la = this.tokenStream.LA(1);
                if(!(((((_la - 128)) & ~0x1F) === 0 && ((1 << (_la - 128)) & 63) !== 0))) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                this.state = 1114;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 156, this.context) ) {
                case 1:
                    {
                    this.state = 1111;
                    this.match(ExasolParser.LPAREN);
                    this.state = 1112;
                    this.match(ExasolParser.NUMBER);
                    this.state = 1113;
                    this.match(ExasolParser.RPAREN);
                    }
                    break;
                }
                this.state = 1118;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 157, this.context) ) {
                case 1:
                    {
                    this.state = 1116;
                    this.match(ExasolParser.TO);
                    this.state = 1117;
                    _la = this.tokenStream.LA(1);
                    if(!(((((_la - 128)) & ~0x1F) === 0 && ((1 << (_la - 128)) & 63) !== 0))) {
                    this.errorHandler.recoverInline(this);
                    }
                    else {
                        this.errorHandler.reportMatch(this);
                        this.consume();
                    }
                    }
                    break;
                }
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
        }
        catch (re) {
            if (re instanceof antlr.RecognitionException) {
                this.errorHandler.reportError(this, re);
                this.errorHandler.recover(this, re);
            } else {
                throw re;
            }
        }
        finally {
            this.exitRule();
        }
        return localContext;
    }

    public override sempred(localContext: antlr.ParserRuleContext | null, ruleIndex: number, predIndex: number): boolean {
        switch (ruleIndex) {
        case 3:
            return this.queryExpression_sempred(localContext as QueryExpressionContext, predIndex);
        case 34:
            return this.expression_sempred(localContext as ExpressionContext, predIndex);
        case 36:
            return this.valueExpr_sempred(localContext as ValueExprContext, predIndex);
        }
        return true;
    }
    private queryExpression_sempred(localContext: QueryExpressionContext | null, predIndex: number): boolean {
        switch (predIndex) {
        case 0:
            return this.precpred(this.context, 3);
        }
        return true;
    }
    private expression_sempred(localContext: ExpressionContext | null, predIndex: number): boolean {
        switch (predIndex) {
        case 1:
            return this.precpred(this.context, 3);
        case 2:
            return this.precpred(this.context, 2);
        }
        return true;
    }
    private valueExpr_sempred(localContext: ValueExprContext | null, predIndex: number): boolean {
        switch (predIndex) {
        case 3:
            return this.precpred(this.context, 6);
        case 4:
            return this.precpred(this.context, 5);
        case 5:
            return this.precpred(this.context, 4);
        }
        return true;
    }

    public static readonly _serializedATN: number[] = [
        4,1,173,1123,2,0,7,0,2,1,7,1,2,2,7,2,2,3,7,3,2,4,7,4,2,5,7,5,2,6,
        7,6,2,7,7,7,2,8,7,8,2,9,7,9,2,10,7,10,2,11,7,11,2,12,7,12,2,13,7,
        13,2,14,7,14,2,15,7,15,2,16,7,16,2,17,7,17,2,18,7,18,2,19,7,19,2,
        20,7,20,2,21,7,21,2,22,7,22,2,23,7,23,2,24,7,24,2,25,7,25,2,26,7,
        26,2,27,7,27,2,28,7,28,2,29,7,29,2,30,7,30,2,31,7,31,2,32,7,32,2,
        33,7,33,2,34,7,34,2,35,7,35,2,36,7,36,2,37,7,37,2,38,7,38,2,39,7,
        39,2,40,7,40,2,41,7,41,2,42,7,42,2,43,7,43,2,44,7,44,2,45,7,45,2,
        46,7,46,2,47,7,47,2,48,7,48,2,49,7,49,2,50,7,50,2,51,7,51,2,52,7,
        52,2,53,7,53,2,54,7,54,1,0,1,0,1,0,5,0,114,8,0,10,0,12,0,117,9,0,
        1,0,3,0,120,8,0,1,0,1,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3,1,
        133,8,1,1,2,3,2,136,8,2,1,2,1,2,3,2,140,8,2,1,2,3,2,143,8,2,1,3,
        1,3,1,3,1,3,1,3,1,3,3,3,151,8,3,1,3,1,3,1,3,3,3,156,8,3,1,3,1,3,
        1,3,3,3,161,8,3,1,3,5,3,164,8,3,10,3,12,3,167,9,3,1,4,1,4,3,4,171,
        8,4,1,4,1,4,3,4,175,8,4,1,4,3,4,178,8,4,1,4,3,4,181,8,4,1,4,3,4,
        184,8,4,1,4,3,4,187,8,4,1,4,3,4,190,8,4,1,4,1,4,1,4,1,4,1,4,5,4,
        197,8,4,10,4,12,4,200,9,4,1,4,1,4,1,4,1,4,1,4,1,4,5,4,208,8,4,10,
        4,12,4,211,9,4,1,4,1,4,5,4,215,8,4,10,4,12,4,218,9,4,3,4,220,8,4,
        1,5,1,5,1,5,1,5,5,5,226,8,5,10,5,12,5,229,9,5,1,6,1,6,1,6,1,6,1,
        6,5,6,236,8,6,10,6,12,6,239,9,6,1,6,1,6,3,6,243,8,6,1,6,1,6,1,6,
        1,6,1,6,1,7,1,7,1,7,5,7,253,8,7,10,7,12,7,256,9,7,1,8,1,8,1,8,3,
        8,261,8,8,1,8,1,8,1,8,3,8,266,8,8,1,8,3,8,269,8,8,3,8,271,8,8,1,
        9,1,9,1,9,1,9,5,9,277,8,9,10,9,12,9,280,9,9,1,10,1,10,5,10,284,8,
        10,10,10,12,10,287,9,10,1,11,1,11,3,11,291,8,11,1,11,3,11,294,8,
        11,1,11,1,11,1,11,1,11,3,11,300,8,11,1,11,3,11,303,8,11,3,11,305,
        8,11,1,12,1,12,1,12,3,12,310,8,12,1,12,1,12,3,12,314,8,12,1,12,1,
        12,3,12,318,8,12,1,12,3,12,321,8,12,1,12,1,12,1,12,1,12,1,12,1,12,
        1,12,1,12,1,12,5,12,332,8,12,10,12,12,12,335,9,12,1,12,1,12,3,12,
        339,8,12,1,13,1,13,1,13,1,14,1,14,1,14,3,14,347,8,14,1,14,1,14,1,
        14,1,14,3,14,353,8,14,1,14,1,14,1,14,1,14,1,14,1,14,3,14,361,8,14,
        1,14,1,14,3,14,365,8,14,1,15,1,15,1,15,1,15,1,15,5,15,372,8,15,10,
        15,12,15,375,9,15,1,16,1,16,1,16,1,16,1,16,5,16,382,8,16,10,16,12,
        16,385,9,16,1,16,1,16,1,16,1,16,1,16,1,16,1,16,5,16,394,8,16,10,
        16,12,16,397,9,16,1,16,1,16,1,16,1,16,1,16,1,16,1,16,1,16,5,16,407,
        8,16,10,16,12,16,410,9,16,1,16,1,16,1,16,1,16,1,16,1,16,1,16,1,16,
        5,16,420,8,16,10,16,12,16,423,9,16,1,16,1,16,1,16,3,16,428,8,16,
        1,17,1,17,1,17,1,18,1,18,1,18,1,19,1,19,1,19,1,19,1,19,5,19,441,
        8,19,10,19,12,19,444,9,19,1,20,1,20,3,20,448,8,20,1,20,1,20,3,20,
        452,8,20,1,21,1,21,1,21,1,21,3,21,458,8,21,1,21,1,21,1,21,1,21,3,
        21,464,8,21,1,22,1,22,1,22,1,22,1,22,1,22,1,22,5,22,473,8,22,10,
        22,12,22,476,9,22,1,22,1,22,3,22,480,8,22,1,22,1,22,1,22,1,22,1,
        22,5,22,487,8,22,10,22,12,22,490,9,22,1,22,1,22,1,22,1,22,1,22,1,
        22,5,22,498,8,22,10,22,12,22,501,9,22,1,22,1,22,5,22,505,8,22,10,
        22,12,22,508,9,22,1,22,1,22,1,22,3,22,513,8,22,1,23,1,23,3,23,517,
        8,23,1,24,1,24,1,24,3,24,522,8,24,1,24,3,24,525,8,24,1,24,1,24,1,
        24,1,24,1,24,1,24,1,24,1,24,1,24,5,24,536,8,24,10,24,12,24,539,9,
        24,1,24,3,24,542,8,24,1,24,3,24,545,8,24,1,25,1,25,1,25,1,25,3,25,
        551,8,25,1,25,3,25,554,8,25,1,25,3,25,557,8,25,1,26,1,26,1,26,1,
        26,3,26,563,8,26,1,26,3,26,566,8,26,1,26,1,26,1,26,1,26,1,26,4,26,
        573,8,26,11,26,12,26,574,1,27,1,27,1,27,1,27,1,27,1,27,1,27,1,27,
        1,27,1,27,1,27,1,27,1,27,5,27,590,8,27,10,27,12,27,593,9,27,1,27,
        3,27,596,8,27,1,27,1,27,3,27,600,8,27,3,27,602,8,27,1,27,1,27,1,
        27,1,27,1,27,1,27,1,27,1,27,1,27,5,27,613,8,27,10,27,12,27,616,9,
        27,1,27,1,27,3,27,620,8,27,1,27,1,27,1,27,1,27,1,27,5,27,627,8,27,
        10,27,12,27,630,9,27,1,27,1,27,3,27,634,8,27,3,27,636,8,27,1,28,
        1,28,1,28,1,28,1,29,1,29,3,29,644,8,29,1,29,1,29,1,29,1,29,3,29,
        650,8,29,1,29,1,29,1,30,1,30,1,30,3,30,657,8,30,1,30,1,30,1,30,1,
        30,3,30,663,8,30,1,30,1,30,1,30,1,30,1,30,5,30,670,8,30,10,30,12,
        30,673,9,30,1,30,1,30,1,30,1,30,3,30,679,8,30,1,31,1,31,1,31,1,31,
        3,31,685,8,31,1,31,3,31,688,8,31,1,31,3,31,691,8,31,1,31,1,31,3,
        31,695,8,31,1,31,1,31,3,31,699,8,31,1,31,3,31,702,8,31,1,31,1,31,
        3,31,706,8,31,1,31,1,31,1,31,1,31,3,31,712,8,31,1,31,1,31,1,31,1,
        31,5,31,718,8,31,10,31,12,31,721,9,31,1,31,1,31,1,31,3,31,726,8,
        31,1,31,1,31,1,31,1,31,1,31,5,31,733,8,31,10,31,12,31,736,9,31,3,
        31,738,8,31,1,32,1,32,1,32,1,32,3,32,744,8,32,1,32,1,32,3,32,748,
        8,32,1,33,1,33,1,33,1,33,1,33,3,33,755,8,33,1,33,3,33,758,8,33,1,
        33,1,33,1,33,1,33,1,33,1,33,1,33,3,33,767,8,33,1,33,1,33,1,33,1,
        33,3,33,773,8,33,1,33,1,33,3,33,777,8,33,1,33,1,33,1,33,3,33,782,
        8,33,1,33,1,33,1,33,3,33,787,8,33,1,33,1,33,1,33,1,33,3,33,793,8,
        33,1,33,1,33,3,33,797,8,33,3,33,799,8,33,1,33,1,33,1,33,1,33,1,33,
        3,33,806,8,33,1,33,1,33,1,33,1,33,1,33,1,33,1,33,3,33,815,8,33,1,
        33,1,33,1,33,1,33,1,33,3,33,822,8,33,1,33,1,33,1,33,1,33,3,33,828,
        8,33,1,33,1,33,1,33,1,33,3,33,834,8,33,1,33,3,33,837,8,33,1,33,1,
        33,1,33,1,33,1,33,3,33,844,8,33,1,33,3,33,847,8,33,3,33,849,8,33,
        1,34,1,34,1,34,1,34,3,34,855,8,34,1,34,1,34,1,34,1,34,1,34,1,34,
        5,34,863,8,34,10,34,12,34,866,9,34,1,35,1,35,1,35,3,35,871,8,35,
        1,35,1,35,1,35,1,35,1,35,3,35,878,8,35,1,35,1,35,3,35,882,8,35,1,
        35,1,35,1,35,1,35,1,35,1,35,1,35,3,35,891,8,35,1,35,1,35,1,35,1,
        35,1,35,1,35,5,35,899,8,35,10,35,12,35,902,9,35,3,35,904,8,35,1,
        35,1,35,1,35,1,35,3,35,910,8,35,1,35,1,35,1,35,1,35,1,35,1,35,3,
        35,918,8,35,1,35,1,35,1,35,1,35,1,35,1,35,1,35,1,35,3,35,928,8,35,
        1,36,1,36,1,36,1,36,1,36,1,36,3,36,936,8,36,1,36,1,36,1,36,1,36,
        1,36,1,36,1,36,1,36,1,36,5,36,947,8,36,10,36,12,36,950,9,36,1,37,
        1,37,1,37,1,37,1,37,1,37,1,37,1,37,1,37,1,37,3,37,962,8,37,1,37,
        1,37,3,37,966,8,37,1,38,1,38,3,38,970,8,38,1,38,1,38,1,38,1,38,1,
        38,4,38,977,8,38,11,38,12,38,978,1,38,1,38,3,38,983,8,38,1,38,1,
        38,1,39,1,39,1,39,1,39,1,39,1,39,1,39,1,40,1,40,1,40,1,40,1,40,1,
        40,1,40,1,41,1,41,1,41,1,41,1,41,1,41,1,41,1,42,1,42,1,42,1,42,3,
        42,1012,8,42,1,42,1,42,1,42,5,42,1017,8,42,10,42,12,42,1020,9,42,
        3,42,1022,8,42,1,42,1,42,3,42,1026,8,42,1,43,1,43,1,43,1,43,1,43,
        1,43,1,43,5,43,1035,8,43,10,43,12,43,1038,9,43,3,43,1040,8,43,1,
        43,3,43,1043,8,43,1,43,3,43,1046,8,43,1,43,1,43,1,44,1,44,1,44,1,
        44,1,44,1,44,1,44,3,44,1057,8,44,1,45,1,45,1,45,1,45,1,45,1,45,1,
        45,3,45,1066,8,45,1,46,1,46,1,46,3,46,1071,8,46,1,46,1,46,1,47,1,
        47,1,47,3,47,1078,8,47,1,47,1,47,1,47,3,47,1083,8,47,1,47,1,47,1,
        48,1,48,1,49,1,49,1,50,1,50,1,51,1,51,1,52,1,52,1,53,1,53,1,54,1,
        54,1,54,1,54,1,54,1,54,1,54,1,54,1,54,1,54,1,54,1,54,1,54,1,54,1,
        54,1,54,3,54,1115,8,54,1,54,1,54,3,54,1119,8,54,3,54,1121,8,54,1,
        54,0,3,6,68,72,55,0,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,
        34,36,38,40,42,44,46,48,50,52,54,56,58,60,62,64,66,68,70,72,74,76,
        78,80,82,84,86,88,90,92,94,96,98,100,102,104,106,108,0,14,1,0,35,
        36,1,0,76,77,1,0,74,75,1,0,78,83,1,0,148,149,1,0,160,165,2,0,35,
        35,123,124,1,0,52,53,2,0,159,159,168,168,1,0,166,167,1,0,128,133,
        1,0,66,67,1,0,68,69,7,0,107,108,111,113,115,118,120,121,123,125,
        128,133,152,153,1279,0,110,1,0,0,0,2,132,1,0,0,0,4,135,1,0,0,0,6,
        150,1,0,0,0,8,219,1,0,0,0,10,221,1,0,0,0,12,230,1,0,0,0,14,249,1,
        0,0,0,16,270,1,0,0,0,18,272,1,0,0,0,20,281,1,0,0,0,22,304,1,0,0,
        0,24,320,1,0,0,0,26,340,1,0,0,0,28,364,1,0,0,0,30,366,1,0,0,0,32,
        427,1,0,0,0,34,429,1,0,0,0,36,432,1,0,0,0,38,435,1,0,0,0,40,445,
        1,0,0,0,42,463,1,0,0,0,44,465,1,0,0,0,46,516,1,0,0,0,48,518,1,0,
        0,0,50,546,1,0,0,0,52,558,1,0,0,0,54,635,1,0,0,0,56,637,1,0,0,0,
        58,641,1,0,0,0,60,653,1,0,0,0,62,737,1,0,0,0,64,739,1,0,0,0,66,848,
        1,0,0,0,68,854,1,0,0,0,70,927,1,0,0,0,72,935,1,0,0,0,74,965,1,0,
        0,0,76,967,1,0,0,0,78,986,1,0,0,0,80,993,1,0,0,0,82,1000,1,0,0,0,
        84,1007,1,0,0,0,86,1027,1,0,0,0,88,1049,1,0,0,0,90,1065,1,0,0,0,
        92,1070,1,0,0,0,94,1082,1,0,0,0,96,1086,1,0,0,0,98,1088,1,0,0,0,
        100,1090,1,0,0,0,102,1092,1,0,0,0,104,1094,1,0,0,0,106,1096,1,0,
        0,0,108,1120,1,0,0,0,110,115,3,2,1,0,111,112,5,158,0,0,112,114,3,
        2,1,0,113,111,1,0,0,0,114,117,1,0,0,0,115,113,1,0,0,0,115,116,1,
        0,0,0,116,119,1,0,0,0,117,115,1,0,0,0,118,120,5,158,0,0,119,118,
        1,0,0,0,119,120,1,0,0,0,120,121,1,0,0,0,121,122,5,0,0,1,122,1,1,
        0,0,0,123,133,3,4,2,0,124,133,3,44,22,0,125,133,3,48,24,0,126,133,
        3,50,25,0,127,133,3,52,26,0,128,133,3,56,28,0,129,133,3,58,29,0,
        130,133,3,60,30,0,131,133,3,64,32,0,132,123,1,0,0,0,132,124,1,0,
        0,0,132,125,1,0,0,0,132,126,1,0,0,0,132,127,1,0,0,0,132,128,1,0,
        0,0,132,129,1,0,0,0,132,130,1,0,0,0,132,131,1,0,0,0,133,3,1,0,0,
        0,134,136,3,10,5,0,135,134,1,0,0,0,135,136,1,0,0,0,136,137,1,0,0,
        0,137,139,3,6,3,0,138,140,3,38,19,0,139,138,1,0,0,0,139,140,1,0,
        0,0,140,142,1,0,0,0,141,143,3,42,21,0,142,141,1,0,0,0,142,143,1,
        0,0,0,143,5,1,0,0,0,144,145,6,3,-1,0,145,151,3,8,4,0,146,147,5,154,
        0,0,147,148,3,4,2,0,148,149,5,155,0,0,149,151,1,0,0,0,150,144,1,
        0,0,0,150,146,1,0,0,0,151,165,1,0,0,0,152,160,10,3,0,0,153,155,5,
        31,0,0,154,156,5,35,0,0,155,154,1,0,0,0,155,156,1,0,0,0,156,161,
        1,0,0,0,157,161,5,32,0,0,158,161,5,33,0,0,159,161,5,34,0,0,160,153,
        1,0,0,0,160,157,1,0,0,0,160,158,1,0,0,0,160,159,1,0,0,0,161,162,
        1,0,0,0,162,164,3,6,3,4,163,152,1,0,0,0,164,167,1,0,0,0,165,163,
        1,0,0,0,165,166,1,0,0,0,166,7,1,0,0,0,167,165,1,0,0,0,168,170,5,
        1,0,0,169,171,7,0,0,0,170,169,1,0,0,0,170,171,1,0,0,0,171,172,1,
        0,0,0,172,174,3,14,7,0,173,175,3,18,9,0,174,173,1,0,0,0,174,175,
        1,0,0,0,175,177,1,0,0,0,176,178,3,26,13,0,177,176,1,0,0,0,177,178,
        1,0,0,0,178,180,1,0,0,0,179,181,3,28,14,0,180,179,1,0,0,0,180,181,
        1,0,0,0,181,183,1,0,0,0,182,184,3,30,15,0,183,182,1,0,0,0,183,184,
        1,0,0,0,184,186,1,0,0,0,185,187,3,34,17,0,186,185,1,0,0,0,186,187,
        1,0,0,0,187,189,1,0,0,0,188,190,3,36,18,0,189,188,1,0,0,0,189,190,
        1,0,0,0,190,220,1,0,0,0,191,192,5,29,0,0,192,193,5,154,0,0,193,198,
        3,68,34,0,194,195,5,156,0,0,195,197,3,68,34,0,196,194,1,0,0,0,197,
        200,1,0,0,0,198,196,1,0,0,0,198,199,1,0,0,0,199,201,1,0,0,0,200,
        198,1,0,0,0,201,216,5,155,0,0,202,203,5,156,0,0,203,204,5,154,0,
        0,204,209,3,68,34,0,205,206,5,156,0,0,206,208,3,68,34,0,207,205,
        1,0,0,0,208,211,1,0,0,0,209,207,1,0,0,0,209,210,1,0,0,0,210,212,
        1,0,0,0,211,209,1,0,0,0,212,213,5,155,0,0,213,215,1,0,0,0,214,202,
        1,0,0,0,215,218,1,0,0,0,216,214,1,0,0,0,216,217,1,0,0,0,217,220,
        1,0,0,0,218,216,1,0,0,0,219,168,1,0,0,0,219,191,1,0,0,0,220,9,1,
        0,0,0,221,222,5,26,0,0,222,227,3,12,6,0,223,224,5,156,0,0,224,226,
        3,12,6,0,225,223,1,0,0,0,226,229,1,0,0,0,227,225,1,0,0,0,227,228,
        1,0,0,0,228,11,1,0,0,0,229,227,1,0,0,0,230,242,3,98,49,0,231,232,
        5,154,0,0,232,237,3,100,50,0,233,234,5,156,0,0,234,236,3,100,50,
        0,235,233,1,0,0,0,236,239,1,0,0,0,237,235,1,0,0,0,237,238,1,0,0,
        0,238,240,1,0,0,0,239,237,1,0,0,0,240,241,5,155,0,0,241,243,1,0,
        0,0,242,231,1,0,0,0,242,243,1,0,0,0,243,244,1,0,0,0,244,245,5,27,
        0,0,245,246,5,154,0,0,246,247,3,4,2,0,247,248,5,155,0,0,248,13,1,
        0,0,0,249,254,3,16,8,0,250,251,5,156,0,0,251,253,3,16,8,0,252,250,
        1,0,0,0,253,256,1,0,0,0,254,252,1,0,0,0,254,255,1,0,0,0,255,15,1,
        0,0,0,256,254,1,0,0,0,257,258,3,98,49,0,258,259,5,157,0,0,259,261,
        1,0,0,0,260,257,1,0,0,0,260,261,1,0,0,0,261,262,1,0,0,0,262,271,
        5,159,0,0,263,268,3,68,34,0,264,266,5,27,0,0,265,264,1,0,0,0,265,
        266,1,0,0,0,266,267,1,0,0,0,267,269,3,104,52,0,268,265,1,0,0,0,268,
        269,1,0,0,0,269,271,1,0,0,0,270,260,1,0,0,0,270,263,1,0,0,0,271,
        17,1,0,0,0,272,273,5,17,0,0,273,278,3,20,10,0,274,275,5,156,0,0,
        275,277,3,20,10,0,276,274,1,0,0,0,277,280,1,0,0,0,278,276,1,0,0,
        0,278,279,1,0,0,0,279,19,1,0,0,0,280,278,1,0,0,0,281,285,3,22,11,
        0,282,284,3,24,12,0,283,282,1,0,0,0,284,287,1,0,0,0,285,283,1,0,
        0,0,285,286,1,0,0,0,286,21,1,0,0,0,287,285,1,0,0,0,288,293,3,92,
        46,0,289,291,5,27,0,0,290,289,1,0,0,0,290,291,1,0,0,0,291,292,1,
        0,0,0,292,294,3,104,52,0,293,290,1,0,0,0,293,294,1,0,0,0,294,305,
        1,0,0,0,295,296,5,154,0,0,296,297,3,4,2,0,297,302,5,155,0,0,298,
        300,5,27,0,0,299,298,1,0,0,0,299,300,1,0,0,0,300,301,1,0,0,0,301,
        303,3,104,52,0,302,299,1,0,0,0,302,303,1,0,0,0,303,305,1,0,0,0,304,
        288,1,0,0,0,304,295,1,0,0,0,305,23,1,0,0,0,306,321,5,38,0,0,307,
        309,5,39,0,0,308,310,5,42,0,0,309,308,1,0,0,0,309,310,1,0,0,0,310,
        321,1,0,0,0,311,313,5,40,0,0,312,314,5,42,0,0,313,312,1,0,0,0,313,
        314,1,0,0,0,314,321,1,0,0,0,315,317,5,41,0,0,316,318,5,42,0,0,317,
        316,1,0,0,0,317,318,1,0,0,0,318,321,1,0,0,0,319,321,5,43,0,0,320,
        306,1,0,0,0,320,307,1,0,0,0,320,311,1,0,0,0,320,315,1,0,0,0,320,
        319,1,0,0,0,320,321,1,0,0,0,321,322,1,0,0,0,322,323,5,37,0,0,323,
        338,3,22,11,0,324,325,5,44,0,0,325,339,3,68,34,0,326,327,5,45,0,
        0,327,328,5,154,0,0,328,333,3,100,50,0,329,330,5,156,0,0,330,332,
        3,100,50,0,331,329,1,0,0,0,332,335,1,0,0,0,333,331,1,0,0,0,333,334,
        1,0,0,0,334,336,1,0,0,0,335,333,1,0,0,0,336,337,5,155,0,0,337,339,
        1,0,0,0,338,324,1,0,0,0,338,326,1,0,0,0,338,339,1,0,0,0,339,25,1,
        0,0,0,340,341,5,18,0,0,341,342,3,68,34,0,342,27,1,0,0,0,343,344,
        5,119,0,0,344,346,5,20,0,0,345,347,5,122,0,0,346,345,1,0,0,0,346,
        347,1,0,0,0,347,348,1,0,0,0,348,352,3,68,34,0,349,350,5,120,0,0,
        350,351,5,26,0,0,351,353,3,68,34,0,352,349,1,0,0,0,352,353,1,0,0,
        0,353,365,1,0,0,0,354,355,5,120,0,0,355,356,5,26,0,0,356,357,3,68,
        34,0,357,358,5,119,0,0,358,360,5,20,0,0,359,361,5,122,0,0,360,359,
        1,0,0,0,360,361,1,0,0,0,361,362,1,0,0,0,362,363,3,68,34,0,363,365,
        1,0,0,0,364,343,1,0,0,0,364,354,1,0,0,0,365,29,1,0,0,0,366,367,5,
        19,0,0,367,368,5,20,0,0,368,373,3,32,16,0,369,370,5,156,0,0,370,
        372,3,32,16,0,371,369,1,0,0,0,372,375,1,0,0,0,373,371,1,0,0,0,373,
        374,1,0,0,0,374,31,1,0,0,0,375,373,1,0,0,0,376,377,5,115,0,0,377,
        378,5,154,0,0,378,383,3,68,34,0,379,380,5,156,0,0,380,382,3,68,34,
        0,381,379,1,0,0,0,382,385,1,0,0,0,383,381,1,0,0,0,383,384,1,0,0,
        0,384,386,1,0,0,0,385,383,1,0,0,0,386,387,5,155,0,0,387,428,1,0,
        0,0,388,389,5,116,0,0,389,390,5,154,0,0,390,395,3,68,34,0,391,392,
        5,156,0,0,392,394,3,68,34,0,393,391,1,0,0,0,394,397,1,0,0,0,395,
        393,1,0,0,0,395,396,1,0,0,0,396,398,1,0,0,0,397,395,1,0,0,0,398,
        399,5,155,0,0,399,428,1,0,0,0,400,401,5,117,0,0,401,402,5,118,0,
        0,402,403,5,154,0,0,403,408,3,32,16,0,404,405,5,156,0,0,405,407,
        3,32,16,0,406,404,1,0,0,0,407,410,1,0,0,0,408,406,1,0,0,0,408,409,
        1,0,0,0,409,411,1,0,0,0,410,408,1,0,0,0,411,412,5,155,0,0,412,428,
        1,0,0,0,413,414,5,154,0,0,414,428,5,155,0,0,415,416,5,154,0,0,416,
        421,3,68,34,0,417,418,5,156,0,0,418,420,3,68,34,0,419,417,1,0,0,
        0,420,423,1,0,0,0,421,419,1,0,0,0,421,422,1,0,0,0,422,424,1,0,0,
        0,423,421,1,0,0,0,424,425,5,155,0,0,425,428,1,0,0,0,426,428,3,68,
        34,0,427,376,1,0,0,0,427,388,1,0,0,0,427,400,1,0,0,0,427,413,1,0,
        0,0,427,415,1,0,0,0,427,426,1,0,0,0,428,33,1,0,0,0,429,430,5,21,
        0,0,430,431,3,68,34,0,431,35,1,0,0,0,432,433,5,22,0,0,433,434,3,
        68,34,0,434,37,1,0,0,0,435,436,5,23,0,0,436,437,5,20,0,0,437,442,
        3,40,20,0,438,439,5,156,0,0,439,441,3,40,20,0,440,438,1,0,0,0,441,
        444,1,0,0,0,442,440,1,0,0,0,442,443,1,0,0,0,443,39,1,0,0,0,444,442,
        1,0,0,0,445,447,3,68,34,0,446,448,7,1,0,0,447,446,1,0,0,0,447,448,
        1,0,0,0,448,451,1,0,0,0,449,450,5,73,0,0,450,452,7,2,0,0,451,449,
        1,0,0,0,451,452,1,0,0,0,452,41,1,0,0,0,453,454,5,24,0,0,454,457,
        5,151,0,0,455,456,5,25,0,0,456,458,5,151,0,0,457,455,1,0,0,0,457,
        458,1,0,0,0,458,464,1,0,0,0,459,460,5,24,0,0,460,461,5,151,0,0,461,
        462,5,156,0,0,462,464,5,151,0,0,463,453,1,0,0,0,463,459,1,0,0,0,
        464,43,1,0,0,0,465,466,5,2,0,0,466,467,5,28,0,0,467,479,3,92,46,
        0,468,469,5,154,0,0,469,474,3,100,50,0,470,471,5,156,0,0,471,473,
        3,100,50,0,472,470,1,0,0,0,473,476,1,0,0,0,474,472,1,0,0,0,474,475,
        1,0,0,0,475,477,1,0,0,0,476,474,1,0,0,0,477,478,5,155,0,0,478,480,
        1,0,0,0,479,468,1,0,0,0,479,480,1,0,0,0,480,512,1,0,0,0,481,482,
        5,29,0,0,482,483,5,154,0,0,483,488,3,46,23,0,484,485,5,156,0,0,485,
        487,3,46,23,0,486,484,1,0,0,0,487,490,1,0,0,0,488,486,1,0,0,0,488,
        489,1,0,0,0,489,491,1,0,0,0,490,488,1,0,0,0,491,506,5,155,0,0,492,
        493,5,156,0,0,493,494,5,154,0,0,494,499,3,46,23,0,495,496,5,156,
        0,0,496,498,3,46,23,0,497,495,1,0,0,0,498,501,1,0,0,0,499,497,1,
        0,0,0,499,500,1,0,0,0,500,502,1,0,0,0,501,499,1,0,0,0,502,503,5,
        155,0,0,503,505,1,0,0,0,504,492,1,0,0,0,505,508,1,0,0,0,506,504,
        1,0,0,0,506,507,1,0,0,0,507,513,1,0,0,0,508,506,1,0,0,0,509,513,
        3,4,2,0,510,511,5,96,0,0,511,513,5,29,0,0,512,481,1,0,0,0,512,509,
        1,0,0,0,512,510,1,0,0,0,513,45,1,0,0,0,514,517,3,68,34,0,515,517,
        5,96,0,0,516,514,1,0,0,0,516,515,1,0,0,0,517,47,1,0,0,0,518,519,
        5,3,0,0,519,524,3,92,46,0,520,522,5,27,0,0,521,520,1,0,0,0,521,522,
        1,0,0,0,522,523,1,0,0,0,523,525,3,104,52,0,524,521,1,0,0,0,524,525,
        1,0,0,0,525,526,1,0,0,0,526,527,5,30,0,0,527,528,3,100,50,0,528,
        529,5,160,0,0,529,537,3,68,34,0,530,531,5,156,0,0,531,532,3,100,
        50,0,532,533,5,160,0,0,533,534,3,68,34,0,534,536,1,0,0,0,535,530,
        1,0,0,0,536,539,1,0,0,0,537,535,1,0,0,0,537,538,1,0,0,0,538,541,
        1,0,0,0,539,537,1,0,0,0,540,542,3,18,9,0,541,540,1,0,0,0,541,542,
        1,0,0,0,542,544,1,0,0,0,543,545,3,26,13,0,544,543,1,0,0,0,544,545,
        1,0,0,0,545,49,1,0,0,0,546,547,5,4,0,0,547,548,5,17,0,0,548,553,
        3,92,46,0,549,551,5,27,0,0,550,549,1,0,0,0,550,551,1,0,0,0,551,552,
        1,0,0,0,552,554,3,104,52,0,553,550,1,0,0,0,553,554,1,0,0,0,554,556,
        1,0,0,0,555,557,3,26,13,0,556,555,1,0,0,0,556,557,1,0,0,0,557,51,
        1,0,0,0,558,559,5,5,0,0,559,560,5,28,0,0,560,565,3,92,46,0,561,563,
        5,27,0,0,562,561,1,0,0,0,562,563,1,0,0,0,563,564,1,0,0,0,564,566,
        3,104,52,0,565,562,1,0,0,0,565,566,1,0,0,0,566,567,1,0,0,0,567,568,
        5,45,0,0,568,569,3,22,11,0,569,570,5,44,0,0,570,572,3,68,34,0,571,
        573,3,54,27,0,572,571,1,0,0,0,573,574,1,0,0,0,574,572,1,0,0,0,574,
        575,1,0,0,0,575,53,1,0,0,0,576,577,5,59,0,0,577,578,5,125,0,0,578,
        601,5,60,0,0,579,580,5,3,0,0,580,581,5,30,0,0,581,582,3,100,50,0,
        582,583,5,160,0,0,583,591,3,68,34,0,584,585,5,156,0,0,585,586,3,
        100,50,0,586,587,5,160,0,0,587,588,3,68,34,0,588,590,1,0,0,0,589,
        584,1,0,0,0,590,593,1,0,0,0,591,589,1,0,0,0,591,592,1,0,0,0,592,
        595,1,0,0,0,593,591,1,0,0,0,594,596,3,26,13,0,595,594,1,0,0,0,595,
        596,1,0,0,0,596,602,1,0,0,0,597,599,5,4,0,0,598,600,3,26,13,0,599,
        598,1,0,0,0,599,600,1,0,0,0,600,602,1,0,0,0,601,579,1,0,0,0,601,
        597,1,0,0,0,602,636,1,0,0,0,603,604,5,59,0,0,604,605,5,48,0,0,605,
        606,5,125,0,0,606,607,5,60,0,0,607,619,5,2,0,0,608,609,5,154,0,0,
        609,614,3,100,50,0,610,611,5,156,0,0,611,613,3,100,50,0,612,610,
        1,0,0,0,613,616,1,0,0,0,614,612,1,0,0,0,614,615,1,0,0,0,615,617,
        1,0,0,0,616,614,1,0,0,0,617,618,5,155,0,0,618,620,1,0,0,0,619,608,
        1,0,0,0,619,620,1,0,0,0,620,621,1,0,0,0,621,622,5,29,0,0,622,623,
        5,154,0,0,623,628,3,46,23,0,624,625,5,156,0,0,625,627,3,46,23,0,
        626,624,1,0,0,0,627,630,1,0,0,0,628,626,1,0,0,0,628,629,1,0,0,0,
        629,631,1,0,0,0,630,628,1,0,0,0,631,633,5,155,0,0,632,634,3,26,13,
        0,633,632,1,0,0,0,633,634,1,0,0,0,634,636,1,0,0,0,635,576,1,0,0,
        0,635,603,1,0,0,0,636,55,1,0,0,0,637,638,5,9,0,0,638,639,5,79,0,
        0,639,640,3,92,46,0,640,57,1,0,0,0,641,643,5,6,0,0,642,644,5,86,
        0,0,643,642,1,0,0,0,643,644,1,0,0,0,644,645,1,0,0,0,645,649,5,78,
        0,0,646,647,5,88,0,0,647,648,5,48,0,0,648,650,5,50,0,0,649,646,1,
        0,0,0,649,650,1,0,0,0,650,651,1,0,0,0,651,652,3,96,48,0,652,59,1,
        0,0,0,653,656,5,6,0,0,654,655,5,47,0,0,655,657,5,89,0,0,656,654,
        1,0,0,0,656,657,1,0,0,0,657,658,1,0,0,0,658,662,5,79,0,0,659,660,
        5,88,0,0,660,661,5,48,0,0,661,663,5,50,0,0,662,659,1,0,0,0,662,663,
        1,0,0,0,663,664,1,0,0,0,664,678,3,92,46,0,665,666,5,154,0,0,666,
        671,3,62,31,0,667,668,5,156,0,0,668,670,3,62,31,0,669,667,1,0,0,
        0,670,673,1,0,0,0,671,669,1,0,0,0,671,672,1,0,0,0,672,674,1,0,0,
        0,673,671,1,0,0,0,674,675,5,155,0,0,675,679,1,0,0,0,676,677,5,27,
        0,0,677,679,3,4,2,0,678,665,1,0,0,0,678,676,1,0,0,0,679,61,1,0,0,
        0,680,681,3,100,50,0,681,684,3,66,33,0,682,683,5,96,0,0,683,685,
        3,68,34,0,684,682,1,0,0,0,684,685,1,0,0,0,685,690,1,0,0,0,686,688,
        5,48,0,0,687,686,1,0,0,0,687,688,1,0,0,0,688,689,1,0,0,0,689,691,
        5,55,0,0,690,687,1,0,0,0,690,691,1,0,0,0,691,694,1,0,0,0,692,693,
        5,92,0,0,693,695,5,93,0,0,694,692,1,0,0,0,694,695,1,0,0,0,695,701,
        1,0,0,0,696,698,5,12,0,0,697,699,5,54,0,0,698,697,1,0,0,0,698,699,
        1,0,0,0,699,700,1,0,0,0,700,702,5,150,0,0,701,696,1,0,0,0,701,702,
        1,0,0,0,702,738,1,0,0,0,703,705,5,91,0,0,704,706,3,104,52,0,705,
        704,1,0,0,0,705,706,1,0,0,0,706,711,1,0,0,0,707,708,5,92,0,0,708,
        712,5,93,0,0,709,710,5,94,0,0,710,712,5,93,0,0,711,707,1,0,0,0,711,
        709,1,0,0,0,712,713,1,0,0,0,713,714,5,154,0,0,714,719,3,100,50,0,
        715,716,5,156,0,0,716,718,3,100,50,0,717,715,1,0,0,0,718,721,1,0,
        0,0,719,717,1,0,0,0,719,720,1,0,0,0,720,722,1,0,0,0,721,719,1,0,
        0,0,722,725,5,155,0,0,723,724,5,95,0,0,724,726,3,92,46,0,725,723,
        1,0,0,0,725,726,1,0,0,0,726,738,1,0,0,0,727,728,5,98,0,0,728,729,
        5,20,0,0,729,734,3,100,50,0,730,731,5,156,0,0,731,733,3,100,50,0,
        732,730,1,0,0,0,733,736,1,0,0,0,734,732,1,0,0,0,734,735,1,0,0,0,
        735,738,1,0,0,0,736,734,1,0,0,0,737,680,1,0,0,0,737,703,1,0,0,0,
        737,727,1,0,0,0,738,63,1,0,0,0,739,740,5,8,0,0,740,743,7,3,0,0,741,
        742,5,88,0,0,742,744,5,50,0,0,743,741,1,0,0,0,743,744,1,0,0,0,744,
        745,1,0,0,0,745,747,3,92,46,0,746,748,5,153,0,0,747,746,1,0,0,0,
        747,748,1,0,0,0,748,65,1,0,0,0,749,757,5,138,0,0,750,751,5,154,0,
        0,751,754,5,151,0,0,752,753,5,156,0,0,753,755,5,151,0,0,754,752,
        1,0,0,0,754,755,1,0,0,0,755,756,1,0,0,0,756,758,5,155,0,0,757,750,
        1,0,0,0,757,758,1,0,0,0,758,849,1,0,0,0,759,760,5,139,0,0,760,761,
        5,154,0,0,761,762,5,151,0,0,762,766,5,155,0,0,763,764,5,146,0,0,
        764,765,5,30,0,0,765,767,7,4,0,0,766,763,1,0,0,0,766,767,1,0,0,0,
        767,849,1,0,0,0,768,772,5,140,0,0,769,770,5,154,0,0,770,771,5,151,
        0,0,771,773,5,155,0,0,772,769,1,0,0,0,772,773,1,0,0,0,773,849,1,
        0,0,0,774,776,5,146,0,0,775,777,5,147,0,0,776,775,1,0,0,0,776,777,
        1,0,0,0,777,781,1,0,0,0,778,779,5,154,0,0,779,780,5,151,0,0,780,
        782,5,155,0,0,781,778,1,0,0,0,781,782,1,0,0,0,782,849,1,0,0,0,783,
        849,5,141,0,0,784,786,5,142,0,0,785,787,5,143,0,0,786,785,1,0,0,
        0,786,787,1,0,0,0,787,849,1,0,0,0,788,849,5,134,0,0,789,798,5,135,
        0,0,790,792,5,26,0,0,791,793,5,111,0,0,792,791,1,0,0,0,792,793,1,
        0,0,0,793,794,1,0,0,0,794,796,5,153,0,0,795,797,5,153,0,0,796,795,
        1,0,0,0,796,797,1,0,0,0,797,799,1,0,0,0,798,790,1,0,0,0,798,799,
        1,0,0,0,799,849,1,0,0,0,800,801,5,126,0,0,801,805,5,128,0,0,802,
        803,5,154,0,0,803,804,5,151,0,0,804,806,5,155,0,0,805,802,1,0,0,
        0,805,806,1,0,0,0,806,807,1,0,0,0,807,808,5,127,0,0,808,849,5,129,
        0,0,809,810,5,126,0,0,810,814,5,130,0,0,811,812,5,154,0,0,812,813,
        5,151,0,0,813,815,5,155,0,0,814,811,1,0,0,0,814,815,1,0,0,0,815,
        816,1,0,0,0,816,817,5,127,0,0,817,821,5,133,0,0,818,819,5,154,0,
        0,819,820,5,151,0,0,820,822,5,155,0,0,821,818,1,0,0,0,821,822,1,
        0,0,0,822,849,1,0,0,0,823,827,5,144,0,0,824,825,5,154,0,0,825,826,
        5,151,0,0,826,828,5,155,0,0,827,824,1,0,0,0,827,828,1,0,0,0,828,
        849,1,0,0,0,829,836,5,145,0,0,830,831,5,154,0,0,831,833,5,151,0,
        0,832,834,5,153,0,0,833,832,1,0,0,0,833,834,1,0,0,0,834,835,1,0,
        0,0,835,837,5,155,0,0,836,830,1,0,0,0,836,837,1,0,0,0,837,849,1,
        0,0,0,838,846,5,153,0,0,839,840,5,154,0,0,840,843,5,151,0,0,841,
        842,5,156,0,0,842,844,5,151,0,0,843,841,1,0,0,0,843,844,1,0,0,0,
        844,845,1,0,0,0,845,847,5,155,0,0,846,839,1,0,0,0,846,847,1,0,0,
        0,847,849,1,0,0,0,848,749,1,0,0,0,848,759,1,0,0,0,848,768,1,0,0,
        0,848,774,1,0,0,0,848,783,1,0,0,0,848,784,1,0,0,0,848,788,1,0,0,
        0,848,789,1,0,0,0,848,800,1,0,0,0,848,809,1,0,0,0,848,823,1,0,0,
        0,848,829,1,0,0,0,848,838,1,0,0,0,849,67,1,0,0,0,850,851,6,34,-1,
        0,851,852,5,48,0,0,852,855,3,68,34,4,853,855,3,70,35,0,854,850,1,
        0,0,0,854,853,1,0,0,0,855,864,1,0,0,0,856,857,10,3,0,0,857,858,5,
        46,0,0,858,863,3,68,34,4,859,860,10,2,0,0,860,861,5,47,0,0,861,863,
        3,68,34,3,862,856,1,0,0,0,862,859,1,0,0,0,863,866,1,0,0,0,864,862,
        1,0,0,0,864,865,1,0,0,0,865,69,1,0,0,0,866,864,1,0,0,0,867,868,3,
        72,36,0,868,870,7,5,0,0,869,871,7,6,0,0,870,869,1,0,0,0,870,871,
        1,0,0,0,871,877,1,0,0,0,872,878,3,72,36,0,873,874,5,154,0,0,874,
        875,3,4,2,0,875,876,5,155,0,0,876,878,1,0,0,0,877,872,1,0,0,0,877,
        873,1,0,0,0,878,928,1,0,0,0,879,881,3,72,36,0,880,882,5,48,0,0,881,
        880,1,0,0,0,881,882,1,0,0,0,882,883,1,0,0,0,883,884,5,51,0,0,884,
        885,3,72,36,0,885,886,5,46,0,0,886,887,3,72,36,0,887,928,1,0,0,0,
        888,890,3,72,36,0,889,891,5,48,0,0,890,889,1,0,0,0,890,891,1,0,0,
        0,891,892,1,0,0,0,892,893,5,49,0,0,893,903,5,154,0,0,894,904,3,4,
        2,0,895,900,3,68,34,0,896,897,5,156,0,0,897,899,3,68,34,0,898,896,
        1,0,0,0,899,902,1,0,0,0,900,898,1,0,0,0,900,901,1,0,0,0,901,904,
        1,0,0,0,902,900,1,0,0,0,903,894,1,0,0,0,903,895,1,0,0,0,904,905,
        1,0,0,0,905,906,5,155,0,0,906,928,1,0,0,0,907,909,3,72,36,0,908,
        910,5,48,0,0,909,908,1,0,0,0,909,910,1,0,0,0,910,911,1,0,0,0,911,
        912,7,7,0,0,912,913,3,72,36,0,913,928,1,0,0,0,914,915,3,72,36,0,
        915,917,5,54,0,0,916,918,5,48,0,0,917,916,1,0,0,0,917,918,1,0,0,
        0,918,919,1,0,0,0,919,920,5,55,0,0,920,928,1,0,0,0,921,922,5,50,
        0,0,922,923,5,154,0,0,923,924,3,4,2,0,924,925,5,155,0,0,925,928,
        1,0,0,0,926,928,3,72,36,0,927,867,1,0,0,0,927,879,1,0,0,0,927,888,
        1,0,0,0,927,907,1,0,0,0,927,914,1,0,0,0,927,921,1,0,0,0,927,926,
        1,0,0,0,928,71,1,0,0,0,929,930,6,36,-1,0,930,931,5,167,0,0,931,936,
        3,72,36,3,932,933,5,121,0,0,933,936,3,72,36,2,934,936,3,74,37,0,
        935,929,1,0,0,0,935,932,1,0,0,0,935,934,1,0,0,0,936,948,1,0,0,0,
        937,938,10,6,0,0,938,939,5,169,0,0,939,947,3,72,36,7,940,941,10,
        5,0,0,941,942,7,8,0,0,942,947,3,72,36,6,943,944,10,4,0,0,944,945,
        7,9,0,0,945,947,3,72,36,5,946,937,1,0,0,0,946,940,1,0,0,0,946,943,
        1,0,0,0,947,950,1,0,0,0,948,946,1,0,0,0,948,949,1,0,0,0,949,73,1,
        0,0,0,950,948,1,0,0,0,951,966,3,108,54,0,952,966,3,76,38,0,953,966,
        3,78,39,0,954,966,3,80,40,0,955,966,3,82,41,0,956,966,3,84,42,0,
        957,966,3,94,47,0,958,961,5,154,0,0,959,962,3,4,2,0,960,962,3,68,
        34,0,961,959,1,0,0,0,961,960,1,0,0,0,962,963,1,0,0,0,963,964,5,155,
        0,0,964,966,1,0,0,0,965,951,1,0,0,0,965,952,1,0,0,0,965,953,1,0,
        0,0,965,954,1,0,0,0,965,955,1,0,0,0,965,956,1,0,0,0,965,957,1,0,
        0,0,965,958,1,0,0,0,966,75,1,0,0,0,967,969,5,58,0,0,968,970,3,68,
        34,0,969,968,1,0,0,0,969,970,1,0,0,0,970,976,1,0,0,0,971,972,5,59,
        0,0,972,973,3,68,34,0,973,974,5,60,0,0,974,975,3,68,34,0,975,977,
        1,0,0,0,976,971,1,0,0,0,977,978,1,0,0,0,978,976,1,0,0,0,978,979,
        1,0,0,0,979,982,1,0,0,0,980,981,5,61,0,0,981,983,3,68,34,0,982,980,
        1,0,0,0,982,983,1,0,0,0,983,984,1,0,0,0,984,985,5,62,0,0,985,77,
        1,0,0,0,986,987,5,63,0,0,987,988,5,154,0,0,988,989,3,68,34,0,989,
        990,5,27,0,0,990,991,3,66,33,0,991,992,5,155,0,0,992,79,1,0,0,0,
        993,994,5,136,0,0,994,995,5,154,0,0,995,996,7,10,0,0,996,997,5,17,
        0,0,997,998,3,68,34,0,998,999,5,155,0,0,999,81,1,0,0,0,1000,1001,
        5,137,0,0,1001,1002,5,154,0,0,1002,1003,3,68,34,0,1003,1004,5,49,
        0,0,1004,1005,3,68,34,0,1005,1006,5,155,0,0,1006,83,1,0,0,0,1007,
        1008,3,102,51,0,1008,1021,5,154,0,0,1009,1022,5,159,0,0,1010,1012,
        5,36,0,0,1011,1010,1,0,0,0,1011,1012,1,0,0,0,1012,1013,1,0,0,0,1013,
        1018,3,68,34,0,1014,1015,5,156,0,0,1015,1017,3,68,34,0,1016,1014,
        1,0,0,0,1017,1020,1,0,0,0,1018,1016,1,0,0,0,1018,1019,1,0,0,0,1019,
        1022,1,0,0,0,1020,1018,1,0,0,0,1021,1009,1,0,0,0,1021,1011,1,0,0,
        0,1021,1022,1,0,0,0,1022,1023,1,0,0,0,1023,1025,5,155,0,0,1024,1026,
        3,86,43,0,1025,1024,1,0,0,0,1025,1026,1,0,0,0,1026,85,1,0,0,0,1027,
        1028,5,64,0,0,1028,1039,5,154,0,0,1029,1030,5,65,0,0,1030,1031,5,
        20,0,0,1031,1036,3,68,34,0,1032,1033,5,156,0,0,1033,1035,3,68,34,
        0,1034,1032,1,0,0,0,1035,1038,1,0,0,0,1036,1034,1,0,0,0,1036,1037,
        1,0,0,0,1037,1040,1,0,0,0,1038,1036,1,0,0,0,1039,1029,1,0,0,0,1039,
        1040,1,0,0,0,1040,1042,1,0,0,0,1041,1043,3,38,19,0,1042,1041,1,0,
        0,0,1042,1043,1,0,0,0,1043,1045,1,0,0,0,1044,1046,3,88,44,0,1045,
        1044,1,0,0,0,1045,1046,1,0,0,0,1046,1047,1,0,0,0,1047,1048,5,155,
        0,0,1048,87,1,0,0,0,1049,1056,7,11,0,0,1050,1057,3,90,45,0,1051,
        1052,5,51,0,0,1052,1053,3,90,45,0,1053,1054,5,46,0,0,1054,1055,3,
        90,45,0,1055,1057,1,0,0,0,1056,1050,1,0,0,0,1056,1051,1,0,0,0,1057,
        89,1,0,0,0,1058,1059,5,70,0,0,1059,1066,7,12,0,0,1060,1061,5,71,
        0,0,1061,1066,5,72,0,0,1062,1063,3,72,36,0,1063,1064,7,12,0,0,1064,
        1066,1,0,0,0,1065,1058,1,0,0,0,1065,1060,1,0,0,0,1065,1062,1,0,0,
        0,1066,91,1,0,0,0,1067,1068,3,96,48,0,1068,1069,5,157,0,0,1069,1071,
        1,0,0,0,1070,1067,1,0,0,0,1070,1071,1,0,0,0,1071,1072,1,0,0,0,1072,
        1073,3,98,49,0,1073,93,1,0,0,0,1074,1075,3,96,48,0,1075,1076,5,157,
        0,0,1076,1078,1,0,0,0,1077,1074,1,0,0,0,1077,1078,1,0,0,0,1078,1079,
        1,0,0,0,1079,1080,3,98,49,0,1080,1081,5,157,0,0,1081,1083,1,0,0,
        0,1082,1077,1,0,0,0,1082,1083,1,0,0,0,1083,1084,1,0,0,0,1084,1085,
        3,100,50,0,1085,95,1,0,0,0,1086,1087,3,106,53,0,1087,97,1,0,0,0,
        1088,1089,3,106,53,0,1089,99,1,0,0,0,1090,1091,3,106,53,0,1091,101,
        1,0,0,0,1092,1093,3,106,53,0,1093,103,1,0,0,0,1094,1095,3,106,53,
        0,1095,105,1,0,0,0,1096,1097,7,13,0,0,1097,107,1,0,0,0,1098,1121,
        5,150,0,0,1099,1121,5,151,0,0,1100,1121,5,55,0,0,1101,1121,5,56,
        0,0,1102,1121,5,57,0,0,1103,1121,5,170,0,0,1104,1105,5,134,0,0,1105,
        1121,5,150,0,0,1106,1107,5,135,0,0,1107,1121,5,150,0,0,1108,1109,
        5,126,0,0,1109,1110,5,150,0,0,1110,1114,7,10,0,0,1111,1112,5,154,
        0,0,1112,1113,5,151,0,0,1113,1115,5,155,0,0,1114,1111,1,0,0,0,1114,
        1115,1,0,0,0,1115,1118,1,0,0,0,1116,1117,5,127,0,0,1117,1119,7,10,
        0,0,1118,1116,1,0,0,0,1118,1119,1,0,0,0,1119,1121,1,0,0,0,1120,1098,
        1,0,0,0,1120,1099,1,0,0,0,1120,1100,1,0,0,0,1120,1101,1,0,0,0,1120,
        1102,1,0,0,0,1120,1103,1,0,0,0,1120,1104,1,0,0,0,1120,1106,1,0,0,
        0,1120,1108,1,0,0,0,1121,109,1,0,0,0,159,115,119,132,135,139,142,
        150,155,160,165,170,174,177,180,183,186,189,198,209,216,219,227,
        237,242,254,260,265,268,270,278,285,290,293,299,302,304,309,313,
        317,320,333,338,346,352,360,364,373,383,395,408,421,427,442,447,
        451,457,463,474,479,488,499,506,512,516,521,524,537,541,544,550,
        553,556,562,565,574,591,595,599,601,614,619,628,633,635,643,649,
        656,662,671,678,684,687,690,694,698,701,705,711,719,725,734,737,
        743,747,754,757,766,772,776,781,786,792,796,798,805,814,821,827,
        833,836,843,846,848,854,862,864,870,877,881,890,900,903,909,917,
        927,935,946,948,961,965,969,978,982,1011,1018,1021,1025,1036,1039,
        1042,1045,1056,1065,1070,1077,1082,1114,1118,1120
    ];

    private static __ATN: antlr.ATN;
    public static get _ATN(): antlr.ATN {
        if (!ExasolParser.__ATN) {
            ExasolParser.__ATN = new antlr.ATNDeserializer().deserialize(ExasolParser._serializedATN);
        }

        return ExasolParser.__ATN;
    }


    private static readonly vocabulary = new antlr.Vocabulary(ExasolParser.literalNames, ExasolParser.symbolicNames, []);

    public override get vocabulary(): antlr.Vocabulary {
        return ExasolParser.vocabulary;
    }

    private static readonly decisionsToDFA = ExasolParser._ATN.decisionToState.map( (ds: antlr.DecisionState, index: number) => new antlr.DFA(ds, index) );
}

export class ProgramContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public statement(): StatementContext[];
    public statement(i: number): StatementContext | null;
    public statement(i?: number): StatementContext[] | StatementContext | null {
        if (i === undefined) {
            return this.getRuleContexts(StatementContext);
        }

        return this.getRuleContext(i, StatementContext);
    }
    public EOF(): antlr.TerminalNode {
        return this.getToken(ExasolParser.EOF, 0)!;
    }
    public SEMI(): antlr.TerminalNode[];
    public SEMI(i: number): antlr.TerminalNode | null;
    public SEMI(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.SEMI);
    	} else {
    		return this.getToken(ExasolParser.SEMI, i);
    	}
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_program;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterProgram) {
             listener.enterProgram(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitProgram) {
             listener.exitProgram(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitProgram) {
            return visitor.visitProgram(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class StatementContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public selectStatement(): SelectStatementContext | null {
        return this.getRuleContext(0, SelectStatementContext);
    }
    public insertStatement(): InsertStatementContext | null {
        return this.getRuleContext(0, InsertStatementContext);
    }
    public updateStatement(): UpdateStatementContext | null {
        return this.getRuleContext(0, UpdateStatementContext);
    }
    public deleteStatement(): DeleteStatementContext | null {
        return this.getRuleContext(0, DeleteStatementContext);
    }
    public mergeStatement(): MergeStatementContext | null {
        return this.getRuleContext(0, MergeStatementContext);
    }
    public truncateStatement(): TruncateStatementContext | null {
        return this.getRuleContext(0, TruncateStatementContext);
    }
    public createSchemaStatement(): CreateSchemaStatementContext | null {
        return this.getRuleContext(0, CreateSchemaStatementContext);
    }
    public createTableStatement(): CreateTableStatementContext | null {
        return this.getRuleContext(0, CreateTableStatementContext);
    }
    public dropStatement(): DropStatementContext | null {
        return this.getRuleContext(0, DropStatementContext);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_statement;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterStatement) {
             listener.enterStatement(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitStatement) {
             listener.exitStatement(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitStatement) {
            return visitor.visitStatement(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class SelectStatementContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public queryExpression(): QueryExpressionContext {
        return this.getRuleContext(0, QueryExpressionContext)!;
    }
    public withClause(): WithClauseContext | null {
        return this.getRuleContext(0, WithClauseContext);
    }
    public orderByClause(): OrderByClauseContext | null {
        return this.getRuleContext(0, OrderByClauseContext);
    }
    public limitClause(): LimitClauseContext | null {
        return this.getRuleContext(0, LimitClauseContext);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_selectStatement;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterSelectStatement) {
             listener.enterSelectStatement(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitSelectStatement) {
             listener.exitSelectStatement(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitSelectStatement) {
            return visitor.visitSelectStatement(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class QueryExpressionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public querySpec(): QuerySpecContext | null {
        return this.getRuleContext(0, QuerySpecContext);
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.LPAREN, 0);
    }
    public selectStatement(): SelectStatementContext | null {
        return this.getRuleContext(0, SelectStatementContext);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.RPAREN, 0);
    }
    public queryExpression(): QueryExpressionContext[];
    public queryExpression(i: number): QueryExpressionContext | null;
    public queryExpression(i?: number): QueryExpressionContext[] | QueryExpressionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(QueryExpressionContext);
        }

        return this.getRuleContext(i, QueryExpressionContext);
    }
    public UNION(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.UNION, 0);
    }
    public INTERSECT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.INTERSECT, 0);
    }
    public MINUS(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.MINUS, 0);
    }
    public EXCEPT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.EXCEPT, 0);
    }
    public ALL(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.ALL, 0);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_queryExpression;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterQueryExpression) {
             listener.enterQueryExpression(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitQueryExpression) {
             listener.exitQueryExpression(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitQueryExpression) {
            return visitor.visitQueryExpression(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class QuerySpecContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public SELECT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.SELECT, 0);
    }
    public selectList(): SelectListContext | null {
        return this.getRuleContext(0, SelectListContext);
    }
    public fromClause(): FromClauseContext | null {
        return this.getRuleContext(0, FromClauseContext);
    }
    public whereClause(): WhereClauseContext | null {
        return this.getRuleContext(0, WhereClauseContext);
    }
    public connectByClause(): ConnectByClauseContext | null {
        return this.getRuleContext(0, ConnectByClauseContext);
    }
    public groupByClause(): GroupByClauseContext | null {
        return this.getRuleContext(0, GroupByClauseContext);
    }
    public havingClause(): HavingClauseContext | null {
        return this.getRuleContext(0, HavingClauseContext);
    }
    public qualifyClause(): QualifyClauseContext | null {
        return this.getRuleContext(0, QualifyClauseContext);
    }
    public ALL(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.ALL, 0);
    }
    public DISTINCT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.DISTINCT, 0);
    }
    public VALUES(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.VALUES, 0);
    }
    public LPAREN(): antlr.TerminalNode[];
    public LPAREN(i: number): antlr.TerminalNode | null;
    public LPAREN(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.LPAREN);
    	} else {
    		return this.getToken(ExasolParser.LPAREN, i);
    	}
    }
    public expression(): ExpressionContext[];
    public expression(i: number): ExpressionContext | null;
    public expression(i?: number): ExpressionContext[] | ExpressionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ExpressionContext);
        }

        return this.getRuleContext(i, ExpressionContext);
    }
    public RPAREN(): antlr.TerminalNode[];
    public RPAREN(i: number): antlr.TerminalNode | null;
    public RPAREN(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.RPAREN);
    	} else {
    		return this.getToken(ExasolParser.RPAREN, i);
    	}
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.COMMA);
    	} else {
    		return this.getToken(ExasolParser.COMMA, i);
    	}
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_querySpec;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterQuerySpec) {
             listener.enterQuerySpec(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitQuerySpec) {
             listener.exitQuerySpec(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitQuerySpec) {
            return visitor.visitQuerySpec(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class WithClauseContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public WITH(): antlr.TerminalNode {
        return this.getToken(ExasolParser.WITH, 0)!;
    }
    public cteItem(): CteItemContext[];
    public cteItem(i: number): CteItemContext | null;
    public cteItem(i?: number): CteItemContext[] | CteItemContext | null {
        if (i === undefined) {
            return this.getRuleContexts(CteItemContext);
        }

        return this.getRuleContext(i, CteItemContext);
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.COMMA);
    	} else {
    		return this.getToken(ExasolParser.COMMA, i);
    	}
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_withClause;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterWithClause) {
             listener.enterWithClause(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitWithClause) {
             listener.exitWithClause(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitWithClause) {
            return visitor.visitWithClause(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class CteItemContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public tableName(): TableNameContext {
        return this.getRuleContext(0, TableNameContext)!;
    }
    public AS(): antlr.TerminalNode {
        return this.getToken(ExasolParser.AS, 0)!;
    }
    public LPAREN(): antlr.TerminalNode[];
    public LPAREN(i: number): antlr.TerminalNode | null;
    public LPAREN(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.LPAREN);
    	} else {
    		return this.getToken(ExasolParser.LPAREN, i);
    	}
    }
    public selectStatement(): SelectStatementContext {
        return this.getRuleContext(0, SelectStatementContext)!;
    }
    public RPAREN(): antlr.TerminalNode[];
    public RPAREN(i: number): antlr.TerminalNode | null;
    public RPAREN(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.RPAREN);
    	} else {
    		return this.getToken(ExasolParser.RPAREN, i);
    	}
    }
    public columnName(): ColumnNameContext[];
    public columnName(i: number): ColumnNameContext | null;
    public columnName(i?: number): ColumnNameContext[] | ColumnNameContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ColumnNameContext);
        }

        return this.getRuleContext(i, ColumnNameContext);
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.COMMA);
    	} else {
    		return this.getToken(ExasolParser.COMMA, i);
    	}
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_cteItem;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterCteItem) {
             listener.enterCteItem(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitCteItem) {
             listener.exitCteItem(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitCteItem) {
            return visitor.visitCteItem(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class SelectListContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public selectItem(): SelectItemContext[];
    public selectItem(i: number): SelectItemContext | null;
    public selectItem(i?: number): SelectItemContext[] | SelectItemContext | null {
        if (i === undefined) {
            return this.getRuleContexts(SelectItemContext);
        }

        return this.getRuleContext(i, SelectItemContext);
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.COMMA);
    	} else {
    		return this.getToken(ExasolParser.COMMA, i);
    	}
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_selectList;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterSelectList) {
             listener.enterSelectList(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitSelectList) {
             listener.exitSelectList(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitSelectList) {
            return visitor.visitSelectList(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class SelectItemContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public STAR(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.STAR, 0);
    }
    public tableName(): TableNameContext | null {
        return this.getRuleContext(0, TableNameContext);
    }
    public DOT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.DOT, 0);
    }
    public expression(): ExpressionContext | null {
        return this.getRuleContext(0, ExpressionContext);
    }
    public alias(): AliasContext | null {
        return this.getRuleContext(0, AliasContext);
    }
    public AS(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.AS, 0);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_selectItem;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterSelectItem) {
             listener.enterSelectItem(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitSelectItem) {
             listener.exitSelectItem(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitSelectItem) {
            return visitor.visitSelectItem(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class FromClauseContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public FROM(): antlr.TerminalNode {
        return this.getToken(ExasolParser.FROM, 0)!;
    }
    public tableRef(): TableRefContext[];
    public tableRef(i: number): TableRefContext | null;
    public tableRef(i?: number): TableRefContext[] | TableRefContext | null {
        if (i === undefined) {
            return this.getRuleContexts(TableRefContext);
        }

        return this.getRuleContext(i, TableRefContext);
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.COMMA);
    	} else {
    		return this.getToken(ExasolParser.COMMA, i);
    	}
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_fromClause;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterFromClause) {
             listener.enterFromClause(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitFromClause) {
             listener.exitFromClause(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitFromClause) {
            return visitor.visitFromClause(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class TableRefContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public tablePrimary(): TablePrimaryContext {
        return this.getRuleContext(0, TablePrimaryContext)!;
    }
    public joinClause(): JoinClauseContext[];
    public joinClause(i: number): JoinClauseContext | null;
    public joinClause(i?: number): JoinClauseContext[] | JoinClauseContext | null {
        if (i === undefined) {
            return this.getRuleContexts(JoinClauseContext);
        }

        return this.getRuleContext(i, JoinClauseContext);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_tableRef;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterTableRef) {
             listener.enterTableRef(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitTableRef) {
             listener.exitTableRef(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitTableRef) {
            return visitor.visitTableRef(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class TablePrimaryContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public schemaQualifiedTable(): SchemaQualifiedTableContext | null {
        return this.getRuleContext(0, SchemaQualifiedTableContext);
    }
    public alias(): AliasContext | null {
        return this.getRuleContext(0, AliasContext);
    }
    public AS(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.AS, 0);
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.LPAREN, 0);
    }
    public selectStatement(): SelectStatementContext | null {
        return this.getRuleContext(0, SelectStatementContext);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.RPAREN, 0);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_tablePrimary;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterTablePrimary) {
             listener.enterTablePrimary(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitTablePrimary) {
             listener.exitTablePrimary(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitTablePrimary) {
            return visitor.visitTablePrimary(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class JoinClauseContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public JOIN(): antlr.TerminalNode {
        return this.getToken(ExasolParser.JOIN, 0)!;
    }
    public tablePrimary(): TablePrimaryContext {
        return this.getRuleContext(0, TablePrimaryContext)!;
    }
    public INNER(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.INNER, 0);
    }
    public LEFT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.LEFT, 0);
    }
    public RIGHT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.RIGHT, 0);
    }
    public FULL(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.FULL, 0);
    }
    public CROSS(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.CROSS, 0);
    }
    public ON(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.ON, 0);
    }
    public expression(): ExpressionContext | null {
        return this.getRuleContext(0, ExpressionContext);
    }
    public USING(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.USING, 0);
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.LPAREN, 0);
    }
    public columnName(): ColumnNameContext[];
    public columnName(i: number): ColumnNameContext | null;
    public columnName(i?: number): ColumnNameContext[] | ColumnNameContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ColumnNameContext);
        }

        return this.getRuleContext(i, ColumnNameContext);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.RPAREN, 0);
    }
    public OUTER(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.OUTER, 0);
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.COMMA);
    	} else {
    		return this.getToken(ExasolParser.COMMA, i);
    	}
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_joinClause;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterJoinClause) {
             listener.enterJoinClause(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitJoinClause) {
             listener.exitJoinClause(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitJoinClause) {
            return visitor.visitJoinClause(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class WhereClauseContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public WHERE(): antlr.TerminalNode {
        return this.getToken(ExasolParser.WHERE, 0)!;
    }
    public expression(): ExpressionContext {
        return this.getRuleContext(0, ExpressionContext)!;
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_whereClause;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterWhereClause) {
             listener.enterWhereClause(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitWhereClause) {
             listener.exitWhereClause(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitWhereClause) {
            return visitor.visitWhereClause(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class ConnectByClauseContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public CONNECT(): antlr.TerminalNode {
        return this.getToken(ExasolParser.CONNECT, 0)!;
    }
    public BY(): antlr.TerminalNode {
        return this.getToken(ExasolParser.BY, 0)!;
    }
    public expression(): ExpressionContext[];
    public expression(i: number): ExpressionContext | null;
    public expression(i?: number): ExpressionContext[] | ExpressionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ExpressionContext);
        }

        return this.getRuleContext(i, ExpressionContext);
    }
    public NOCYCLE(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.NOCYCLE, 0);
    }
    public START(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.START, 0);
    }
    public WITH(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.WITH, 0);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_connectByClause;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterConnectByClause) {
             listener.enterConnectByClause(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitConnectByClause) {
             listener.exitConnectByClause(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitConnectByClause) {
            return visitor.visitConnectByClause(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class GroupByClauseContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public GROUP(): antlr.TerminalNode {
        return this.getToken(ExasolParser.GROUP, 0)!;
    }
    public BY(): antlr.TerminalNode {
        return this.getToken(ExasolParser.BY, 0)!;
    }
    public groupItem(): GroupItemContext[];
    public groupItem(i: number): GroupItemContext | null;
    public groupItem(i?: number): GroupItemContext[] | GroupItemContext | null {
        if (i === undefined) {
            return this.getRuleContexts(GroupItemContext);
        }

        return this.getRuleContext(i, GroupItemContext);
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.COMMA);
    	} else {
    		return this.getToken(ExasolParser.COMMA, i);
    	}
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_groupByClause;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterGroupByClause) {
             listener.enterGroupByClause(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitGroupByClause) {
             listener.exitGroupByClause(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitGroupByClause) {
            return visitor.visitGroupByClause(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class GroupItemContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public CUBE(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.CUBE, 0);
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.LPAREN, 0);
    }
    public expression(): ExpressionContext[];
    public expression(i: number): ExpressionContext | null;
    public expression(i?: number): ExpressionContext[] | ExpressionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ExpressionContext);
        }

        return this.getRuleContext(i, ExpressionContext);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.RPAREN, 0);
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.COMMA);
    	} else {
    		return this.getToken(ExasolParser.COMMA, i);
    	}
    }
    public ROLLUP(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.ROLLUP, 0);
    }
    public GROUPING(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.GROUPING, 0);
    }
    public SETS(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.SETS, 0);
    }
    public groupItem(): GroupItemContext[];
    public groupItem(i: number): GroupItemContext | null;
    public groupItem(i?: number): GroupItemContext[] | GroupItemContext | null {
        if (i === undefined) {
            return this.getRuleContexts(GroupItemContext);
        }

        return this.getRuleContext(i, GroupItemContext);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_groupItem;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterGroupItem) {
             listener.enterGroupItem(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitGroupItem) {
             listener.exitGroupItem(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitGroupItem) {
            return visitor.visitGroupItem(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class HavingClauseContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public HAVING(): antlr.TerminalNode {
        return this.getToken(ExasolParser.HAVING, 0)!;
    }
    public expression(): ExpressionContext {
        return this.getRuleContext(0, ExpressionContext)!;
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_havingClause;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterHavingClause) {
             listener.enterHavingClause(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitHavingClause) {
             listener.exitHavingClause(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitHavingClause) {
            return visitor.visitHavingClause(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class QualifyClauseContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public QUALIFY(): antlr.TerminalNode {
        return this.getToken(ExasolParser.QUALIFY, 0)!;
    }
    public expression(): ExpressionContext {
        return this.getRuleContext(0, ExpressionContext)!;
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_qualifyClause;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterQualifyClause) {
             listener.enterQualifyClause(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitQualifyClause) {
             listener.exitQualifyClause(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitQualifyClause) {
            return visitor.visitQualifyClause(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class OrderByClauseContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ORDER(): antlr.TerminalNode {
        return this.getToken(ExasolParser.ORDER, 0)!;
    }
    public BY(): antlr.TerminalNode {
        return this.getToken(ExasolParser.BY, 0)!;
    }
    public orderItem(): OrderItemContext[];
    public orderItem(i: number): OrderItemContext | null;
    public orderItem(i?: number): OrderItemContext[] | OrderItemContext | null {
        if (i === undefined) {
            return this.getRuleContexts(OrderItemContext);
        }

        return this.getRuleContext(i, OrderItemContext);
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.COMMA);
    	} else {
    		return this.getToken(ExasolParser.COMMA, i);
    	}
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_orderByClause;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterOrderByClause) {
             listener.enterOrderByClause(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitOrderByClause) {
             listener.exitOrderByClause(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitOrderByClause) {
            return visitor.visitOrderByClause(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class OrderItemContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public expression(): ExpressionContext {
        return this.getRuleContext(0, ExpressionContext)!;
    }
    public NULLS(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.NULLS, 0);
    }
    public ASC(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.ASC, 0);
    }
    public DESC(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.DESC, 0);
    }
    public FIRST(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.FIRST, 0);
    }
    public LAST(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.LAST, 0);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_orderItem;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterOrderItem) {
             listener.enterOrderItem(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitOrderItem) {
             listener.exitOrderItem(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitOrderItem) {
            return visitor.visitOrderItem(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class LimitClauseContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public LIMIT(): antlr.TerminalNode {
        return this.getToken(ExasolParser.LIMIT, 0)!;
    }
    public NUMBER(): antlr.TerminalNode[];
    public NUMBER(i: number): antlr.TerminalNode | null;
    public NUMBER(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.NUMBER);
    	} else {
    		return this.getToken(ExasolParser.NUMBER, i);
    	}
    }
    public OFFSET(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.OFFSET, 0);
    }
    public COMMA(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.COMMA, 0);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_limitClause;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterLimitClause) {
             listener.enterLimitClause(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitLimitClause) {
             listener.exitLimitClause(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitLimitClause) {
            return visitor.visitLimitClause(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class InsertStatementContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public INSERT(): antlr.TerminalNode {
        return this.getToken(ExasolParser.INSERT, 0)!;
    }
    public INTO(): antlr.TerminalNode {
        return this.getToken(ExasolParser.INTO, 0)!;
    }
    public schemaQualifiedTable(): SchemaQualifiedTableContext {
        return this.getRuleContext(0, SchemaQualifiedTableContext)!;
    }
    public VALUES(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.VALUES, 0);
    }
    public LPAREN(): antlr.TerminalNode[];
    public LPAREN(i: number): antlr.TerminalNode | null;
    public LPAREN(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.LPAREN);
    	} else {
    		return this.getToken(ExasolParser.LPAREN, i);
    	}
    }
    public insertValue(): InsertValueContext[];
    public insertValue(i: number): InsertValueContext | null;
    public insertValue(i?: number): InsertValueContext[] | InsertValueContext | null {
        if (i === undefined) {
            return this.getRuleContexts(InsertValueContext);
        }

        return this.getRuleContext(i, InsertValueContext);
    }
    public RPAREN(): antlr.TerminalNode[];
    public RPAREN(i: number): antlr.TerminalNode | null;
    public RPAREN(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.RPAREN);
    	} else {
    		return this.getToken(ExasolParser.RPAREN, i);
    	}
    }
    public selectStatement(): SelectStatementContext | null {
        return this.getRuleContext(0, SelectStatementContext);
    }
    public DEFAULT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.DEFAULT, 0);
    }
    public columnName(): ColumnNameContext[];
    public columnName(i: number): ColumnNameContext | null;
    public columnName(i?: number): ColumnNameContext[] | ColumnNameContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ColumnNameContext);
        }

        return this.getRuleContext(i, ColumnNameContext);
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.COMMA);
    	} else {
    		return this.getToken(ExasolParser.COMMA, i);
    	}
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_insertStatement;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterInsertStatement) {
             listener.enterInsertStatement(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitInsertStatement) {
             listener.exitInsertStatement(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitInsertStatement) {
            return visitor.visitInsertStatement(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class InsertValueContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public expression(): ExpressionContext | null {
        return this.getRuleContext(0, ExpressionContext);
    }
    public DEFAULT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.DEFAULT, 0);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_insertValue;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterInsertValue) {
             listener.enterInsertValue(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitInsertValue) {
             listener.exitInsertValue(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitInsertValue) {
            return visitor.visitInsertValue(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class UpdateStatementContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public UPDATE(): antlr.TerminalNode {
        return this.getToken(ExasolParser.UPDATE, 0)!;
    }
    public schemaQualifiedTable(): SchemaQualifiedTableContext {
        return this.getRuleContext(0, SchemaQualifiedTableContext)!;
    }
    public SET(): antlr.TerminalNode {
        return this.getToken(ExasolParser.SET, 0)!;
    }
    public columnName(): ColumnNameContext[];
    public columnName(i: number): ColumnNameContext | null;
    public columnName(i?: number): ColumnNameContext[] | ColumnNameContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ColumnNameContext);
        }

        return this.getRuleContext(i, ColumnNameContext);
    }
    public EQ(): antlr.TerminalNode[];
    public EQ(i: number): antlr.TerminalNode | null;
    public EQ(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.EQ);
    	} else {
    		return this.getToken(ExasolParser.EQ, i);
    	}
    }
    public expression(): ExpressionContext[];
    public expression(i: number): ExpressionContext | null;
    public expression(i?: number): ExpressionContext[] | ExpressionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ExpressionContext);
        }

        return this.getRuleContext(i, ExpressionContext);
    }
    public alias(): AliasContext | null {
        return this.getRuleContext(0, AliasContext);
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.COMMA);
    	} else {
    		return this.getToken(ExasolParser.COMMA, i);
    	}
    }
    public fromClause(): FromClauseContext | null {
        return this.getRuleContext(0, FromClauseContext);
    }
    public whereClause(): WhereClauseContext | null {
        return this.getRuleContext(0, WhereClauseContext);
    }
    public AS(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.AS, 0);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_updateStatement;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterUpdateStatement) {
             listener.enterUpdateStatement(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitUpdateStatement) {
             listener.exitUpdateStatement(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitUpdateStatement) {
            return visitor.visitUpdateStatement(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class DeleteStatementContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public DELETE(): antlr.TerminalNode {
        return this.getToken(ExasolParser.DELETE, 0)!;
    }
    public FROM(): antlr.TerminalNode {
        return this.getToken(ExasolParser.FROM, 0)!;
    }
    public schemaQualifiedTable(): SchemaQualifiedTableContext {
        return this.getRuleContext(0, SchemaQualifiedTableContext)!;
    }
    public alias(): AliasContext | null {
        return this.getRuleContext(0, AliasContext);
    }
    public whereClause(): WhereClauseContext | null {
        return this.getRuleContext(0, WhereClauseContext);
    }
    public AS(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.AS, 0);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_deleteStatement;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterDeleteStatement) {
             listener.enterDeleteStatement(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitDeleteStatement) {
             listener.exitDeleteStatement(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitDeleteStatement) {
            return visitor.visitDeleteStatement(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class MergeStatementContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public MERGE(): antlr.TerminalNode {
        return this.getToken(ExasolParser.MERGE, 0)!;
    }
    public INTO(): antlr.TerminalNode {
        return this.getToken(ExasolParser.INTO, 0)!;
    }
    public schemaQualifiedTable(): SchemaQualifiedTableContext {
        return this.getRuleContext(0, SchemaQualifiedTableContext)!;
    }
    public USING(): antlr.TerminalNode {
        return this.getToken(ExasolParser.USING, 0)!;
    }
    public tablePrimary(): TablePrimaryContext {
        return this.getRuleContext(0, TablePrimaryContext)!;
    }
    public ON(): antlr.TerminalNode {
        return this.getToken(ExasolParser.ON, 0)!;
    }
    public expression(): ExpressionContext {
        return this.getRuleContext(0, ExpressionContext)!;
    }
    public alias(): AliasContext | null {
        return this.getRuleContext(0, AliasContext);
    }
    public mergeWhen(): MergeWhenContext[];
    public mergeWhen(i: number): MergeWhenContext | null;
    public mergeWhen(i?: number): MergeWhenContext[] | MergeWhenContext | null {
        if (i === undefined) {
            return this.getRuleContexts(MergeWhenContext);
        }

        return this.getRuleContext(i, MergeWhenContext);
    }
    public AS(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.AS, 0);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_mergeStatement;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterMergeStatement) {
             listener.enterMergeStatement(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitMergeStatement) {
             listener.exitMergeStatement(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitMergeStatement) {
            return visitor.visitMergeStatement(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class MergeWhenContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public WHEN(): antlr.TerminalNode {
        return this.getToken(ExasolParser.WHEN, 0)!;
    }
    public MATCHED(): antlr.TerminalNode {
        return this.getToken(ExasolParser.MATCHED, 0)!;
    }
    public THEN(): antlr.TerminalNode {
        return this.getToken(ExasolParser.THEN, 0)!;
    }
    public UPDATE(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.UPDATE, 0);
    }
    public SET(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.SET, 0);
    }
    public columnName(): ColumnNameContext[];
    public columnName(i: number): ColumnNameContext | null;
    public columnName(i?: number): ColumnNameContext[] | ColumnNameContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ColumnNameContext);
        }

        return this.getRuleContext(i, ColumnNameContext);
    }
    public EQ(): antlr.TerminalNode[];
    public EQ(i: number): antlr.TerminalNode | null;
    public EQ(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.EQ);
    	} else {
    		return this.getToken(ExasolParser.EQ, i);
    	}
    }
    public expression(): ExpressionContext[];
    public expression(i: number): ExpressionContext | null;
    public expression(i?: number): ExpressionContext[] | ExpressionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ExpressionContext);
        }

        return this.getRuleContext(i, ExpressionContext);
    }
    public DELETE(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.DELETE, 0);
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.COMMA);
    	} else {
    		return this.getToken(ExasolParser.COMMA, i);
    	}
    }
    public whereClause(): WhereClauseContext | null {
        return this.getRuleContext(0, WhereClauseContext);
    }
    public NOT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.NOT, 0);
    }
    public INSERT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.INSERT, 0);
    }
    public VALUES(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.VALUES, 0);
    }
    public LPAREN(): antlr.TerminalNode[];
    public LPAREN(i: number): antlr.TerminalNode | null;
    public LPAREN(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.LPAREN);
    	} else {
    		return this.getToken(ExasolParser.LPAREN, i);
    	}
    }
    public insertValue(): InsertValueContext[];
    public insertValue(i: number): InsertValueContext | null;
    public insertValue(i?: number): InsertValueContext[] | InsertValueContext | null {
        if (i === undefined) {
            return this.getRuleContexts(InsertValueContext);
        }

        return this.getRuleContext(i, InsertValueContext);
    }
    public RPAREN(): antlr.TerminalNode[];
    public RPAREN(i: number): antlr.TerminalNode | null;
    public RPAREN(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.RPAREN);
    	} else {
    		return this.getToken(ExasolParser.RPAREN, i);
    	}
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_mergeWhen;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterMergeWhen) {
             listener.enterMergeWhen(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitMergeWhen) {
             listener.exitMergeWhen(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitMergeWhen) {
            return visitor.visitMergeWhen(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class TruncateStatementContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public TRUNCATE(): antlr.TerminalNode {
        return this.getToken(ExasolParser.TRUNCATE, 0)!;
    }
    public TABLE(): antlr.TerminalNode {
        return this.getToken(ExasolParser.TABLE, 0)!;
    }
    public schemaQualifiedTable(): SchemaQualifiedTableContext {
        return this.getRuleContext(0, SchemaQualifiedTableContext)!;
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_truncateStatement;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterTruncateStatement) {
             listener.enterTruncateStatement(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitTruncateStatement) {
             listener.exitTruncateStatement(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitTruncateStatement) {
            return visitor.visitTruncateStatement(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class CreateSchemaStatementContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public CREATE(): antlr.TerminalNode {
        return this.getToken(ExasolParser.CREATE, 0)!;
    }
    public SCHEMA(): antlr.TerminalNode {
        return this.getToken(ExasolParser.SCHEMA, 0)!;
    }
    public schemaName(): SchemaNameContext {
        return this.getRuleContext(0, SchemaNameContext)!;
    }
    public VIRTUAL(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.VIRTUAL, 0);
    }
    public IF(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.IF, 0);
    }
    public NOT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.NOT, 0);
    }
    public EXISTS(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.EXISTS, 0);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_createSchemaStatement;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterCreateSchemaStatement) {
             listener.enterCreateSchemaStatement(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitCreateSchemaStatement) {
             listener.exitCreateSchemaStatement(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitCreateSchemaStatement) {
            return visitor.visitCreateSchemaStatement(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class CreateTableStatementContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public CREATE(): antlr.TerminalNode {
        return this.getToken(ExasolParser.CREATE, 0)!;
    }
    public TABLE(): antlr.TerminalNode {
        return this.getToken(ExasolParser.TABLE, 0)!;
    }
    public schemaQualifiedTable(): SchemaQualifiedTableContext {
        return this.getRuleContext(0, SchemaQualifiedTableContext)!;
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.LPAREN, 0);
    }
    public tableElement(): TableElementContext[];
    public tableElement(i: number): TableElementContext | null;
    public tableElement(i?: number): TableElementContext[] | TableElementContext | null {
        if (i === undefined) {
            return this.getRuleContexts(TableElementContext);
        }

        return this.getRuleContext(i, TableElementContext);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.RPAREN, 0);
    }
    public AS(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.AS, 0);
    }
    public selectStatement(): SelectStatementContext | null {
        return this.getRuleContext(0, SelectStatementContext);
    }
    public OR(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.OR, 0);
    }
    public REPLACE(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.REPLACE, 0);
    }
    public IF(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.IF, 0);
    }
    public NOT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.NOT, 0);
    }
    public EXISTS(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.EXISTS, 0);
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.COMMA);
    	} else {
    		return this.getToken(ExasolParser.COMMA, i);
    	}
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_createTableStatement;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterCreateTableStatement) {
             listener.enterCreateTableStatement(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitCreateTableStatement) {
             listener.exitCreateTableStatement(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitCreateTableStatement) {
            return visitor.visitCreateTableStatement(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class TableElementContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public columnName(): ColumnNameContext[];
    public columnName(i: number): ColumnNameContext | null;
    public columnName(i?: number): ColumnNameContext[] | ColumnNameContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ColumnNameContext);
        }

        return this.getRuleContext(i, ColumnNameContext);
    }
    public dataType(): DataTypeContext | null {
        return this.getRuleContext(0, DataTypeContext);
    }
    public DEFAULT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.DEFAULT, 0);
    }
    public expression(): ExpressionContext | null {
        return this.getRuleContext(0, ExpressionContext);
    }
    public NULL_(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.NULL_, 0);
    }
    public PRIMARY(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.PRIMARY, 0);
    }
    public KEY(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.KEY, 0);
    }
    public COMMENT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.COMMENT, 0);
    }
    public STRING(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.STRING, 0);
    }
    public NOT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.NOT, 0);
    }
    public IS(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.IS, 0);
    }
    public CONSTRAINT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.CONSTRAINT, 0);
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.LPAREN, 0);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.RPAREN, 0);
    }
    public FOREIGN(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.FOREIGN, 0);
    }
    public alias(): AliasContext | null {
        return this.getRuleContext(0, AliasContext);
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.COMMA);
    	} else {
    		return this.getToken(ExasolParser.COMMA, i);
    	}
    }
    public REFERENCES(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.REFERENCES, 0);
    }
    public schemaQualifiedTable(): SchemaQualifiedTableContext | null {
        return this.getRuleContext(0, SchemaQualifiedTableContext);
    }
    public DISTRIBUTE(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.DISTRIBUTE, 0);
    }
    public BY(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.BY, 0);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_tableElement;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterTableElement) {
             listener.enterTableElement(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitTableElement) {
             listener.exitTableElement(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitTableElement) {
            return visitor.visitTableElement(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class DropStatementContext extends antlr.ParserRuleContext {
    public _CASCADE_OPT?: Token | null;
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public DROP(): antlr.TerminalNode {
        return this.getToken(ExasolParser.DROP, 0)!;
    }
    public schemaQualifiedTable(): SchemaQualifiedTableContext {
        return this.getRuleContext(0, SchemaQualifiedTableContext)!;
    }
    public TABLE(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.TABLE, 0);
    }
    public VIEW(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.VIEW, 0);
    }
    public SCHEMA(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.SCHEMA, 0);
    }
    public FUNCTION(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.FUNCTION, 0);
    }
    public SCRIPT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.SCRIPT, 0);
    }
    public CONNECTION(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.CONNECTION, 0);
    }
    public IF(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.IF, 0);
    }
    public EXISTS(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.EXISTS, 0);
    }
    public IDENT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.IDENT, 0);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_dropStatement;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterDropStatement) {
             listener.enterDropStatement(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitDropStatement) {
             listener.exitDropStatement(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitDropStatement) {
            return visitor.visitDropStatement(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class DataTypeContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public DECIMAL_T(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.DECIMAL_T, 0);
    }
    public LPAREN(): antlr.TerminalNode[];
    public LPAREN(i: number): antlr.TerminalNode | null;
    public LPAREN(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.LPAREN);
    	} else {
    		return this.getToken(ExasolParser.LPAREN, i);
    	}
    }
    public NUMBER(): antlr.TerminalNode[];
    public NUMBER(i: number): antlr.TerminalNode | null;
    public NUMBER(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.NUMBER);
    	} else {
    		return this.getToken(ExasolParser.NUMBER, i);
    	}
    }
    public RPAREN(): antlr.TerminalNode[];
    public RPAREN(i: number): antlr.TerminalNode | null;
    public RPAREN(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.RPAREN);
    	} else {
    		return this.getToken(ExasolParser.RPAREN, i);
    	}
    }
    public COMMA(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.COMMA, 0);
    }
    public VARCHAR_T(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.VARCHAR_T, 0);
    }
    public CHARACTER(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.CHARACTER, 0);
    }
    public SET(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.SET, 0);
    }
    public UTF8(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.UTF8, 0);
    }
    public ASCII_CS(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.ASCII_CS, 0);
    }
    public CHAR_T(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.CHAR_T, 0);
    }
    public VARYING(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.VARYING, 0);
    }
    public BOOLEAN_T(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.BOOLEAN_T, 0);
    }
    public DOUBLE_T(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.DOUBLE_T, 0);
    }
    public PRECISION(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.PRECISION, 0);
    }
    public DATE(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.DATE, 0);
    }
    public TIMESTAMP(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.TIMESTAMP, 0);
    }
    public WITH(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.WITH, 0);
    }
    public IDENT(): antlr.TerminalNode[];
    public IDENT(i: number): antlr.TerminalNode | null;
    public IDENT(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.IDENT);
    	} else {
    		return this.getToken(ExasolParser.IDENT, i);
    	}
    }
    public LOCAL(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.LOCAL, 0);
    }
    public INTERVAL(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.INTERVAL, 0);
    }
    public YEAR(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.YEAR, 0);
    }
    public TO(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.TO, 0);
    }
    public MONTH(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.MONTH, 0);
    }
    public DAY(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.DAY, 0);
    }
    public SECOND(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.SECOND, 0);
    }
    public GEOMETRY(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.GEOMETRY, 0);
    }
    public HASHTYPE(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.HASHTYPE, 0);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_dataType;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterDataType) {
             listener.enterDataType(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitDataType) {
             listener.exitDataType(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitDataType) {
            return visitor.visitDataType(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class ExpressionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public NOT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.NOT, 0);
    }
    public expression(): ExpressionContext[];
    public expression(i: number): ExpressionContext | null;
    public expression(i?: number): ExpressionContext[] | ExpressionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ExpressionContext);
        }

        return this.getRuleContext(i, ExpressionContext);
    }
    public predicate(): PredicateContext | null {
        return this.getRuleContext(0, PredicateContext);
    }
    public AND(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.AND, 0);
    }
    public OR(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.OR, 0);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_expression;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterExpression) {
             listener.enterExpression(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitExpression) {
             listener.exitExpression(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitExpression) {
            return visitor.visitExpression(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class PredicateContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public valueExpr(): ValueExprContext[];
    public valueExpr(i: number): ValueExprContext | null;
    public valueExpr(i?: number): ValueExprContext[] | ValueExprContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ValueExprContext);
        }

        return this.getRuleContext(i, ValueExprContext);
    }
    public EQ(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.EQ, 0);
    }
    public NEQ(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.NEQ, 0);
    }
    public LT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.LT, 0);
    }
    public LTE(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.LTE, 0);
    }
    public GT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.GT, 0);
    }
    public GTE(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.GTE, 0);
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.LPAREN, 0);
    }
    public selectStatement(): SelectStatementContext | null {
        return this.getRuleContext(0, SelectStatementContext);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.RPAREN, 0);
    }
    public ANY(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.ANY, 0);
    }
    public SOME(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.SOME, 0);
    }
    public ALL(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.ALL, 0);
    }
    public BETWEEN(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.BETWEEN, 0);
    }
    public AND(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.AND, 0);
    }
    public NOT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.NOT, 0);
    }
    public IN(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.IN, 0);
    }
    public expression(): ExpressionContext[];
    public expression(i: number): ExpressionContext | null;
    public expression(i?: number): ExpressionContext[] | ExpressionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ExpressionContext);
        }

        return this.getRuleContext(i, ExpressionContext);
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.COMMA);
    	} else {
    		return this.getToken(ExasolParser.COMMA, i);
    	}
    }
    public LIKE(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.LIKE, 0);
    }
    public REGEXP_LIKE(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.REGEXP_LIKE, 0);
    }
    public IS(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.IS, 0);
    }
    public NULL_(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.NULL_, 0);
    }
    public EXISTS(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.EXISTS, 0);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_predicate;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterPredicate) {
             listener.enterPredicate(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitPredicate) {
             listener.exitPredicate(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitPredicate) {
            return visitor.visitPredicate(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class ValueExprContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public MINUS_OP(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.MINUS_OP, 0);
    }
    public valueExpr(): ValueExprContext[];
    public valueExpr(i: number): ValueExprContext | null;
    public valueExpr(i?: number): ValueExprContext[] | ValueExprContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ValueExprContext);
        }

        return this.getRuleContext(i, ValueExprContext);
    }
    public PRIOR(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.PRIOR, 0);
    }
    public primaryExpr(): PrimaryExprContext | null {
        return this.getRuleContext(0, PrimaryExprContext);
    }
    public CONCAT_OP(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.CONCAT_OP, 0);
    }
    public STAR(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.STAR, 0);
    }
    public SLASH(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.SLASH, 0);
    }
    public PLUS(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.PLUS, 0);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_valueExpr;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterValueExpr) {
             listener.enterValueExpr(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitValueExpr) {
             listener.exitValueExpr(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitValueExpr) {
            return visitor.visitValueExpr(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class PrimaryExprContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public literal(): LiteralContext | null {
        return this.getRuleContext(0, LiteralContext);
    }
    public caseExpr(): CaseExprContext | null {
        return this.getRuleContext(0, CaseExprContext);
    }
    public castExpr(): CastExprContext | null {
        return this.getRuleContext(0, CastExprContext);
    }
    public extractExpr(): ExtractExprContext | null {
        return this.getRuleContext(0, ExtractExprContext);
    }
    public positionExpr(): PositionExprContext | null {
        return this.getRuleContext(0, PositionExprContext);
    }
    public functionCall(): FunctionCallContext | null {
        return this.getRuleContext(0, FunctionCallContext);
    }
    public columnRef(): ColumnRefContext | null {
        return this.getRuleContext(0, ColumnRefContext);
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.LPAREN, 0);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.RPAREN, 0);
    }
    public selectStatement(): SelectStatementContext | null {
        return this.getRuleContext(0, SelectStatementContext);
    }
    public expression(): ExpressionContext | null {
        return this.getRuleContext(0, ExpressionContext);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_primaryExpr;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterPrimaryExpr) {
             listener.enterPrimaryExpr(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitPrimaryExpr) {
             listener.exitPrimaryExpr(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitPrimaryExpr) {
            return visitor.visitPrimaryExpr(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class CaseExprContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public CASE(): antlr.TerminalNode {
        return this.getToken(ExasolParser.CASE, 0)!;
    }
    public END(): antlr.TerminalNode {
        return this.getToken(ExasolParser.END, 0)!;
    }
    public expression(): ExpressionContext[];
    public expression(i: number): ExpressionContext | null;
    public expression(i?: number): ExpressionContext[] | ExpressionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ExpressionContext);
        }

        return this.getRuleContext(i, ExpressionContext);
    }
    public WHEN(): antlr.TerminalNode[];
    public WHEN(i: number): antlr.TerminalNode | null;
    public WHEN(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.WHEN);
    	} else {
    		return this.getToken(ExasolParser.WHEN, i);
    	}
    }
    public THEN(): antlr.TerminalNode[];
    public THEN(i: number): antlr.TerminalNode | null;
    public THEN(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.THEN);
    	} else {
    		return this.getToken(ExasolParser.THEN, i);
    	}
    }
    public ELSE(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.ELSE, 0);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_caseExpr;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterCaseExpr) {
             listener.enterCaseExpr(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitCaseExpr) {
             listener.exitCaseExpr(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitCaseExpr) {
            return visitor.visitCaseExpr(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class CastExprContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public CAST(): antlr.TerminalNode {
        return this.getToken(ExasolParser.CAST, 0)!;
    }
    public LPAREN(): antlr.TerminalNode {
        return this.getToken(ExasolParser.LPAREN, 0)!;
    }
    public expression(): ExpressionContext {
        return this.getRuleContext(0, ExpressionContext)!;
    }
    public AS(): antlr.TerminalNode {
        return this.getToken(ExasolParser.AS, 0)!;
    }
    public dataType(): DataTypeContext {
        return this.getRuleContext(0, DataTypeContext)!;
    }
    public RPAREN(): antlr.TerminalNode {
        return this.getToken(ExasolParser.RPAREN, 0)!;
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_castExpr;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterCastExpr) {
             listener.enterCastExpr(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitCastExpr) {
             listener.exitCastExpr(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitCastExpr) {
            return visitor.visitCastExpr(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class ExtractExprContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public EXTRACT(): antlr.TerminalNode {
        return this.getToken(ExasolParser.EXTRACT, 0)!;
    }
    public LPAREN(): antlr.TerminalNode {
        return this.getToken(ExasolParser.LPAREN, 0)!;
    }
    public FROM(): antlr.TerminalNode {
        return this.getToken(ExasolParser.FROM, 0)!;
    }
    public expression(): ExpressionContext {
        return this.getRuleContext(0, ExpressionContext)!;
    }
    public RPAREN(): antlr.TerminalNode {
        return this.getToken(ExasolParser.RPAREN, 0)!;
    }
    public YEAR(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.YEAR, 0);
    }
    public MONTH(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.MONTH, 0);
    }
    public DAY(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.DAY, 0);
    }
    public HOUR(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.HOUR, 0);
    }
    public MINUTE(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.MINUTE, 0);
    }
    public SECOND(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.SECOND, 0);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_extractExpr;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterExtractExpr) {
             listener.enterExtractExpr(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitExtractExpr) {
             listener.exitExtractExpr(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitExtractExpr) {
            return visitor.visitExtractExpr(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class PositionExprContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public POSITION(): antlr.TerminalNode {
        return this.getToken(ExasolParser.POSITION, 0)!;
    }
    public LPAREN(): antlr.TerminalNode {
        return this.getToken(ExasolParser.LPAREN, 0)!;
    }
    public expression(): ExpressionContext[];
    public expression(i: number): ExpressionContext | null;
    public expression(i?: number): ExpressionContext[] | ExpressionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ExpressionContext);
        }

        return this.getRuleContext(i, ExpressionContext);
    }
    public IN(): antlr.TerminalNode {
        return this.getToken(ExasolParser.IN, 0)!;
    }
    public RPAREN(): antlr.TerminalNode {
        return this.getToken(ExasolParser.RPAREN, 0)!;
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_positionExpr;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterPositionExpr) {
             listener.enterPositionExpr(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitPositionExpr) {
             listener.exitPositionExpr(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitPositionExpr) {
            return visitor.visitPositionExpr(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class FunctionCallContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public functionName(): FunctionNameContext {
        return this.getRuleContext(0, FunctionNameContext)!;
    }
    public LPAREN(): antlr.TerminalNode {
        return this.getToken(ExasolParser.LPAREN, 0)!;
    }
    public RPAREN(): antlr.TerminalNode {
        return this.getToken(ExasolParser.RPAREN, 0)!;
    }
    public STAR(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.STAR, 0);
    }
    public expression(): ExpressionContext[];
    public expression(i: number): ExpressionContext | null;
    public expression(i?: number): ExpressionContext[] | ExpressionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ExpressionContext);
        }

        return this.getRuleContext(i, ExpressionContext);
    }
    public overClause(): OverClauseContext | null {
        return this.getRuleContext(0, OverClauseContext);
    }
    public DISTINCT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.DISTINCT, 0);
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.COMMA);
    	} else {
    		return this.getToken(ExasolParser.COMMA, i);
    	}
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_functionCall;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterFunctionCall) {
             listener.enterFunctionCall(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitFunctionCall) {
             listener.exitFunctionCall(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitFunctionCall) {
            return visitor.visitFunctionCall(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class OverClauseContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public OVER(): antlr.TerminalNode {
        return this.getToken(ExasolParser.OVER, 0)!;
    }
    public LPAREN(): antlr.TerminalNode {
        return this.getToken(ExasolParser.LPAREN, 0)!;
    }
    public RPAREN(): antlr.TerminalNode {
        return this.getToken(ExasolParser.RPAREN, 0)!;
    }
    public PARTITION(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.PARTITION, 0);
    }
    public BY(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.BY, 0);
    }
    public expression(): ExpressionContext[];
    public expression(i: number): ExpressionContext | null;
    public expression(i?: number): ExpressionContext[] | ExpressionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ExpressionContext);
        }

        return this.getRuleContext(i, ExpressionContext);
    }
    public orderByClause(): OrderByClauseContext | null {
        return this.getRuleContext(0, OrderByClauseContext);
    }
    public windowFrame(): WindowFrameContext | null {
        return this.getRuleContext(0, WindowFrameContext);
    }
    public COMMA(): antlr.TerminalNode[];
    public COMMA(i: number): antlr.TerminalNode | null;
    public COMMA(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.COMMA);
    	} else {
    		return this.getToken(ExasolParser.COMMA, i);
    	}
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_overClause;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterOverClause) {
             listener.enterOverClause(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitOverClause) {
             listener.exitOverClause(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitOverClause) {
            return visitor.visitOverClause(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class WindowFrameContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ROWS(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.ROWS, 0);
    }
    public RANGE(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.RANGE, 0);
    }
    public frameBound(): FrameBoundContext[];
    public frameBound(i: number): FrameBoundContext | null;
    public frameBound(i?: number): FrameBoundContext[] | FrameBoundContext | null {
        if (i === undefined) {
            return this.getRuleContexts(FrameBoundContext);
        }

        return this.getRuleContext(i, FrameBoundContext);
    }
    public BETWEEN(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.BETWEEN, 0);
    }
    public AND(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.AND, 0);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_windowFrame;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterWindowFrame) {
             listener.enterWindowFrame(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitWindowFrame) {
             listener.exitWindowFrame(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitWindowFrame) {
            return visitor.visitWindowFrame(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class FrameBoundContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public UNBOUNDED(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.UNBOUNDED, 0);
    }
    public PRECEDING(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.PRECEDING, 0);
    }
    public FOLLOWING(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.FOLLOWING, 0);
    }
    public CURRENT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.CURRENT, 0);
    }
    public ROW(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.ROW, 0);
    }
    public valueExpr(): ValueExprContext | null {
        return this.getRuleContext(0, ValueExprContext);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_frameBound;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterFrameBound) {
             listener.enterFrameBound(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitFrameBound) {
             listener.exitFrameBound(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitFrameBound) {
            return visitor.visitFrameBound(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class SchemaQualifiedTableContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public tableName(): TableNameContext {
        return this.getRuleContext(0, TableNameContext)!;
    }
    public schemaName(): SchemaNameContext | null {
        return this.getRuleContext(0, SchemaNameContext);
    }
    public DOT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.DOT, 0);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_schemaQualifiedTable;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterSchemaQualifiedTable) {
             listener.enterSchemaQualifiedTable(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitSchemaQualifiedTable) {
             listener.exitSchemaQualifiedTable(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitSchemaQualifiedTable) {
            return visitor.visitSchemaQualifiedTable(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class ColumnRefContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public columnName(): ColumnNameContext {
        return this.getRuleContext(0, ColumnNameContext)!;
    }
    public tableName(): TableNameContext | null {
        return this.getRuleContext(0, TableNameContext);
    }
    public DOT(): antlr.TerminalNode[];
    public DOT(i: number): antlr.TerminalNode | null;
    public DOT(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.DOT);
    	} else {
    		return this.getToken(ExasolParser.DOT, i);
    	}
    }
    public schemaName(): SchemaNameContext | null {
        return this.getRuleContext(0, SchemaNameContext);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_columnRef;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterColumnRef) {
             listener.enterColumnRef(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitColumnRef) {
             listener.exitColumnRef(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitColumnRef) {
            return visitor.visitColumnRef(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class SchemaNameContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public identifier(): IdentifierContext {
        return this.getRuleContext(0, IdentifierContext)!;
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_schemaName;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterSchemaName) {
             listener.enterSchemaName(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitSchemaName) {
             listener.exitSchemaName(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitSchemaName) {
            return visitor.visitSchemaName(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class TableNameContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public identifier(): IdentifierContext {
        return this.getRuleContext(0, IdentifierContext)!;
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_tableName;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterTableName) {
             listener.enterTableName(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitTableName) {
             listener.exitTableName(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitTableName) {
            return visitor.visitTableName(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class ColumnNameContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public identifier(): IdentifierContext {
        return this.getRuleContext(0, IdentifierContext)!;
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_columnName;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterColumnName) {
             listener.enterColumnName(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitColumnName) {
             listener.exitColumnName(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitColumnName) {
            return visitor.visitColumnName(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class FunctionNameContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public identifier(): IdentifierContext {
        return this.getRuleContext(0, IdentifierContext)!;
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_functionName;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterFunctionName) {
             listener.enterFunctionName(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitFunctionName) {
             listener.exitFunctionName(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitFunctionName) {
            return visitor.visitFunctionName(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class AliasContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public identifier(): IdentifierContext {
        return this.getRuleContext(0, IdentifierContext)!;
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_alias;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterAlias) {
             listener.enterAlias(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitAlias) {
             listener.exitAlias(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitAlias) {
            return visitor.visitAlias(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class IdentifierContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public IDENT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.IDENT, 0);
    }
    public QUOTED_IDENT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.QUOTED_IDENT, 0);
    }
    public YEAR(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.YEAR, 0);
    }
    public MONTH(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.MONTH, 0);
    }
    public DAY(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.DAY, 0);
    }
    public HOUR(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.HOUR, 0);
    }
    public MINUTE(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.MINUTE, 0);
    }
    public SECOND(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.SECOND, 0);
    }
    public ANY(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.ANY, 0);
    }
    public SOME(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.SOME, 0);
    }
    public MATCHED(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.MATCHED, 0);
    }
    public SETS(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.SETS, 0);
    }
    public CUBE(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.CUBE, 0);
    }
    public ROLLUP(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.ROLLUP, 0);
    }
    public GROUPING(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.GROUPING, 0);
    }
    public START(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.START, 0);
    }
    public PRIOR(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.PRIOR, 0);
    }
    public LOCAL(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.LOCAL, 0);
    }
    public FILE_KW(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.FILE_KW, 0);
    }
    public AT_KW(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.AT_KW, 0);
    }
    public CSV(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.CSV, 0);
    }
    public FBV(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.FBV, 0);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_identifier;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterIdentifier) {
             listener.enterIdentifier(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitIdentifier) {
             listener.exitIdentifier(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitIdentifier) {
            return visitor.visitIdentifier(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class LiteralContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public STRING(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.STRING, 0);
    }
    public NUMBER(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.NUMBER, 0);
    }
    public NULL_(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.NULL_, 0);
    }
    public TRUE_(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.TRUE_, 0);
    }
    public FALSE_(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.FALSE_, 0);
    }
    public PARAM(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.PARAM, 0);
    }
    public DATE(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.DATE, 0);
    }
    public TIMESTAMP(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.TIMESTAMP, 0);
    }
    public INTERVAL(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.INTERVAL, 0);
    }
    public YEAR(): antlr.TerminalNode[];
    public YEAR(i: number): antlr.TerminalNode | null;
    public YEAR(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.YEAR);
    	} else {
    		return this.getToken(ExasolParser.YEAR, i);
    	}
    }
    public MONTH(): antlr.TerminalNode[];
    public MONTH(i: number): antlr.TerminalNode | null;
    public MONTH(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.MONTH);
    	} else {
    		return this.getToken(ExasolParser.MONTH, i);
    	}
    }
    public DAY(): antlr.TerminalNode[];
    public DAY(i: number): antlr.TerminalNode | null;
    public DAY(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.DAY);
    	} else {
    		return this.getToken(ExasolParser.DAY, i);
    	}
    }
    public HOUR(): antlr.TerminalNode[];
    public HOUR(i: number): antlr.TerminalNode | null;
    public HOUR(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.HOUR);
    	} else {
    		return this.getToken(ExasolParser.HOUR, i);
    	}
    }
    public MINUTE(): antlr.TerminalNode[];
    public MINUTE(i: number): antlr.TerminalNode | null;
    public MINUTE(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.MINUTE);
    	} else {
    		return this.getToken(ExasolParser.MINUTE, i);
    	}
    }
    public SECOND(): antlr.TerminalNode[];
    public SECOND(i: number): antlr.TerminalNode | null;
    public SECOND(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.SECOND);
    	} else {
    		return this.getToken(ExasolParser.SECOND, i);
    	}
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.LPAREN, 0);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.RPAREN, 0);
    }
    public TO(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.TO, 0);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_literal;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterLiteral) {
             listener.enterLiteral(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitLiteral) {
             listener.exitLiteral(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitLiteral) {
            return visitor.visitLiteral(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}
