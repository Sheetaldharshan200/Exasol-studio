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
    public static readonly STRING = 115;
    public static readonly NUMBER = 116;
    public static readonly QUOTED_IDENT = 117;
    public static readonly IDENT = 118;
    public static readonly LPAREN = 119;
    public static readonly RPAREN = 120;
    public static readonly COMMA = 121;
    public static readonly DOT = 122;
    public static readonly SEMI = 123;
    public static readonly STAR = 124;
    public static readonly EQ = 125;
    public static readonly NEQ = 126;
    public static readonly LT = 127;
    public static readonly LTE = 128;
    public static readonly GT = 129;
    public static readonly GTE = 130;
    public static readonly PLUS = 131;
    public static readonly MINUS_OP = 132;
    public static readonly SLASH = 133;
    public static readonly CONCAT_OP = 134;
    public static readonly PARAM = 135;
    public static readonly LINE_COMMENT = 136;
    public static readonly BLOCK_COMMENT = 137;
    public static readonly WS = 138;
    public static readonly RULE_program = 0;
    public static readonly RULE_statement = 1;
    public static readonly RULE_selectStatement = 2;
    public static readonly RULE_withClause = 3;
    public static readonly RULE_cteItem = 4;
    public static readonly RULE_selectList = 5;
    public static readonly RULE_selectItem = 6;
    public static readonly RULE_fromClause = 7;
    public static readonly RULE_tableRef = 8;
    public static readonly RULE_joinClause = 9;
    public static readonly RULE_whereClause = 10;
    public static readonly RULE_groupByClause = 11;
    public static readonly RULE_havingClause = 12;
    public static readonly RULE_qualifyClause = 13;
    public static readonly RULE_orderByClause = 14;
    public static readonly RULE_orderItem = 15;
    public static readonly RULE_limitClause = 16;
    public static readonly RULE_insertStatement = 17;
    public static readonly RULE_updateStatement = 18;
    public static readonly RULE_deleteStatement = 19;
    public static readonly RULE_expression = 20;
    public static readonly RULE_predicate = 21;
    public static readonly RULE_valueExpr = 22;
    public static readonly RULE_caseExpr = 23;
    public static readonly RULE_functionCall = 24;
    public static readonly RULE_overClause = 25;
    public static readonly RULE_schemaQualifiedTable = 26;
    public static readonly RULE_columnRef = 27;
    public static readonly RULE_schemaName = 28;
    public static readonly RULE_tableName = 29;
    public static readonly RULE_columnName = 30;
    public static readonly RULE_functionName = 31;
    public static readonly RULE_alias = 32;
    public static readonly RULE_literal = 33;

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
        "'AT'", "'FILE'", "'SECURE'", null, null, null, null, "'('", "')'", 
        "','", "'.'", "';'", "'*'", "'='", null, "'<'", "'<='", "'>'", "'>='", 
        "'+'", "'-'", "'/'", "'||'"
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
        "STRING", "NUMBER", "QUOTED_IDENT", "IDENT", "LPAREN", "RPAREN", 
        "COMMA", "DOT", "SEMI", "STAR", "EQ", "NEQ", "LT", "LTE", "GT", 
        "GTE", "PLUS", "MINUS_OP", "SLASH", "CONCAT_OP", "PARAM", "LINE_COMMENT", 
        "BLOCK_COMMENT", "WS"
    ];
    public static readonly ruleNames = [
        "program", "statement", "selectStatement", "withClause", "cteItem", 
        "selectList", "selectItem", "fromClause", "tableRef", "joinClause", 
        "whereClause", "groupByClause", "havingClause", "qualifyClause", 
        "orderByClause", "orderItem", "limitClause", "insertStatement", 
        "updateStatement", "deleteStatement", "expression", "predicate", 
        "valueExpr", "caseExpr", "functionCall", "overClause", "schemaQualifiedTable", 
        "columnRef", "schemaName", "tableName", "columnName", "functionName", 
        "alias", "literal",
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
            this.state = 68;
            this.statement();
            this.state = 73;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 0, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 69;
                    this.match(ExasolParser.SEMI);
                    this.state = 70;
                    this.statement();
                    }
                    }
                }
                this.state = 75;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 0, this.context);
            }
            this.state = 77;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 123) {
                {
                this.state = 76;
                this.match(ExasolParser.SEMI);
                }
            }

            this.state = 79;
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
            this.state = 85;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ExasolParser.SELECT:
            case ExasolParser.WITH:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 81;
                this.selectStatement();
                }
                break;
            case ExasolParser.INSERT:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 82;
                this.insertStatement();
                }
                break;
            case ExasolParser.UPDATE:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 83;
                this.updateStatement();
                }
                break;
            case ExasolParser.DELETE:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 84;
                this.deleteStatement();
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
    public selectStatement(): SelectStatementContext {
        let localContext = new SelectStatementContext(this.context, this.state);
        this.enterRule(localContext, 4, ExasolParser.RULE_selectStatement);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 88;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 26) {
                {
                this.state = 87;
                this.withClause();
                }
            }

            this.state = 90;
            this.match(ExasolParser.SELECT);
            this.state = 92;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 35 || _la === 36) {
                {
                this.state = 91;
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

            this.state = 94;
            this.selectList();
            this.state = 96;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 17) {
                {
                this.state = 95;
                this.fromClause();
                }
            }

            this.state = 99;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 18) {
                {
                this.state = 98;
                this.whereClause();
                }
            }

            this.state = 102;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 19) {
                {
                this.state = 101;
                this.groupByClause();
                }
            }

            this.state = 105;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 21) {
                {
                this.state = 104;
                this.havingClause();
                }
            }

            this.state = 108;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 22) {
                {
                this.state = 107;
                this.qualifyClause();
                }
            }

            this.state = 111;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 23) {
                {
                this.state = 110;
                this.orderByClause();
                }
            }

            this.state = 114;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 24) {
                {
                this.state = 113;
                this.limitClause();
                }
            }

            this.state = 126;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (((((_la - 31)) & ~0x1F) === 0 && ((1 << (_la - 31)) & 15) !== 0)) {
                {
                this.state = 123;
                this.errorHandler.sync(this);
                switch (this.tokenStream.LA(1)) {
                case ExasolParser.UNION:
                    {
                    this.state = 116;
                    this.match(ExasolParser.UNION);
                    this.state = 118;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 35) {
                        {
                        this.state = 117;
                        this.match(ExasolParser.ALL);
                        }
                    }

                    }
                    break;
                case ExasolParser.INTERSECT:
                    {
                    this.state = 120;
                    this.match(ExasolParser.INTERSECT);
                    }
                    break;
                case ExasolParser.MINUS:
                    {
                    this.state = 121;
                    this.match(ExasolParser.MINUS);
                    }
                    break;
                case ExasolParser.EXCEPT:
                    {
                    this.state = 122;
                    this.match(ExasolParser.EXCEPT);
                    }
                    break;
                default:
                    throw new antlr.NoViableAltException(this);
                }
                this.state = 125;
                this.selectStatement();
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
    public withClause(): WithClauseContext {
        let localContext = new WithClauseContext(this.context, this.state);
        this.enterRule(localContext, 6, ExasolParser.RULE_withClause);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 128;
            this.match(ExasolParser.WITH);
            this.state = 129;
            this.cteItem();
            this.state = 134;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 121) {
                {
                {
                this.state = 130;
                this.match(ExasolParser.COMMA);
                this.state = 131;
                this.cteItem();
                }
                }
                this.state = 136;
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
        this.enterRule(localContext, 8, ExasolParser.RULE_cteItem);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 137;
            this.tableName();
            this.state = 149;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 119) {
                {
                this.state = 138;
                this.match(ExasolParser.LPAREN);
                this.state = 139;
                this.columnName();
                this.state = 144;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 121) {
                    {
                    {
                    this.state = 140;
                    this.match(ExasolParser.COMMA);
                    this.state = 141;
                    this.columnName();
                    }
                    }
                    this.state = 146;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 147;
                this.match(ExasolParser.RPAREN);
                }
            }

            this.state = 151;
            this.match(ExasolParser.AS);
            this.state = 152;
            this.match(ExasolParser.LPAREN);
            this.state = 153;
            this.selectStatement();
            this.state = 154;
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
        this.enterRule(localContext, 10, ExasolParser.RULE_selectList);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 156;
            this.selectItem();
            this.state = 161;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 121) {
                {
                {
                this.state = 157;
                this.match(ExasolParser.COMMA);
                this.state = 158;
                this.selectItem();
                }
                }
                this.state = 163;
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
    public selectItem(): SelectItemContext {
        let localContext = new SelectItemContext(this.context, this.state);
        this.enterRule(localContext, 12, ExasolParser.RULE_selectItem);
        let _la: number;
        try {
            this.state = 177;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 22, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 167;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 117 || _la === 118) {
                    {
                    this.state = 164;
                    this.tableName();
                    this.state = 165;
                    this.match(ExasolParser.DOT);
                    }
                }

                this.state = 169;
                this.match(ExasolParser.STAR);
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 170;
                this.expression(0);
                this.state = 175;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 27 || _la === 117 || _la === 118) {
                    {
                    this.state = 172;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 27) {
                        {
                        this.state = 171;
                        this.match(ExasolParser.AS);
                        }
                    }

                    this.state = 174;
                    this.alias();
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
    public fromClause(): FromClauseContext {
        let localContext = new FromClauseContext(this.context, this.state);
        this.enterRule(localContext, 14, ExasolParser.RULE_fromClause);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 179;
            this.match(ExasolParser.FROM);
            this.state = 180;
            this.tableRef();
            this.state = 185;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 121) {
                {
                {
                this.state = 181;
                this.match(ExasolParser.COMMA);
                this.state = 182;
                this.tableRef();
                }
                }
                this.state = 187;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 191;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (((((_la - 37)) & ~0x1F) === 0 && ((1 << (_la - 37)) & 95) !== 0)) {
                {
                {
                this.state = 188;
                this.joinClause();
                }
                }
                this.state = 193;
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
    public tableRef(): TableRefContext {
        let localContext = new TableRefContext(this.context, this.state);
        this.enterRule(localContext, 16, ExasolParser.RULE_tableRef);
        let _la: number;
        try {
            this.state = 210;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ExasolParser.QUOTED_IDENT:
            case ExasolParser.IDENT:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 194;
                this.schemaQualifiedTable();
                this.state = 199;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 27 || _la === 117 || _la === 118) {
                    {
                    this.state = 196;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 27) {
                        {
                        this.state = 195;
                        this.match(ExasolParser.AS);
                        }
                    }

                    this.state = 198;
                    this.alias();
                    }
                }

                }
                break;
            case ExasolParser.LPAREN:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 201;
                this.match(ExasolParser.LPAREN);
                this.state = 202;
                this.selectStatement();
                this.state = 203;
                this.match(ExasolParser.RPAREN);
                this.state = 208;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 27 || _la === 117 || _la === 118) {
                    {
                    this.state = 205;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 27) {
                        {
                        this.state = 204;
                        this.match(ExasolParser.AS);
                        }
                    }

                    this.state = 207;
                    this.alias();
                    }
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
        this.enterRule(localContext, 18, ExasolParser.RULE_joinClause);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 226;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ExasolParser.INNER:
                {
                this.state = 212;
                this.match(ExasolParser.INNER);
                }
                break;
            case ExasolParser.LEFT:
                {
                this.state = 213;
                this.match(ExasolParser.LEFT);
                this.state = 215;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 42) {
                    {
                    this.state = 214;
                    this.match(ExasolParser.OUTER);
                    }
                }

                }
                break;
            case ExasolParser.RIGHT:
                {
                this.state = 217;
                this.match(ExasolParser.RIGHT);
                this.state = 219;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 42) {
                    {
                    this.state = 218;
                    this.match(ExasolParser.OUTER);
                    }
                }

                }
                break;
            case ExasolParser.FULL:
                {
                this.state = 221;
                this.match(ExasolParser.FULL);
                this.state = 223;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 42) {
                    {
                    this.state = 222;
                    this.match(ExasolParser.OUTER);
                    }
                }

                }
                break;
            case ExasolParser.CROSS:
                {
                this.state = 225;
                this.match(ExasolParser.CROSS);
                }
                break;
            case ExasolParser.JOIN:
                break;
            default:
                break;
            }
            this.state = 228;
            this.match(ExasolParser.JOIN);
            this.state = 229;
            this.tableRef();
            this.state = 244;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ExasolParser.ON:
                {
                this.state = 230;
                this.match(ExasolParser.ON);
                this.state = 231;
                this.expression(0);
                }
                break;
            case ExasolParser.USING:
                {
                this.state = 232;
                this.match(ExasolParser.USING);
                this.state = 233;
                this.match(ExasolParser.LPAREN);
                this.state = 234;
                this.columnName();
                this.state = 239;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 121) {
                    {
                    {
                    this.state = 235;
                    this.match(ExasolParser.COMMA);
                    this.state = 236;
                    this.columnName();
                    }
                    }
                    this.state = 241;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 242;
                this.match(ExasolParser.RPAREN);
                }
                break;
            case ExasolParser.EOF:
            case ExasolParser.WHERE:
            case ExasolParser.GROUP:
            case ExasolParser.HAVING:
            case ExasolParser.QUALIFY:
            case ExasolParser.ORDER:
            case ExasolParser.LIMIT:
            case ExasolParser.UNION:
            case ExasolParser.INTERSECT:
            case ExasolParser.MINUS:
            case ExasolParser.EXCEPT:
            case ExasolParser.JOIN:
            case ExasolParser.INNER:
            case ExasolParser.LEFT:
            case ExasolParser.RIGHT:
            case ExasolParser.FULL:
            case ExasolParser.CROSS:
            case ExasolParser.RPAREN:
            case ExasolParser.SEMI:
                break;
            default:
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
        this.enterRule(localContext, 20, ExasolParser.RULE_whereClause);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 246;
            this.match(ExasolParser.WHERE);
            this.state = 247;
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
    public groupByClause(): GroupByClauseContext {
        let localContext = new GroupByClauseContext(this.context, this.state);
        this.enterRule(localContext, 22, ExasolParser.RULE_groupByClause);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 249;
            this.match(ExasolParser.GROUP);
            this.state = 250;
            this.match(ExasolParser.BY);
            this.state = 251;
            this.expression(0);
            this.state = 256;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 121) {
                {
                {
                this.state = 252;
                this.match(ExasolParser.COMMA);
                this.state = 253;
                this.expression(0);
                }
                }
                this.state = 258;
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
    public havingClause(): HavingClauseContext {
        let localContext = new HavingClauseContext(this.context, this.state);
        this.enterRule(localContext, 24, ExasolParser.RULE_havingClause);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 259;
            this.match(ExasolParser.HAVING);
            this.state = 260;
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
        this.enterRule(localContext, 26, ExasolParser.RULE_qualifyClause);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 262;
            this.match(ExasolParser.QUALIFY);
            this.state = 263;
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
        this.enterRule(localContext, 28, ExasolParser.RULE_orderByClause);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 265;
            this.match(ExasolParser.ORDER);
            this.state = 266;
            this.match(ExasolParser.BY);
            this.state = 267;
            this.orderItem();
            this.state = 272;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 121) {
                {
                {
                this.state = 268;
                this.match(ExasolParser.COMMA);
                this.state = 269;
                this.orderItem();
                }
                }
                this.state = 274;
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
        this.enterRule(localContext, 30, ExasolParser.RULE_orderItem);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 275;
            this.expression(0);
            this.state = 277;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 76 || _la === 77) {
                {
                this.state = 276;
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

            this.state = 281;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 73) {
                {
                this.state = 279;
                this.match(ExasolParser.NULLS);
                this.state = 280;
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
        this.enterRule(localContext, 32, ExasolParser.RULE_limitClause);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 283;
            this.match(ExasolParser.LIMIT);
            this.state = 284;
            this.match(ExasolParser.NUMBER);
            this.state = 287;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 25) {
                {
                this.state = 285;
                this.match(ExasolParser.OFFSET);
                this.state = 286;
                this.match(ExasolParser.NUMBER);
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
    public insertStatement(): InsertStatementContext {
        let localContext = new InsertStatementContext(this.context, this.state);
        this.enterRule(localContext, 34, ExasolParser.RULE_insertStatement);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 289;
            this.match(ExasolParser.INSERT);
            this.state = 290;
            this.match(ExasolParser.INTO);
            this.state = 291;
            this.schemaQualifiedTable();
            this.state = 303;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 119) {
                {
                this.state = 292;
                this.match(ExasolParser.LPAREN);
                this.state = 293;
                this.columnName();
                this.state = 298;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 121) {
                    {
                    {
                    this.state = 294;
                    this.match(ExasolParser.COMMA);
                    this.state = 295;
                    this.columnName();
                    }
                    }
                    this.state = 300;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 301;
                this.match(ExasolParser.RPAREN);
                }
            }

            this.state = 318;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ExasolParser.VALUES:
                {
                this.state = 305;
                this.match(ExasolParser.VALUES);
                this.state = 306;
                this.match(ExasolParser.LPAREN);
                this.state = 307;
                this.expression(0);
                this.state = 312;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 121) {
                    {
                    {
                    this.state = 308;
                    this.match(ExasolParser.COMMA);
                    this.state = 309;
                    this.expression(0);
                    }
                    }
                    this.state = 314;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 315;
                this.match(ExasolParser.RPAREN);
                }
                break;
            case ExasolParser.SELECT:
            case ExasolParser.WITH:
                {
                this.state = 317;
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
    public updateStatement(): UpdateStatementContext {
        let localContext = new UpdateStatementContext(this.context, this.state);
        this.enterRule(localContext, 36, ExasolParser.RULE_updateStatement);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 320;
            this.match(ExasolParser.UPDATE);
            this.state = 321;
            this.schemaQualifiedTable();
            this.state = 326;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 27 || _la === 117 || _la === 118) {
                {
                this.state = 323;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 27) {
                    {
                    this.state = 322;
                    this.match(ExasolParser.AS);
                    }
                }

                this.state = 325;
                this.alias();
                }
            }

            this.state = 328;
            this.match(ExasolParser.SET);
            this.state = 329;
            this.columnName();
            this.state = 330;
            this.match(ExasolParser.EQ);
            this.state = 331;
            this.expression(0);
            this.state = 339;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 121) {
                {
                {
                this.state = 332;
                this.match(ExasolParser.COMMA);
                this.state = 333;
                this.columnName();
                this.state = 334;
                this.match(ExasolParser.EQ);
                this.state = 335;
                this.expression(0);
                }
                }
                this.state = 341;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 343;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 18) {
                {
                this.state = 342;
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
        this.enterRule(localContext, 38, ExasolParser.RULE_deleteStatement);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 345;
            this.match(ExasolParser.DELETE);
            this.state = 346;
            this.match(ExasolParser.FROM);
            this.state = 347;
            this.schemaQualifiedTable();
            this.state = 352;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 27 || _la === 117 || _la === 118) {
                {
                this.state = 349;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 27) {
                    {
                    this.state = 348;
                    this.match(ExasolParser.AS);
                    }
                }

                this.state = 351;
                this.alias();
                }
            }

            this.state = 355;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 18) {
                {
                this.state = 354;
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
        let _startState = 40;
        this.enterRecursionRule(localContext, 40, ExasolParser.RULE_expression, _p);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 361;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ExasolParser.NOT:
                {
                this.state = 358;
                this.match(ExasolParser.NOT);
                this.state = 359;
                this.expression(2);
                }
                break;
            case ExasolParser.EXISTS:
            case ExasolParser.NULL_:
            case ExasolParser.TRUE_:
            case ExasolParser.FALSE_:
            case ExasolParser.CASE:
            case ExasolParser.STRING:
            case ExasolParser.NUMBER:
            case ExasolParser.QUOTED_IDENT:
            case ExasolParser.IDENT:
            case ExasolParser.LPAREN:
            case ExasolParser.PARAM:
                {
                this.state = 360;
                this.predicate();
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
            this.context!.stop = this.tokenStream.LT(-1);
            this.state = 368;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 53, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    if (this.parseListeners != null) {
                        this.triggerExitRuleEvent();
                    }
                    previousContext = localContext;
                    {
                    {
                    localContext = new ExpressionContext(parentContext, parentState);
                    this.pushNewRecursionContext(localContext, _startState, ExasolParser.RULE_expression);
                    this.state = 363;
                    if (!(this.precpred(this.context, 3))) {
                        throw this.createFailedPredicateException("this.precpred(this.context, 3)");
                    }
                    this.state = 364;
                    _la = this.tokenStream.LA(1);
                    if(!(_la === 46 || _la === 47)) {
                    this.errorHandler.recoverInline(this);
                    }
                    else {
                        this.errorHandler.reportMatch(this);
                        this.consume();
                    }
                    this.state = 365;
                    this.expression(4);
                    }
                    }
                }
                this.state = 370;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 53, this.context);
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
        this.enterRule(localContext, 42, ExasolParser.RULE_predicate);
        let _la: number;
        try {
            this.state = 423;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 60, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 371;
                this.valueExpr(0);
                this.state = 372;
                _la = this.tokenStream.LA(1);
                if(!(((((_la - 125)) & ~0x1F) === 0 && ((1 << (_la - 125)) & 63) !== 0))) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                this.state = 373;
                this.valueExpr(0);
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 375;
                this.valueExpr(0);
                this.state = 377;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 48) {
                    {
                    this.state = 376;
                    this.match(ExasolParser.NOT);
                    }
                }

                this.state = 379;
                this.match(ExasolParser.BETWEEN);
                this.state = 380;
                this.valueExpr(0);
                this.state = 381;
                this.match(ExasolParser.AND);
                this.state = 382;
                this.valueExpr(0);
                }
                break;
            case 3:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 384;
                this.valueExpr(0);
                this.state = 386;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 48) {
                    {
                    this.state = 385;
                    this.match(ExasolParser.NOT);
                    }
                }

                this.state = 388;
                this.match(ExasolParser.IN);
                this.state = 389;
                this.match(ExasolParser.LPAREN);
                this.state = 399;
                this.errorHandler.sync(this);
                switch (this.tokenStream.LA(1)) {
                case ExasolParser.SELECT:
                case ExasolParser.WITH:
                    {
                    this.state = 390;
                    this.selectStatement();
                    }
                    break;
                case ExasolParser.NOT:
                case ExasolParser.EXISTS:
                case ExasolParser.NULL_:
                case ExasolParser.TRUE_:
                case ExasolParser.FALSE_:
                case ExasolParser.CASE:
                case ExasolParser.STRING:
                case ExasolParser.NUMBER:
                case ExasolParser.QUOTED_IDENT:
                case ExasolParser.IDENT:
                case ExasolParser.LPAREN:
                case ExasolParser.PARAM:
                    {
                    this.state = 391;
                    this.expression(0);
                    this.state = 396;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    while (_la === 121) {
                        {
                        {
                        this.state = 392;
                        this.match(ExasolParser.COMMA);
                        this.state = 393;
                        this.expression(0);
                        }
                        }
                        this.state = 398;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                    }
                    }
                    break;
                default:
                    throw new antlr.NoViableAltException(this);
                }
                this.state = 401;
                this.match(ExasolParser.RPAREN);
                }
                break;
            case 4:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 403;
                this.valueExpr(0);
                this.state = 405;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 48) {
                    {
                    this.state = 404;
                    this.match(ExasolParser.NOT);
                    }
                }

                this.state = 407;
                this.match(ExasolParser.LIKE);
                this.state = 408;
                this.valueExpr(0);
                }
                break;
            case 5:
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 410;
                this.valueExpr(0);
                this.state = 411;
                this.match(ExasolParser.IS);
                this.state = 413;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 48) {
                    {
                    this.state = 412;
                    this.match(ExasolParser.NOT);
                    }
                }

                this.state = 415;
                this.match(ExasolParser.NULL_);
                }
                break;
            case 6:
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 417;
                this.match(ExasolParser.EXISTS);
                this.state = 418;
                this.match(ExasolParser.LPAREN);
                this.state = 419;
                this.selectStatement();
                this.state = 420;
                this.match(ExasolParser.RPAREN);
                }
                break;
            case 7:
                this.enterOuterAlt(localContext, 7);
                {
                this.state = 422;
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
        let _startState = 44;
        this.enterRecursionRule(localContext, 44, ExasolParser.RULE_valueExpr, _p);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 437;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 62, this.context) ) {
            case 1:
                {
                this.state = 426;
                this.functionCall();
                }
                break;
            case 2:
                {
                this.state = 427;
                this.columnRef();
                }
                break;
            case 3:
                {
                this.state = 428;
                this.literal();
                }
                break;
            case 4:
                {
                this.state = 429;
                this.match(ExasolParser.LPAREN);
                this.state = 432;
                this.errorHandler.sync(this);
                switch (this.tokenStream.LA(1)) {
                case ExasolParser.SELECT:
                case ExasolParser.WITH:
                    {
                    this.state = 430;
                    this.selectStatement();
                    }
                    break;
                case ExasolParser.NOT:
                case ExasolParser.EXISTS:
                case ExasolParser.NULL_:
                case ExasolParser.TRUE_:
                case ExasolParser.FALSE_:
                case ExasolParser.CASE:
                case ExasolParser.STRING:
                case ExasolParser.NUMBER:
                case ExasolParser.QUOTED_IDENT:
                case ExasolParser.IDENT:
                case ExasolParser.LPAREN:
                case ExasolParser.PARAM:
                    {
                    this.state = 431;
                    this.expression(0);
                    }
                    break;
                default:
                    throw new antlr.NoViableAltException(this);
                }
                this.state = 434;
                this.match(ExasolParser.RPAREN);
                }
                break;
            case 5:
                {
                this.state = 436;
                this.caseExpr();
                }
                break;
            }
            this.context!.stop = this.tokenStream.LT(-1);
            this.state = 444;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 63, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    if (this.parseListeners != null) {
                        this.triggerExitRuleEvent();
                    }
                    previousContext = localContext;
                    {
                    {
                    localContext = new ValueExprContext(parentContext, parentState);
                    this.pushNewRecursionContext(localContext, _startState, ExasolParser.RULE_valueExpr);
                    this.state = 439;
                    if (!(this.precpred(this.context, 6))) {
                        throw this.createFailedPredicateException("this.precpred(this.context, 6)");
                    }
                    this.state = 440;
                    _la = this.tokenStream.LA(1);
                    if(!(((((_la - 124)) & ~0x1F) === 0 && ((1 << (_la - 124)) & 1921) !== 0))) {
                    this.errorHandler.recoverInline(this);
                    }
                    else {
                        this.errorHandler.reportMatch(this);
                        this.consume();
                    }
                    this.state = 441;
                    this.valueExpr(7);
                    }
                    }
                }
                this.state = 446;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 63, this.context);
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
    public caseExpr(): CaseExprContext {
        let localContext = new CaseExprContext(this.context, this.state);
        this.enterRule(localContext, 46, ExasolParser.RULE_caseExpr);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 447;
            this.match(ExasolParser.CASE);
            this.state = 449;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (((((_la - 48)) & ~0x1F) === 0 && ((1 << (_la - 48)) & 1925) !== 0) || ((((_la - 115)) & ~0x1F) === 0 && ((1 << (_la - 115)) & 1048607) !== 0)) {
                {
                this.state = 448;
                this.expression(0);
                }
            }

            this.state = 456;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            do {
                {
                {
                this.state = 451;
                this.match(ExasolParser.WHEN);
                this.state = 452;
                this.expression(0);
                this.state = 453;
                this.match(ExasolParser.THEN);
                this.state = 454;
                this.expression(0);
                }
                }
                this.state = 458;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            } while (_la === 59);
            this.state = 462;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 61) {
                {
                this.state = 460;
                this.match(ExasolParser.ELSE);
                this.state = 461;
                this.expression(0);
                }
            }

            this.state = 464;
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
    public functionCall(): FunctionCallContext {
        let localContext = new FunctionCallContext(this.context, this.state);
        this.enterRule(localContext, 48, ExasolParser.RULE_functionCall);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 466;
            this.functionName();
            this.state = 467;
            this.match(ExasolParser.LPAREN);
            this.state = 480;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ExasolParser.STAR:
                {
                this.state = 468;
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
            case ExasolParser.STRING:
            case ExasolParser.NUMBER:
            case ExasolParser.QUOTED_IDENT:
            case ExasolParser.IDENT:
            case ExasolParser.LPAREN:
            case ExasolParser.PARAM:
                {
                this.state = 470;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 36) {
                    {
                    this.state = 469;
                    this.match(ExasolParser.DISTINCT);
                    }
                }

                this.state = 472;
                this.expression(0);
                this.state = 477;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 121) {
                    {
                    {
                    this.state = 473;
                    this.match(ExasolParser.COMMA);
                    this.state = 474;
                    this.expression(0);
                    }
                    }
                    this.state = 479;
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
            this.state = 482;
            this.match(ExasolParser.RPAREN);
            this.state = 484;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 70, this.context) ) {
            case 1:
                {
                this.state = 483;
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
        this.enterRule(localContext, 50, ExasolParser.RULE_overClause);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 486;
            this.match(ExasolParser.OVER);
            this.state = 487;
            this.match(ExasolParser.LPAREN);
            this.state = 498;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 65) {
                {
                this.state = 488;
                this.match(ExasolParser.PARTITION);
                this.state = 489;
                this.match(ExasolParser.BY);
                this.state = 490;
                this.expression(0);
                this.state = 495;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 121) {
                    {
                    {
                    this.state = 491;
                    this.match(ExasolParser.COMMA);
                    this.state = 492;
                    this.expression(0);
                    }
                    }
                    this.state = 497;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                }
            }

            this.state = 501;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 23) {
                {
                this.state = 500;
                this.orderByClause();
                }
            }

            this.state = 503;
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
    public schemaQualifiedTable(): SchemaQualifiedTableContext {
        let localContext = new SchemaQualifiedTableContext(this.context, this.state);
        this.enterRule(localContext, 52, ExasolParser.RULE_schemaQualifiedTable);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 508;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 74, this.context) ) {
            case 1:
                {
                this.state = 505;
                this.schemaName();
                this.state = 506;
                this.match(ExasolParser.DOT);
                }
                break;
            }
            this.state = 510;
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
        this.enterRule(localContext, 54, ExasolParser.RULE_columnRef);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 520;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 76, this.context) ) {
            case 1:
                {
                this.state = 515;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 75, this.context) ) {
                case 1:
                    {
                    this.state = 512;
                    this.schemaName();
                    this.state = 513;
                    this.match(ExasolParser.DOT);
                    }
                    break;
                }
                this.state = 517;
                this.tableName();
                this.state = 518;
                this.match(ExasolParser.DOT);
                }
                break;
            }
            this.state = 522;
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
        this.enterRule(localContext, 56, ExasolParser.RULE_schemaName);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 524;
            _la = this.tokenStream.LA(1);
            if(!(_la === 117 || _la === 118)) {
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
    public tableName(): TableNameContext {
        let localContext = new TableNameContext(this.context, this.state);
        this.enterRule(localContext, 58, ExasolParser.RULE_tableName);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 526;
            _la = this.tokenStream.LA(1);
            if(!(_la === 117 || _la === 118)) {
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
    public columnName(): ColumnNameContext {
        let localContext = new ColumnNameContext(this.context, this.state);
        this.enterRule(localContext, 60, ExasolParser.RULE_columnName);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 528;
            _la = this.tokenStream.LA(1);
            if(!(_la === 117 || _la === 118)) {
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
    public functionName(): FunctionNameContext {
        let localContext = new FunctionNameContext(this.context, this.state);
        this.enterRule(localContext, 62, ExasolParser.RULE_functionName);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 530;
            _la = this.tokenStream.LA(1);
            if(!(_la === 117 || _la === 118)) {
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
    public alias(): AliasContext {
        let localContext = new AliasContext(this.context, this.state);
        this.enterRule(localContext, 64, ExasolParser.RULE_alias);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 532;
            _la = this.tokenStream.LA(1);
            if(!(_la === 117 || _la === 118)) {
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
        this.enterRule(localContext, 66, ExasolParser.RULE_literal);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 534;
            _la = this.tokenStream.LA(1);
            if(!(((((_la - 55)) & ~0x1F) === 0 && ((1 << (_la - 55)) & 7) !== 0) || ((((_la - 115)) & ~0x1F) === 0 && ((1 << (_la - 115)) & 1048579) !== 0))) {
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

    public override sempred(localContext: antlr.ParserRuleContext | null, ruleIndex: number, predIndex: number): boolean {
        switch (ruleIndex) {
        case 20:
            return this.expression_sempred(localContext as ExpressionContext, predIndex);
        case 22:
            return this.valueExpr_sempred(localContext as ValueExprContext, predIndex);
        }
        return true;
    }
    private expression_sempred(localContext: ExpressionContext | null, predIndex: number): boolean {
        switch (predIndex) {
        case 0:
            return this.precpred(this.context, 3);
        }
        return true;
    }
    private valueExpr_sempred(localContext: ValueExprContext | null, predIndex: number): boolean {
        switch (predIndex) {
        case 1:
            return this.precpred(this.context, 6);
        }
        return true;
    }

    public static readonly _serializedATN: number[] = [
        4,1,138,537,2,0,7,0,2,1,7,1,2,2,7,2,2,3,7,3,2,4,7,4,2,5,7,5,2,6,
        7,6,2,7,7,7,2,8,7,8,2,9,7,9,2,10,7,10,2,11,7,11,2,12,7,12,2,13,7,
        13,2,14,7,14,2,15,7,15,2,16,7,16,2,17,7,17,2,18,7,18,2,19,7,19,2,
        20,7,20,2,21,7,21,2,22,7,22,2,23,7,23,2,24,7,24,2,25,7,25,2,26,7,
        26,2,27,7,27,2,28,7,28,2,29,7,29,2,30,7,30,2,31,7,31,2,32,7,32,2,
        33,7,33,1,0,1,0,1,0,5,0,72,8,0,10,0,12,0,75,9,0,1,0,3,0,78,8,0,1,
        0,1,0,1,1,1,1,1,1,1,1,3,1,86,8,1,1,2,3,2,89,8,2,1,2,1,2,3,2,93,8,
        2,1,2,1,2,3,2,97,8,2,1,2,3,2,100,8,2,1,2,3,2,103,8,2,1,2,3,2,106,
        8,2,1,2,3,2,109,8,2,1,2,3,2,112,8,2,1,2,3,2,115,8,2,1,2,1,2,3,2,
        119,8,2,1,2,1,2,1,2,3,2,124,8,2,1,2,3,2,127,8,2,1,3,1,3,1,3,1,3,
        5,3,133,8,3,10,3,12,3,136,9,3,1,4,1,4,1,4,1,4,1,4,5,4,143,8,4,10,
        4,12,4,146,9,4,1,4,1,4,3,4,150,8,4,1,4,1,4,1,4,1,4,1,4,1,5,1,5,1,
        5,5,5,160,8,5,10,5,12,5,163,9,5,1,6,1,6,1,6,3,6,168,8,6,1,6,1,6,
        1,6,3,6,173,8,6,1,6,3,6,176,8,6,3,6,178,8,6,1,7,1,7,1,7,1,7,5,7,
        184,8,7,10,7,12,7,187,9,7,1,7,5,7,190,8,7,10,7,12,7,193,9,7,1,8,
        1,8,3,8,197,8,8,1,8,3,8,200,8,8,1,8,1,8,1,8,1,8,3,8,206,8,8,1,8,
        3,8,209,8,8,3,8,211,8,8,1,9,1,9,1,9,3,9,216,8,9,1,9,1,9,3,9,220,
        8,9,1,9,1,9,3,9,224,8,9,1,9,3,9,227,8,9,1,9,1,9,1,9,1,9,1,9,1,9,
        1,9,1,9,1,9,5,9,238,8,9,10,9,12,9,241,9,9,1,9,1,9,3,9,245,8,9,1,
        10,1,10,1,10,1,11,1,11,1,11,1,11,1,11,5,11,255,8,11,10,11,12,11,
        258,9,11,1,12,1,12,1,12,1,13,1,13,1,13,1,14,1,14,1,14,1,14,1,14,
        5,14,271,8,14,10,14,12,14,274,9,14,1,15,1,15,3,15,278,8,15,1,15,
        1,15,3,15,282,8,15,1,16,1,16,1,16,1,16,3,16,288,8,16,1,17,1,17,1,
        17,1,17,1,17,1,17,1,17,5,17,297,8,17,10,17,12,17,300,9,17,1,17,1,
        17,3,17,304,8,17,1,17,1,17,1,17,1,17,1,17,5,17,311,8,17,10,17,12,
        17,314,9,17,1,17,1,17,1,17,3,17,319,8,17,1,18,1,18,1,18,3,18,324,
        8,18,1,18,3,18,327,8,18,1,18,1,18,1,18,1,18,1,18,1,18,1,18,1,18,
        1,18,5,18,338,8,18,10,18,12,18,341,9,18,1,18,3,18,344,8,18,1,19,
        1,19,1,19,1,19,3,19,350,8,19,1,19,3,19,353,8,19,1,19,3,19,356,8,
        19,1,20,1,20,1,20,1,20,3,20,362,8,20,1,20,1,20,1,20,5,20,367,8,20,
        10,20,12,20,370,9,20,1,21,1,21,1,21,1,21,1,21,1,21,3,21,378,8,21,
        1,21,1,21,1,21,1,21,1,21,1,21,1,21,3,21,387,8,21,1,21,1,21,1,21,
        1,21,1,21,1,21,5,21,395,8,21,10,21,12,21,398,9,21,3,21,400,8,21,
        1,21,1,21,1,21,1,21,3,21,406,8,21,1,21,1,21,1,21,1,21,1,21,1,21,
        3,21,414,8,21,1,21,1,21,1,21,1,21,1,21,1,21,1,21,1,21,3,21,424,8,
        21,1,22,1,22,1,22,1,22,1,22,1,22,1,22,3,22,433,8,22,1,22,1,22,1,
        22,3,22,438,8,22,1,22,1,22,1,22,5,22,443,8,22,10,22,12,22,446,9,
        22,1,23,1,23,3,23,450,8,23,1,23,1,23,1,23,1,23,1,23,4,23,457,8,23,
        11,23,12,23,458,1,23,1,23,3,23,463,8,23,1,23,1,23,1,24,1,24,1,24,
        1,24,3,24,471,8,24,1,24,1,24,1,24,5,24,476,8,24,10,24,12,24,479,
        9,24,3,24,481,8,24,1,24,1,24,3,24,485,8,24,1,25,1,25,1,25,1,25,1,
        25,1,25,1,25,5,25,494,8,25,10,25,12,25,497,9,25,3,25,499,8,25,1,
        25,3,25,502,8,25,1,25,1,25,1,26,1,26,1,26,3,26,509,8,26,1,26,1,26,
        1,27,1,27,1,27,3,27,516,8,27,1,27,1,27,1,27,3,27,521,8,27,1,27,1,
        27,1,28,1,28,1,29,1,29,1,30,1,30,1,31,1,31,1,32,1,32,1,33,1,33,1,
        33,0,2,40,44,34,0,2,4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,34,
        36,38,40,42,44,46,48,50,52,54,56,58,60,62,64,66,0,8,1,0,35,36,1,
        0,76,77,1,0,74,75,1,0,46,47,1,0,125,130,2,0,124,124,131,134,1,0,
        117,118,3,0,55,57,115,116,135,135,597,0,68,1,0,0,0,2,85,1,0,0,0,
        4,88,1,0,0,0,6,128,1,0,0,0,8,137,1,0,0,0,10,156,1,0,0,0,12,177,1,
        0,0,0,14,179,1,0,0,0,16,210,1,0,0,0,18,226,1,0,0,0,20,246,1,0,0,
        0,22,249,1,0,0,0,24,259,1,0,0,0,26,262,1,0,0,0,28,265,1,0,0,0,30,
        275,1,0,0,0,32,283,1,0,0,0,34,289,1,0,0,0,36,320,1,0,0,0,38,345,
        1,0,0,0,40,361,1,0,0,0,42,423,1,0,0,0,44,437,1,0,0,0,46,447,1,0,
        0,0,48,466,1,0,0,0,50,486,1,0,0,0,52,508,1,0,0,0,54,520,1,0,0,0,
        56,524,1,0,0,0,58,526,1,0,0,0,60,528,1,0,0,0,62,530,1,0,0,0,64,532,
        1,0,0,0,66,534,1,0,0,0,68,73,3,2,1,0,69,70,5,123,0,0,70,72,3,2,1,
        0,71,69,1,0,0,0,72,75,1,0,0,0,73,71,1,0,0,0,73,74,1,0,0,0,74,77,
        1,0,0,0,75,73,1,0,0,0,76,78,5,123,0,0,77,76,1,0,0,0,77,78,1,0,0,
        0,78,79,1,0,0,0,79,80,5,0,0,1,80,1,1,0,0,0,81,86,3,4,2,0,82,86,3,
        34,17,0,83,86,3,36,18,0,84,86,3,38,19,0,85,81,1,0,0,0,85,82,1,0,
        0,0,85,83,1,0,0,0,85,84,1,0,0,0,86,3,1,0,0,0,87,89,3,6,3,0,88,87,
        1,0,0,0,88,89,1,0,0,0,89,90,1,0,0,0,90,92,5,1,0,0,91,93,7,0,0,0,
        92,91,1,0,0,0,92,93,1,0,0,0,93,94,1,0,0,0,94,96,3,10,5,0,95,97,3,
        14,7,0,96,95,1,0,0,0,96,97,1,0,0,0,97,99,1,0,0,0,98,100,3,20,10,
        0,99,98,1,0,0,0,99,100,1,0,0,0,100,102,1,0,0,0,101,103,3,22,11,0,
        102,101,1,0,0,0,102,103,1,0,0,0,103,105,1,0,0,0,104,106,3,24,12,
        0,105,104,1,0,0,0,105,106,1,0,0,0,106,108,1,0,0,0,107,109,3,26,13,
        0,108,107,1,0,0,0,108,109,1,0,0,0,109,111,1,0,0,0,110,112,3,28,14,
        0,111,110,1,0,0,0,111,112,1,0,0,0,112,114,1,0,0,0,113,115,3,32,16,
        0,114,113,1,0,0,0,114,115,1,0,0,0,115,126,1,0,0,0,116,118,5,31,0,
        0,117,119,5,35,0,0,118,117,1,0,0,0,118,119,1,0,0,0,119,124,1,0,0,
        0,120,124,5,32,0,0,121,124,5,33,0,0,122,124,5,34,0,0,123,116,1,0,
        0,0,123,120,1,0,0,0,123,121,1,0,0,0,123,122,1,0,0,0,124,125,1,0,
        0,0,125,127,3,4,2,0,126,123,1,0,0,0,126,127,1,0,0,0,127,5,1,0,0,
        0,128,129,5,26,0,0,129,134,3,8,4,0,130,131,5,121,0,0,131,133,3,8,
        4,0,132,130,1,0,0,0,133,136,1,0,0,0,134,132,1,0,0,0,134,135,1,0,
        0,0,135,7,1,0,0,0,136,134,1,0,0,0,137,149,3,58,29,0,138,139,5,119,
        0,0,139,144,3,60,30,0,140,141,5,121,0,0,141,143,3,60,30,0,142,140,
        1,0,0,0,143,146,1,0,0,0,144,142,1,0,0,0,144,145,1,0,0,0,145,147,
        1,0,0,0,146,144,1,0,0,0,147,148,5,120,0,0,148,150,1,0,0,0,149,138,
        1,0,0,0,149,150,1,0,0,0,150,151,1,0,0,0,151,152,5,27,0,0,152,153,
        5,119,0,0,153,154,3,4,2,0,154,155,5,120,0,0,155,9,1,0,0,0,156,161,
        3,12,6,0,157,158,5,121,0,0,158,160,3,12,6,0,159,157,1,0,0,0,160,
        163,1,0,0,0,161,159,1,0,0,0,161,162,1,0,0,0,162,11,1,0,0,0,163,161,
        1,0,0,0,164,165,3,58,29,0,165,166,5,122,0,0,166,168,1,0,0,0,167,
        164,1,0,0,0,167,168,1,0,0,0,168,169,1,0,0,0,169,178,5,124,0,0,170,
        175,3,40,20,0,171,173,5,27,0,0,172,171,1,0,0,0,172,173,1,0,0,0,173,
        174,1,0,0,0,174,176,3,64,32,0,175,172,1,0,0,0,175,176,1,0,0,0,176,
        178,1,0,0,0,177,167,1,0,0,0,177,170,1,0,0,0,178,13,1,0,0,0,179,180,
        5,17,0,0,180,185,3,16,8,0,181,182,5,121,0,0,182,184,3,16,8,0,183,
        181,1,0,0,0,184,187,1,0,0,0,185,183,1,0,0,0,185,186,1,0,0,0,186,
        191,1,0,0,0,187,185,1,0,0,0,188,190,3,18,9,0,189,188,1,0,0,0,190,
        193,1,0,0,0,191,189,1,0,0,0,191,192,1,0,0,0,192,15,1,0,0,0,193,191,
        1,0,0,0,194,199,3,52,26,0,195,197,5,27,0,0,196,195,1,0,0,0,196,197,
        1,0,0,0,197,198,1,0,0,0,198,200,3,64,32,0,199,196,1,0,0,0,199,200,
        1,0,0,0,200,211,1,0,0,0,201,202,5,119,0,0,202,203,3,4,2,0,203,208,
        5,120,0,0,204,206,5,27,0,0,205,204,1,0,0,0,205,206,1,0,0,0,206,207,
        1,0,0,0,207,209,3,64,32,0,208,205,1,0,0,0,208,209,1,0,0,0,209,211,
        1,0,0,0,210,194,1,0,0,0,210,201,1,0,0,0,211,17,1,0,0,0,212,227,5,
        38,0,0,213,215,5,39,0,0,214,216,5,42,0,0,215,214,1,0,0,0,215,216,
        1,0,0,0,216,227,1,0,0,0,217,219,5,40,0,0,218,220,5,42,0,0,219,218,
        1,0,0,0,219,220,1,0,0,0,220,227,1,0,0,0,221,223,5,41,0,0,222,224,
        5,42,0,0,223,222,1,0,0,0,223,224,1,0,0,0,224,227,1,0,0,0,225,227,
        5,43,0,0,226,212,1,0,0,0,226,213,1,0,0,0,226,217,1,0,0,0,226,221,
        1,0,0,0,226,225,1,0,0,0,226,227,1,0,0,0,227,228,1,0,0,0,228,229,
        5,37,0,0,229,244,3,16,8,0,230,231,5,44,0,0,231,245,3,40,20,0,232,
        233,5,45,0,0,233,234,5,119,0,0,234,239,3,60,30,0,235,236,5,121,0,
        0,236,238,3,60,30,0,237,235,1,0,0,0,238,241,1,0,0,0,239,237,1,0,
        0,0,239,240,1,0,0,0,240,242,1,0,0,0,241,239,1,0,0,0,242,243,5,120,
        0,0,243,245,1,0,0,0,244,230,1,0,0,0,244,232,1,0,0,0,244,245,1,0,
        0,0,245,19,1,0,0,0,246,247,5,18,0,0,247,248,3,40,20,0,248,21,1,0,
        0,0,249,250,5,19,0,0,250,251,5,20,0,0,251,256,3,40,20,0,252,253,
        5,121,0,0,253,255,3,40,20,0,254,252,1,0,0,0,255,258,1,0,0,0,256,
        254,1,0,0,0,256,257,1,0,0,0,257,23,1,0,0,0,258,256,1,0,0,0,259,260,
        5,21,0,0,260,261,3,40,20,0,261,25,1,0,0,0,262,263,5,22,0,0,263,264,
        3,40,20,0,264,27,1,0,0,0,265,266,5,23,0,0,266,267,5,20,0,0,267,272,
        3,30,15,0,268,269,5,121,0,0,269,271,3,30,15,0,270,268,1,0,0,0,271,
        274,1,0,0,0,272,270,1,0,0,0,272,273,1,0,0,0,273,29,1,0,0,0,274,272,
        1,0,0,0,275,277,3,40,20,0,276,278,7,1,0,0,277,276,1,0,0,0,277,278,
        1,0,0,0,278,281,1,0,0,0,279,280,5,73,0,0,280,282,7,2,0,0,281,279,
        1,0,0,0,281,282,1,0,0,0,282,31,1,0,0,0,283,284,5,24,0,0,284,287,
        5,116,0,0,285,286,5,25,0,0,286,288,5,116,0,0,287,285,1,0,0,0,287,
        288,1,0,0,0,288,33,1,0,0,0,289,290,5,2,0,0,290,291,5,28,0,0,291,
        303,3,52,26,0,292,293,5,119,0,0,293,298,3,60,30,0,294,295,5,121,
        0,0,295,297,3,60,30,0,296,294,1,0,0,0,297,300,1,0,0,0,298,296,1,
        0,0,0,298,299,1,0,0,0,299,301,1,0,0,0,300,298,1,0,0,0,301,302,5,
        120,0,0,302,304,1,0,0,0,303,292,1,0,0,0,303,304,1,0,0,0,304,318,
        1,0,0,0,305,306,5,29,0,0,306,307,5,119,0,0,307,312,3,40,20,0,308,
        309,5,121,0,0,309,311,3,40,20,0,310,308,1,0,0,0,311,314,1,0,0,0,
        312,310,1,0,0,0,312,313,1,0,0,0,313,315,1,0,0,0,314,312,1,0,0,0,
        315,316,5,120,0,0,316,319,1,0,0,0,317,319,3,4,2,0,318,305,1,0,0,
        0,318,317,1,0,0,0,319,35,1,0,0,0,320,321,5,3,0,0,321,326,3,52,26,
        0,322,324,5,27,0,0,323,322,1,0,0,0,323,324,1,0,0,0,324,325,1,0,0,
        0,325,327,3,64,32,0,326,323,1,0,0,0,326,327,1,0,0,0,327,328,1,0,
        0,0,328,329,5,30,0,0,329,330,3,60,30,0,330,331,5,125,0,0,331,339,
        3,40,20,0,332,333,5,121,0,0,333,334,3,60,30,0,334,335,5,125,0,0,
        335,336,3,40,20,0,336,338,1,0,0,0,337,332,1,0,0,0,338,341,1,0,0,
        0,339,337,1,0,0,0,339,340,1,0,0,0,340,343,1,0,0,0,341,339,1,0,0,
        0,342,344,3,20,10,0,343,342,1,0,0,0,343,344,1,0,0,0,344,37,1,0,0,
        0,345,346,5,4,0,0,346,347,5,17,0,0,347,352,3,52,26,0,348,350,5,27,
        0,0,349,348,1,0,0,0,349,350,1,0,0,0,350,351,1,0,0,0,351,353,3,64,
        32,0,352,349,1,0,0,0,352,353,1,0,0,0,353,355,1,0,0,0,354,356,3,20,
        10,0,355,354,1,0,0,0,355,356,1,0,0,0,356,39,1,0,0,0,357,358,6,20,
        -1,0,358,359,5,48,0,0,359,362,3,40,20,2,360,362,3,42,21,0,361,357,
        1,0,0,0,361,360,1,0,0,0,362,368,1,0,0,0,363,364,10,3,0,0,364,365,
        7,3,0,0,365,367,3,40,20,4,366,363,1,0,0,0,367,370,1,0,0,0,368,366,
        1,0,0,0,368,369,1,0,0,0,369,41,1,0,0,0,370,368,1,0,0,0,371,372,3,
        44,22,0,372,373,7,4,0,0,373,374,3,44,22,0,374,424,1,0,0,0,375,377,
        3,44,22,0,376,378,5,48,0,0,377,376,1,0,0,0,377,378,1,0,0,0,378,379,
        1,0,0,0,379,380,5,51,0,0,380,381,3,44,22,0,381,382,5,46,0,0,382,
        383,3,44,22,0,383,424,1,0,0,0,384,386,3,44,22,0,385,387,5,48,0,0,
        386,385,1,0,0,0,386,387,1,0,0,0,387,388,1,0,0,0,388,389,5,49,0,0,
        389,399,5,119,0,0,390,400,3,4,2,0,391,396,3,40,20,0,392,393,5,121,
        0,0,393,395,3,40,20,0,394,392,1,0,0,0,395,398,1,0,0,0,396,394,1,
        0,0,0,396,397,1,0,0,0,397,400,1,0,0,0,398,396,1,0,0,0,399,390,1,
        0,0,0,399,391,1,0,0,0,400,401,1,0,0,0,401,402,5,120,0,0,402,424,
        1,0,0,0,403,405,3,44,22,0,404,406,5,48,0,0,405,404,1,0,0,0,405,406,
        1,0,0,0,406,407,1,0,0,0,407,408,5,52,0,0,408,409,3,44,22,0,409,424,
        1,0,0,0,410,411,3,44,22,0,411,413,5,54,0,0,412,414,5,48,0,0,413,
        412,1,0,0,0,413,414,1,0,0,0,414,415,1,0,0,0,415,416,5,55,0,0,416,
        424,1,0,0,0,417,418,5,50,0,0,418,419,5,119,0,0,419,420,3,4,2,0,420,
        421,5,120,0,0,421,424,1,0,0,0,422,424,3,44,22,0,423,371,1,0,0,0,
        423,375,1,0,0,0,423,384,1,0,0,0,423,403,1,0,0,0,423,410,1,0,0,0,
        423,417,1,0,0,0,423,422,1,0,0,0,424,43,1,0,0,0,425,426,6,22,-1,0,
        426,438,3,48,24,0,427,438,3,54,27,0,428,438,3,66,33,0,429,432,5,
        119,0,0,430,433,3,4,2,0,431,433,3,40,20,0,432,430,1,0,0,0,432,431,
        1,0,0,0,433,434,1,0,0,0,434,435,5,120,0,0,435,438,1,0,0,0,436,438,
        3,46,23,0,437,425,1,0,0,0,437,427,1,0,0,0,437,428,1,0,0,0,437,429,
        1,0,0,0,437,436,1,0,0,0,438,444,1,0,0,0,439,440,10,6,0,0,440,441,
        7,5,0,0,441,443,3,44,22,7,442,439,1,0,0,0,443,446,1,0,0,0,444,442,
        1,0,0,0,444,445,1,0,0,0,445,45,1,0,0,0,446,444,1,0,0,0,447,449,5,
        58,0,0,448,450,3,40,20,0,449,448,1,0,0,0,449,450,1,0,0,0,450,456,
        1,0,0,0,451,452,5,59,0,0,452,453,3,40,20,0,453,454,5,60,0,0,454,
        455,3,40,20,0,455,457,1,0,0,0,456,451,1,0,0,0,457,458,1,0,0,0,458,
        456,1,0,0,0,458,459,1,0,0,0,459,462,1,0,0,0,460,461,5,61,0,0,461,
        463,3,40,20,0,462,460,1,0,0,0,462,463,1,0,0,0,463,464,1,0,0,0,464,
        465,5,62,0,0,465,47,1,0,0,0,466,467,3,62,31,0,467,480,5,119,0,0,
        468,481,5,124,0,0,469,471,5,36,0,0,470,469,1,0,0,0,470,471,1,0,0,
        0,471,472,1,0,0,0,472,477,3,40,20,0,473,474,5,121,0,0,474,476,3,
        40,20,0,475,473,1,0,0,0,476,479,1,0,0,0,477,475,1,0,0,0,477,478,
        1,0,0,0,478,481,1,0,0,0,479,477,1,0,0,0,480,468,1,0,0,0,480,470,
        1,0,0,0,480,481,1,0,0,0,481,482,1,0,0,0,482,484,5,120,0,0,483,485,
        3,50,25,0,484,483,1,0,0,0,484,485,1,0,0,0,485,49,1,0,0,0,486,487,
        5,64,0,0,487,498,5,119,0,0,488,489,5,65,0,0,489,490,5,20,0,0,490,
        495,3,40,20,0,491,492,5,121,0,0,492,494,3,40,20,0,493,491,1,0,0,
        0,494,497,1,0,0,0,495,493,1,0,0,0,495,496,1,0,0,0,496,499,1,0,0,
        0,497,495,1,0,0,0,498,488,1,0,0,0,498,499,1,0,0,0,499,501,1,0,0,
        0,500,502,3,28,14,0,501,500,1,0,0,0,501,502,1,0,0,0,502,503,1,0,
        0,0,503,504,5,120,0,0,504,51,1,0,0,0,505,506,3,56,28,0,506,507,5,
        122,0,0,507,509,1,0,0,0,508,505,1,0,0,0,508,509,1,0,0,0,509,510,
        1,0,0,0,510,511,3,58,29,0,511,53,1,0,0,0,512,513,3,56,28,0,513,514,
        5,122,0,0,514,516,1,0,0,0,515,512,1,0,0,0,515,516,1,0,0,0,516,517,
        1,0,0,0,517,518,3,58,29,0,518,519,5,122,0,0,519,521,1,0,0,0,520,
        515,1,0,0,0,520,521,1,0,0,0,521,522,1,0,0,0,522,523,3,60,30,0,523,
        55,1,0,0,0,524,525,7,6,0,0,525,57,1,0,0,0,526,527,7,6,0,0,527,59,
        1,0,0,0,528,529,7,6,0,0,529,61,1,0,0,0,530,531,7,6,0,0,531,63,1,
        0,0,0,532,533,7,6,0,0,533,65,1,0,0,0,534,535,7,7,0,0,535,67,1,0,
        0,0,77,73,77,85,88,92,96,99,102,105,108,111,114,118,123,126,134,
        144,149,161,167,172,175,177,185,191,196,199,205,208,210,215,219,
        223,226,239,244,256,272,277,281,287,298,303,312,318,323,326,339,
        343,349,352,355,361,368,377,386,396,399,405,413,423,432,437,444,
        449,458,462,470,477,480,484,495,498,501,508,515,520
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
    public SELECT(): antlr.TerminalNode {
        return this.getToken(ExasolParser.SELECT, 0)!;
    }
    public selectList(): SelectListContext {
        return this.getRuleContext(0, SelectListContext)!;
    }
    public withClause(): WithClauseContext | null {
        return this.getRuleContext(0, WithClauseContext);
    }
    public fromClause(): FromClauseContext | null {
        return this.getRuleContext(0, FromClauseContext);
    }
    public whereClause(): WhereClauseContext | null {
        return this.getRuleContext(0, WhereClauseContext);
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
    public orderByClause(): OrderByClauseContext | null {
        return this.getRuleContext(0, OrderByClauseContext);
    }
    public limitClause(): LimitClauseContext | null {
        return this.getRuleContext(0, LimitClauseContext);
    }
    public selectStatement(): SelectStatementContext | null {
        return this.getRuleContext(0, SelectStatementContext);
    }
    public ALL(): antlr.TerminalNode[];
    public ALL(i: number): antlr.TerminalNode | null;
    public ALL(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.ALL);
    	} else {
    		return this.getToken(ExasolParser.ALL, i);
    	}
    }
    public DISTINCT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.DISTINCT, 0);
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
    public joinClause(): JoinClauseContext[];
    public joinClause(i: number): JoinClauseContext | null;
    public joinClause(i?: number): JoinClauseContext[] | JoinClauseContext | null {
        if (i === undefined) {
            return this.getRuleContexts(JoinClauseContext);
        }

        return this.getRuleContext(i, JoinClauseContext);
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


export class JoinClauseContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public JOIN(): antlr.TerminalNode {
        return this.getToken(ExasolParser.JOIN, 0)!;
    }
    public tableRef(): TableRefContext {
        return this.getRuleContext(0, TableRefContext)!;
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
    public selectStatement(): SelectStatementContext | null {
        return this.getRuleContext(0, SelectStatementContext);
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
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.LPAREN, 0);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.RPAREN, 0);
    }
    public selectStatement(): SelectStatementContext | null {
        return this.getRuleContext(0, SelectStatementContext);
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
    public functionCall(): FunctionCallContext | null {
        return this.getRuleContext(0, FunctionCallContext);
    }
    public columnRef(): ColumnRefContext | null {
        return this.getRuleContext(0, ColumnRefContext);
    }
    public literal(): LiteralContext | null {
        return this.getRuleContext(0, LiteralContext);
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
    public caseExpr(): CaseExprContext | null {
        return this.getRuleContext(0, CaseExprContext);
    }
    public valueExpr(): ValueExprContext[];
    public valueExpr(i: number): ValueExprContext | null;
    public valueExpr(i?: number): ValueExprContext[] | ValueExprContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ValueExprContext);
        }

        return this.getRuleContext(i, ValueExprContext);
    }
    public PLUS(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.PLUS, 0);
    }
    public MINUS_OP(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.MINUS_OP, 0);
    }
    public STAR(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.STAR, 0);
    }
    public SLASH(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.SLASH, 0);
    }
    public CONCAT_OP(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.CONCAT_OP, 0);
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
    public IDENT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.IDENT, 0);
    }
    public QUOTED_IDENT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.QUOTED_IDENT, 0);
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
    public IDENT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.IDENT, 0);
    }
    public QUOTED_IDENT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.QUOTED_IDENT, 0);
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
    public IDENT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.IDENT, 0);
    }
    public QUOTED_IDENT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.QUOTED_IDENT, 0);
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
    public IDENT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.IDENT, 0);
    }
    public QUOTED_IDENT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.QUOTED_IDENT, 0);
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
    public IDENT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.IDENT, 0);
    }
    public QUOTED_IDENT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.QUOTED_IDENT, 0);
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
