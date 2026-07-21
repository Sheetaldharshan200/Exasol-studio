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
    public static readonly STATEMENT = 150;
    public static readonly ERRORS = 151;
    public static readonly REJECT_KW = 152;
    public static readonly SKIP_KW = 153;
    public static readonly ENCODING = 154;
    public static readonly STRING = 155;
    public static readonly NUMBER = 156;
    public static readonly QUOTED_IDENT = 157;
    public static readonly IDENT = 158;
    public static readonly LPAREN = 159;
    public static readonly RPAREN = 160;
    public static readonly COMMA = 161;
    public static readonly DOT = 162;
    public static readonly SEMI = 163;
    public static readonly STAR = 164;
    public static readonly EQ = 165;
    public static readonly NEQ = 166;
    public static readonly LT = 167;
    public static readonly LTE = 168;
    public static readonly GT = 169;
    public static readonly GTE = 170;
    public static readonly PLUS = 171;
    public static readonly MINUS_OP = 172;
    public static readonly SLASH = 173;
    public static readonly CONCAT_OP = 174;
    public static readonly PARAM = 175;
    public static readonly LINE_COMMENT = 176;
    public static readonly BLOCK_COMMENT = 177;
    public static readonly WS = 178;
    public static readonly SCRIPT_BODY = 179;
    public static readonly RULE_program = 0;
    public static readonly RULE_statement = 1;
    public static readonly RULE_importStatement = 2;
    public static readonly RULE_importSource = 3;
    public static readonly RULE_exportStatement = 4;
    public static readonly RULE_exportTarget = 5;
    public static readonly RULE_connectionRef = 6;
    public static readonly RULE_fileClause = 7;
    public static readonly RULE_importOption = 8;
    public static readonly RULE_errorsClause = 9;
    public static readonly RULE_scriptStatement = 10;
    public static readonly RULE_scriptLang = 11;
    public static readonly RULE_scriptParam = 12;
    public static readonly RULE_executeScriptStatement = 13;
    public static readonly RULE_createVirtualSchemaStatement = 14;
    public static readonly RULE_selectStatement = 15;
    public static readonly RULE_queryExpression = 16;
    public static readonly RULE_querySpec = 17;
    public static readonly RULE_withClause = 18;
    public static readonly RULE_cteItem = 19;
    public static readonly RULE_selectList = 20;
    public static readonly RULE_selectItem = 21;
    public static readonly RULE_fromClause = 22;
    public static readonly RULE_tableRef = 23;
    public static readonly RULE_tablePrimary = 24;
    public static readonly RULE_joinClause = 25;
    public static readonly RULE_whereClause = 26;
    public static readonly RULE_connectByClause = 27;
    public static readonly RULE_groupByClause = 28;
    public static readonly RULE_groupItem = 29;
    public static readonly RULE_havingClause = 30;
    public static readonly RULE_qualifyClause = 31;
    public static readonly RULE_orderByClause = 32;
    public static readonly RULE_orderItem = 33;
    public static readonly RULE_limitClause = 34;
    public static readonly RULE_insertStatement = 35;
    public static readonly RULE_insertValue = 36;
    public static readonly RULE_updateStatement = 37;
    public static readonly RULE_deleteStatement = 38;
    public static readonly RULE_mergeStatement = 39;
    public static readonly RULE_mergeWhen = 40;
    public static readonly RULE_truncateStatement = 41;
    public static readonly RULE_createSchemaStatement = 42;
    public static readonly RULE_createTableStatement = 43;
    public static readonly RULE_tableElement = 44;
    public static readonly RULE_dropStatement = 45;
    public static readonly RULE_dataType = 46;
    public static readonly RULE_expression = 47;
    public static readonly RULE_predicate = 48;
    public static readonly RULE_valueExpr = 49;
    public static readonly RULE_primaryExpr = 50;
    public static readonly RULE_caseExpr = 51;
    public static readonly RULE_castExpr = 52;
    public static readonly RULE_extractExpr = 53;
    public static readonly RULE_positionExpr = 54;
    public static readonly RULE_functionCall = 55;
    public static readonly RULE_overClause = 56;
    public static readonly RULE_windowFrame = 57;
    public static readonly RULE_frameBound = 58;
    public static readonly RULE_schemaQualifiedTable = 59;
    public static readonly RULE_columnRef = 60;
    public static readonly RULE_schemaName = 61;
    public static readonly RULE_tableName = 62;
    public static readonly RULE_columnName = 63;
    public static readonly RULE_functionName = 64;
    public static readonly RULE_alias = 65;
    public static readonly RULE_identifier = 66;
    public static readonly RULE_literal = 67;

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
        "'VARYING'", "'UTF8'", "'ASCII'", "'STATEMENT'", "'ERRORS'", "'REJECT'", 
        "'SKIP'", "'ENCODING'", null, null, null, null, "'('", "')'", "','", 
        "'.'", "';'", "'*'", "'='", null, "'<'", "'<='", "'>'", "'>='", 
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
        "CUBE", "ROLLUP", "GROUPING", "SETS", "CONNECT", "START", "PRIOR", 
        "NOCYCLE", "ANY", "SOME", "MATCHED", "INTERVAL", "TO", "YEAR", "MONTH", 
        "DAY", "HOUR", "MINUTE", "SECOND", "DATE", "TIMESTAMP", "EXTRACT", 
        "POSITION", "DECIMAL_T", "VARCHAR_T", "CHAR_T", "BOOLEAN_T", "DOUBLE_T", 
        "PRECISION", "GEOMETRY", "HASHTYPE", "CHARACTER", "VARYING", "UTF8", 
        "ASCII_CS", "STATEMENT", "ERRORS", "REJECT_KW", "SKIP_KW", "ENCODING", 
        "STRING", "NUMBER", "QUOTED_IDENT", "IDENT", "LPAREN", "RPAREN", 
        "COMMA", "DOT", "SEMI", "STAR", "EQ", "NEQ", "LT", "LTE", "GT", 
        "GTE", "PLUS", "MINUS_OP", "SLASH", "CONCAT_OP", "PARAM", "LINE_COMMENT", 
        "BLOCK_COMMENT", "WS", "SCRIPT_BODY"
    ];
    public static readonly ruleNames = [
        "program", "statement", "importStatement", "importSource", "exportStatement", 
        "exportTarget", "connectionRef", "fileClause", "importOption", "errorsClause", 
        "scriptStatement", "scriptLang", "scriptParam", "executeScriptStatement", 
        "createVirtualSchemaStatement", "selectStatement", "queryExpression", 
        "querySpec", "withClause", "cteItem", "selectList", "selectItem", 
        "fromClause", "tableRef", "tablePrimary", "joinClause", "whereClause", 
        "connectByClause", "groupByClause", "groupItem", "havingClause", 
        "qualifyClause", "orderByClause", "orderItem", "limitClause", "insertStatement", 
        "insertValue", "updateStatement", "deleteStatement", "mergeStatement", 
        "mergeWhen", "truncateStatement", "createSchemaStatement", "createTableStatement", 
        "tableElement", "dropStatement", "dataType", "expression", "predicate", 
        "valueExpr", "primaryExpr", "caseExpr", "castExpr", "extractExpr", 
        "positionExpr", "functionCall", "overClause", "windowFrame", "frameBound", 
        "schemaQualifiedTable", "columnRef", "schemaName", "tableName", 
        "columnName", "functionName", "alias", "identifier", "literal",
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
            this.state = 136;
            this.statement();
            this.state = 141;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 0, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 137;
                    this.match(ExasolParser.SEMI);
                    this.state = 138;
                    this.statement();
                    }
                    }
                }
                this.state = 143;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 0, this.context);
            }
            this.state = 145;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 163) {
                {
                this.state = 144;
                this.match(ExasolParser.SEMI);
                }
            }

            this.state = 147;
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
            this.state = 163;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 2, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 149;
                this.selectStatement();
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 150;
                this.insertStatement();
                }
                break;
            case 3:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 151;
                this.updateStatement();
                }
                break;
            case 4:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 152;
                this.deleteStatement();
                }
                break;
            case 5:
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 153;
                this.mergeStatement();
                }
                break;
            case 6:
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 154;
                this.truncateStatement();
                }
                break;
            case 7:
                this.enterOuterAlt(localContext, 7);
                {
                this.state = 155;
                this.createSchemaStatement();
                }
                break;
            case 8:
                this.enterOuterAlt(localContext, 8);
                {
                this.state = 156;
                this.createTableStatement();
                }
                break;
            case 9:
                this.enterOuterAlt(localContext, 9);
                {
                this.state = 157;
                this.dropStatement();
                }
                break;
            case 10:
                this.enterOuterAlt(localContext, 10);
                {
                this.state = 158;
                this.importStatement();
                }
                break;
            case 11:
                this.enterOuterAlt(localContext, 11);
                {
                this.state = 159;
                this.exportStatement();
                }
                break;
            case 12:
                this.enterOuterAlt(localContext, 12);
                {
                this.state = 160;
                this.scriptStatement();
                }
                break;
            case 13:
                this.enterOuterAlt(localContext, 13);
                {
                this.state = 161;
                this.executeScriptStatement();
                }
                break;
            case 14:
                this.enterOuterAlt(localContext, 14);
                {
                this.state = 162;
                this.createVirtualSchemaStatement();
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
    public importStatement(): ImportStatementContext {
        let localContext = new ImportStatementContext(this.context, this.state);
        this.enterRule(localContext, 4, ExasolParser.RULE_importStatement);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 165;
            this.match(ExasolParser.IMPORT);
            this.state = 166;
            this.match(ExasolParser.INTO);
            this.state = 167;
            this.schemaQualifiedTable();
            this.state = 179;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 159) {
                {
                this.state = 168;
                this.match(ExasolParser.LPAREN);
                this.state = 169;
                this.columnName();
                this.state = 174;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 161) {
                    {
                    {
                    this.state = 170;
                    this.match(ExasolParser.COMMA);
                    this.state = 171;
                    this.columnName();
                    }
                    }
                    this.state = 176;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 177;
                this.match(ExasolParser.RPAREN);
                }
            }

            this.state = 181;
            this.match(ExasolParser.FROM);
            this.state = 182;
            this.importSource();
            this.state = 186;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 72 || _la === 90 || ((((_la - 107)) & ~0x1F) === 0 && ((1 << (_la - 107)) & 132607859) !== 0) || ((((_la - 153)) & ~0x1F) === 0 && ((1 << (_la - 153)) & 51) !== 0)) {
                {
                {
                this.state = 183;
                this.importOption();
                }
                }
                this.state = 188;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 190;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 152) {
                {
                this.state = 189;
                this.errorsClause();
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
    public importSource(): ImportSourceContext {
        let localContext = new ImportSourceContext(this.context, this.state);
        this.enterRule(localContext, 6, ExasolParser.RULE_importSource);
        let _la: number;
        try {
            let alternative: number;
            this.state = 223;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ExasolParser.LOCAL:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 192;
                this.match(ExasolParser.LOCAL);
                this.state = 194;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 114) {
                    {
                    this.state = 193;
                    this.match(ExasolParser.SECURE);
                    }
                }

                this.state = 196;
                _la = this.tokenStream.LA(1);
                if(!(_la === 107 || _la === 108)) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                this.state = 198;
                this.errorHandler.sync(this);
                alternative = 1;
                do {
                    switch (alternative) {
                    case 1:
                        {
                        {
                        this.state = 197;
                        this.fileClause();
                        }
                        }
                        break;
                    default:
                        throw new antlr.NoViableAltException(this);
                    }
                    this.state = 200;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 8, this.context);
                } while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER);
                }
                break;
            case ExasolParser.CSV:
            case ExasolParser.FBV:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 202;
                _la = this.tokenStream.LA(1);
                if(!(_la === 107 || _la === 108)) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                this.state = 203;
                this.match(ExasolParser.AT_KW);
                this.state = 204;
                this.connectionRef();
                this.state = 206;
                this.errorHandler.sync(this);
                alternative = 1;
                do {
                    switch (alternative) {
                    case 1:
                        {
                        {
                        this.state = 205;
                        this.fileClause();
                        }
                        }
                        break;
                    default:
                        throw new antlr.NoViableAltException(this);
                    }
                    this.state = 208;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 9, this.context);
                } while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER);
                }
                break;
            case ExasolParser.JDBC:
            case ExasolParser.EXA:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 210;
                _la = this.tokenStream.LA(1);
                if(!(_la === 109 || _la === 110)) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                this.state = 211;
                this.match(ExasolParser.AT_KW);
                this.state = 212;
                this.connectionRef();
                this.state = 221;
                this.errorHandler.sync(this);
                switch (this.tokenStream.LA(1)) {
                case ExasolParser.TABLE:
                    {
                    this.state = 213;
                    this.match(ExasolParser.TABLE);
                    this.state = 214;
                    this.schemaQualifiedTable();
                    }
                    break;
                case ExasolParser.STATEMENT:
                    {
                    this.state = 215;
                    this.match(ExasolParser.STATEMENT);
                    this.state = 217;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    do {
                        {
                        {
                        this.state = 216;
                        this.match(ExasolParser.STRING);
                        }
                        }
                        this.state = 219;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                    } while (_la === 155);
                    }
                    break;
                default:
                    throw new antlr.NoViableAltException(this);
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
    public exportStatement(): ExportStatementContext {
        let localContext = new ExportStatementContext(this.context, this.state);
        this.enterRule(localContext, 8, ExasolParser.RULE_exportStatement);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 225;
            this.match(ExasolParser.EXPORT);
            this.state = 231;
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
                {
                this.state = 226;
                this.schemaQualifiedTable();
                }
                break;
            case ExasolParser.LPAREN:
                {
                this.state = 227;
                this.match(ExasolParser.LPAREN);
                this.state = 228;
                this.selectStatement();
                this.state = 229;
                this.match(ExasolParser.RPAREN);
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
            this.state = 233;
            this.match(ExasolParser.INTO);
            this.state = 234;
            this.exportTarget();
            this.state = 238;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 72 || _la === 90 || ((((_la - 107)) & ~0x1F) === 0 && ((1 << (_la - 107)) & 132607859) !== 0) || ((((_la - 153)) & ~0x1F) === 0 && ((1 << (_la - 153)) & 51) !== 0)) {
                {
                {
                this.state = 235;
                this.importOption();
                }
                }
                this.state = 240;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 242;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 152) {
                {
                this.state = 241;
                this.errorsClause();
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
    public exportTarget(): ExportTargetContext {
        let localContext = new ExportTargetContext(this.context, this.state);
        this.enterRule(localContext, 10, ExasolParser.RULE_exportTarget);
        let _la: number;
        try {
            let alternative: number;
            this.state = 275;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ExasolParser.LOCAL:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 244;
                this.match(ExasolParser.LOCAL);
                this.state = 246;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 114) {
                    {
                    this.state = 245;
                    this.match(ExasolParser.SECURE);
                    }
                }

                this.state = 248;
                _la = this.tokenStream.LA(1);
                if(!(_la === 107 || _la === 108)) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                this.state = 250;
                this.errorHandler.sync(this);
                alternative = 1;
                do {
                    switch (alternative) {
                    case 1:
                        {
                        {
                        this.state = 249;
                        this.fileClause();
                        }
                        }
                        break;
                    default:
                        throw new antlr.NoViableAltException(this);
                    }
                    this.state = 252;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 17, this.context);
                } while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER);
                }
                break;
            case ExasolParser.CSV:
            case ExasolParser.FBV:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 254;
                _la = this.tokenStream.LA(1);
                if(!(_la === 107 || _la === 108)) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                this.state = 255;
                this.match(ExasolParser.AT_KW);
                this.state = 256;
                this.connectionRef();
                this.state = 258;
                this.errorHandler.sync(this);
                alternative = 1;
                do {
                    switch (alternative) {
                    case 1:
                        {
                        {
                        this.state = 257;
                        this.fileClause();
                        }
                        }
                        break;
                    default:
                        throw new antlr.NoViableAltException(this);
                    }
                    this.state = 260;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 18, this.context);
                } while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER);
                }
                break;
            case ExasolParser.JDBC:
            case ExasolParser.EXA:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 262;
                _la = this.tokenStream.LA(1);
                if(!(_la === 109 || _la === 110)) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                this.state = 263;
                this.match(ExasolParser.AT_KW);
                this.state = 264;
                this.connectionRef();
                this.state = 273;
                this.errorHandler.sync(this);
                switch (this.tokenStream.LA(1)) {
                case ExasolParser.TABLE:
                    {
                    this.state = 265;
                    this.match(ExasolParser.TABLE);
                    this.state = 266;
                    this.schemaQualifiedTable();
                    }
                    break;
                case ExasolParser.STATEMENT:
                    {
                    this.state = 267;
                    this.match(ExasolParser.STATEMENT);
                    this.state = 269;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    do {
                        {
                        {
                        this.state = 268;
                        this.match(ExasolParser.STRING);
                        }
                        }
                        this.state = 271;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                    } while (_la === 155);
                    }
                    break;
                default:
                    throw new antlr.NoViableAltException(this);
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
    public connectionRef(): ConnectionRefContext {
        let localContext = new ConnectionRefContext(this.context, this.state);
        this.enterRule(localContext, 12, ExasolParser.RULE_connectionRef);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 279;
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
                {
                this.state = 277;
                this.identifier();
                }
                break;
            case ExasolParser.STRING:
                {
                this.state = 278;
                this.match(ExasolParser.STRING);
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
            this.state = 286;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 84) {
                {
                this.state = 281;
                this.match(ExasolParser.USER);
                this.state = 282;
                this.match(ExasolParser.STRING);
                this.state = 283;
                this.match(ExasolParser.IDENTIFIED);
                this.state = 284;
                this.match(ExasolParser.BY);
                this.state = 285;
                this.match(ExasolParser.STRING);
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
    public fileClause(): FileClauseContext {
        let localContext = new FileClauseContext(this.context, this.state);
        this.enterRule(localContext, 14, ExasolParser.RULE_fileClause);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 288;
            this.match(ExasolParser.FILE_KW);
            this.state = 289;
            this.match(ExasolParser.STRING);
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
    public importOption(): ImportOptionContext {
        let localContext = new ImportOptionContext(this.context, this.state);
        this.enterRule(localContext, 16, ExasolParser.RULE_importOption);
        let _la: number;
        try {
            this.state = 320;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ExasolParser.ENCODING:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 291;
                this.match(ExasolParser.ENCODING);
                this.state = 293;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 165) {
                    {
                    this.state = 292;
                    this.match(ExasolParser.EQ);
                    }
                }

                this.state = 295;
                this.match(ExasolParser.STRING);
                }
                break;
            case ExasolParser.SKIP_KW:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 296;
                this.match(ExasolParser.SKIP_KW);
                this.state = 298;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 165) {
                    {
                    this.state = 297;
                    this.match(ExasolParser.EQ);
                    }
                }

                this.state = 300;
                this.match(ExasolParser.NUMBER);
                }
                break;
            case ExasolParser.ROW:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 301;
                this.match(ExasolParser.ROW);
                this.state = 302;
                this.match(ExasolParser.IDENT);
                this.state = 304;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 165) {
                    {
                    this.state = 303;
                    this.match(ExasolParser.EQ);
                    }
                }

                this.state = 306;
                this.match(ExasolParser.STRING);
                }
                break;
            case ExasolParser.COLUMN:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 307;
                this.match(ExasolParser.COLUMN);
                this.state = 308;
                this.match(ExasolParser.IDENT);
                this.state = 310;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 165) {
                    {
                    this.state = 309;
                    this.match(ExasolParser.EQ);
                    }
                }

                this.state = 312;
                this.match(ExasolParser.STRING);
                }
                break;
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
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 313;
                this.identifier();
                this.state = 314;
                this.match(ExasolParser.EQ);
                this.state = 318;
                this.errorHandler.sync(this);
                switch (this.tokenStream.LA(1)) {
                case ExasolParser.STRING:
                    {
                    this.state = 315;
                    this.match(ExasolParser.STRING);
                    }
                    break;
                case ExasolParser.NUMBER:
                    {
                    this.state = 316;
                    this.match(ExasolParser.NUMBER);
                    }
                    break;
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
                    {
                    this.state = 317;
                    this.identifier();
                    }
                    break;
                default:
                    throw new antlr.NoViableAltException(this);
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
    public errorsClause(): ErrorsClauseContext {
        let localContext = new ErrorsClauseContext(this.context, this.state);
        this.enterRule(localContext, 18, ExasolParser.RULE_errorsClause);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 322;
            this.match(ExasolParser.REJECT_KW);
            this.state = 323;
            this.match(ExasolParser.LIMIT);
            this.state = 324;
            _la = this.tokenStream.LA(1);
            if(!(_la === 156 || _la === 158)) {
            this.errorHandler.recoverInline(this);
            }
            else {
                this.errorHandler.reportMatch(this);
                this.consume();
            }
            this.state = 326;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 151) {
                {
                this.state = 325;
                this.match(ExasolParser.ERRORS);
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
    public scriptStatement(): ScriptStatementContext {
        let localContext = new ScriptStatementContext(this.context, this.state);
        this.enterRule(localContext, 20, ExasolParser.RULE_scriptStatement);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 328;
            this.match(ExasolParser.CREATE);
            this.state = 331;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 47) {
                {
                this.state = 329;
                this.match(ExasolParser.OR);
                this.state = 330;
                this.match(ExasolParser.REPLACE);
                }
            }

            this.state = 334;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (((((_la - 87)) & ~0x1F) === 0 && ((1 << (_la - 87)) & 983041) !== 0)) {
                {
                this.state = 333;
                this.scriptLang();
                }
            }

            this.state = 337;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 30 || _la === 100) {
                {
                this.state = 336;
                _la = this.tokenStream.LA(1);
                if(!(_la === 30 || _la === 100)) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                }
            }

            this.state = 339;
            this.match(ExasolParser.SCRIPT);
            this.state = 340;
            this.schemaQualifiedTable();
            this.state = 354;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 35, this.context) ) {
            case 1:
                {
                this.state = 341;
                this.match(ExasolParser.LPAREN);
                this.state = 342;
                this.scriptParam();
                this.state = 347;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 161) {
                    {
                    {
                    this.state = 343;
                    this.match(ExasolParser.COMMA);
                    this.state = 344;
                    this.scriptParam();
                    }
                    }
                    this.state = 349;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 350;
                this.match(ExasolParser.RPAREN);
                }
                break;
            case 2:
                {
                this.state = 352;
                this.match(ExasolParser.LPAREN);
                this.state = 353;
                this.match(ExasolParser.RPAREN);
                }
                break;
            }
            this.state = 373;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ExasolParser.RETURNS:
                {
                this.state = 356;
                this.match(ExasolParser.RETURNS);
                this.state = 359;
                this.errorHandler.sync(this);
                switch (this.tokenStream.LA(1)) {
                case ExasolParser.INTERVAL:
                case ExasolParser.DATE:
                case ExasolParser.TIMESTAMP:
                case ExasolParser.DECIMAL_T:
                case ExasolParser.VARCHAR_T:
                case ExasolParser.CHAR_T:
                case ExasolParser.BOOLEAN_T:
                case ExasolParser.DOUBLE_T:
                case ExasolParser.GEOMETRY:
                case ExasolParser.HASHTYPE:
                case ExasolParser.CHARACTER:
                case ExasolParser.IDENT:
                    {
                    this.state = 357;
                    this.dataType();
                    }
                    break;
                case ExasolParser.TABLE:
                    {
                    this.state = 358;
                    this.match(ExasolParser.TABLE);
                    }
                    break;
                default:
                    throw new antlr.NoViableAltException(this);
                }
                }
                break;
            case ExasolParser.EMITS:
                {
                this.state = 361;
                this.match(ExasolParser.EMITS);
                this.state = 362;
                this.match(ExasolParser.LPAREN);
                this.state = 363;
                this.scriptParam();
                this.state = 368;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 161) {
                    {
                    {
                    this.state = 364;
                    this.match(ExasolParser.COMMA);
                    this.state = 365;
                    this.scriptParam();
                    }
                    }
                    this.state = 370;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 371;
                this.match(ExasolParser.RPAREN);
                }
                break;
            case ExasolParser.AS:
                break;
            default:
                break;
            }
            this.state = 375;
            this.match(ExasolParser.AS);
            this.state = 376;
            this.match(ExasolParser.SCRIPT_BODY);
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
    public scriptLang(): ScriptLangContext {
        let localContext = new ScriptLangContext(this.context, this.state);
        this.enterRule(localContext, 22, ExasolParser.RULE_scriptLang);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 378;
            _la = this.tokenStream.LA(1);
            if(!(((((_la - 87)) & ~0x1F) === 0 && ((1 << (_la - 87)) & 983041) !== 0))) {
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
    public scriptParam(): ScriptParamContext {
        let localContext = new ScriptParamContext(this.context, this.state);
        this.enterRule(localContext, 24, ExasolParser.RULE_scriptParam);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 380;
            this.columnName();
            this.state = 382;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (((((_la - 126)) & ~0x1F) === 0 && ((1 << (_la - 126)) & 1962753) !== 0) || _la === 158) {
                {
                this.state = 381;
                this.dataType();
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
    public executeScriptStatement(): ExecuteScriptStatementContext {
        let localContext = new ExecuteScriptStatementContext(this.context, this.state);
        this.enterRule(localContext, 26, ExasolParser.RULE_executeScriptStatement);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 384;
            this.match(ExasolParser.EXECUTE);
            this.state = 385;
            this.match(ExasolParser.SCRIPT);
            this.state = 386;
            this.schemaQualifiedTable();
            this.state = 399;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 159) {
                {
                this.state = 387;
                this.match(ExasolParser.LPAREN);
                this.state = 396;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (((((_la - 48)) & ~0x1F) === 0 && ((1 << (_la - 48)) & 34693) !== 0) || ((((_la - 107)) & ~0x1F) === 0 && ((1 << (_la - 107)) & 2146398067) !== 0) || ((((_la - 155)) & ~0x1F) === 0 && ((1 << (_la - 155)) & 1179679) !== 0)) {
                    {
                    this.state = 388;
                    this.expression(0);
                    this.state = 393;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    while (_la === 161) {
                        {
                        {
                        this.state = 389;
                        this.match(ExasolParser.COMMA);
                        this.state = 390;
                        this.expression(0);
                        }
                        }
                        this.state = 395;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                    }
                    }
                }

                this.state = 398;
                this.match(ExasolParser.RPAREN);
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
    public createVirtualSchemaStatement(): CreateVirtualSchemaStatementContext {
        let localContext = new CreateVirtualSchemaStatementContext(this.context, this.state);
        this.enterRule(localContext, 28, ExasolParser.RULE_createVirtualSchemaStatement);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 401;
            this.match(ExasolParser.CREATE);
            this.state = 402;
            this.match(ExasolParser.VIRTUAL);
            this.state = 403;
            this.match(ExasolParser.SCHEMA);
            this.state = 407;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 88) {
                {
                this.state = 404;
                this.match(ExasolParser.IF);
                this.state = 405;
                this.match(ExasolParser.NOT);
                this.state = 406;
                this.match(ExasolParser.EXISTS);
                }
            }

            this.state = 409;
            this.schemaName();
            this.state = 410;
            this.match(ExasolParser.USING);
            this.state = 411;
            this.schemaQualifiedTable();
            this.state = 421;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 26) {
                {
                this.state = 412;
                this.match(ExasolParser.WITH);
                this.state = 417;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                do {
                    {
                    {
                    this.state = 413;
                    this.identifier();
                    this.state = 414;
                    this.match(ExasolParser.EQ);
                    this.state = 415;
                    this.literal();
                    }
                    }
                    this.state = 419;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                } while (((((_la - 107)) & ~0x1F) === 0 && ((1 << (_la - 107)) & 132607859) !== 0) || _la === 157 || _la === 158);
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
    public selectStatement(): SelectStatementContext {
        let localContext = new SelectStatementContext(this.context, this.state);
        this.enterRule(localContext, 30, ExasolParser.RULE_selectStatement);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 424;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 26) {
                {
                this.state = 423;
                this.withClause();
                }
            }

            this.state = 426;
            this.queryExpression(0);
            this.state = 428;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 23) {
                {
                this.state = 427;
                this.orderByClause();
                }
            }

            this.state = 431;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 24) {
                {
                this.state = 430;
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
        let _startState = 32;
        this.enterRecursionRule(localContext, 32, ExasolParser.RULE_queryExpression, _p);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 439;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ExasolParser.SELECT:
            case ExasolParser.VALUES:
                {
                this.state = 434;
                this.querySpec();
                }
                break;
            case ExasolParser.LPAREN:
                {
                this.state = 435;
                this.match(ExasolParser.LPAREN);
                this.state = 436;
                this.selectStatement();
                this.state = 437;
                this.match(ExasolParser.RPAREN);
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
            this.context!.stop = this.tokenStream.LT(-1);
            this.state = 454;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 52, this.context);
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
                    this.state = 441;
                    if (!(this.precpred(this.context, 3))) {
                        throw this.createFailedPredicateException("this.precpred(this.context, 3)");
                    }
                    this.state = 449;
                    this.errorHandler.sync(this);
                    switch (this.tokenStream.LA(1)) {
                    case ExasolParser.UNION:
                        {
                        this.state = 442;
                        this.match(ExasolParser.UNION);
                        this.state = 444;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        if (_la === 35) {
                            {
                            this.state = 443;
                            this.match(ExasolParser.ALL);
                            }
                        }

                        }
                        break;
                    case ExasolParser.INTERSECT:
                        {
                        this.state = 446;
                        this.match(ExasolParser.INTERSECT);
                        }
                        break;
                    case ExasolParser.MINUS:
                        {
                        this.state = 447;
                        this.match(ExasolParser.MINUS);
                        }
                        break;
                    case ExasolParser.EXCEPT:
                        {
                        this.state = 448;
                        this.match(ExasolParser.EXCEPT);
                        }
                        break;
                    default:
                        throw new antlr.NoViableAltException(this);
                    }
                    this.state = 451;
                    this.queryExpression(4);
                    }
                    }
                }
                this.state = 456;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 52, this.context);
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
        this.enterRule(localContext, 34, ExasolParser.RULE_querySpec);
        let _la: number;
        try {
            let alternative: number;
            this.state = 508;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ExasolParser.SELECT:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 457;
                this.match(ExasolParser.SELECT);
                this.state = 459;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 35 || _la === 36) {
                    {
                    this.state = 458;
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

                this.state = 461;
                this.selectList();
                this.state = 463;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 54, this.context) ) {
                case 1:
                    {
                    this.state = 462;
                    this.fromClause();
                    }
                    break;
                }
                this.state = 466;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 55, this.context) ) {
                case 1:
                    {
                    this.state = 465;
                    this.whereClause();
                    }
                    break;
                }
                this.state = 469;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 56, this.context) ) {
                case 1:
                    {
                    this.state = 468;
                    this.connectByClause();
                    }
                    break;
                }
                this.state = 472;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 57, this.context) ) {
                case 1:
                    {
                    this.state = 471;
                    this.groupByClause();
                    }
                    break;
                }
                this.state = 475;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 58, this.context) ) {
                case 1:
                    {
                    this.state = 474;
                    this.havingClause();
                    }
                    break;
                }
                this.state = 478;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 59, this.context) ) {
                case 1:
                    {
                    this.state = 477;
                    this.qualifyClause();
                    }
                    break;
                }
                }
                break;
            case ExasolParser.VALUES:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 480;
                this.match(ExasolParser.VALUES);
                this.state = 481;
                this.match(ExasolParser.LPAREN);
                this.state = 482;
                this.expression(0);
                this.state = 487;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 161) {
                    {
                    {
                    this.state = 483;
                    this.match(ExasolParser.COMMA);
                    this.state = 484;
                    this.expression(0);
                    }
                    }
                    this.state = 489;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 490;
                this.match(ExasolParser.RPAREN);
                this.state = 505;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 62, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                        {
                        {
                        this.state = 491;
                        this.match(ExasolParser.COMMA);
                        this.state = 492;
                        this.match(ExasolParser.LPAREN);
                        this.state = 493;
                        this.expression(0);
                        this.state = 498;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                        while (_la === 161) {
                            {
                            {
                            this.state = 494;
                            this.match(ExasolParser.COMMA);
                            this.state = 495;
                            this.expression(0);
                            }
                            }
                            this.state = 500;
                            this.errorHandler.sync(this);
                            _la = this.tokenStream.LA(1);
                        }
                        this.state = 501;
                        this.match(ExasolParser.RPAREN);
                        }
                        }
                    }
                    this.state = 507;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 62, this.context);
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
        this.enterRule(localContext, 36, ExasolParser.RULE_withClause);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 510;
            this.match(ExasolParser.WITH);
            this.state = 511;
            this.cteItem();
            this.state = 516;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 161) {
                {
                {
                this.state = 512;
                this.match(ExasolParser.COMMA);
                this.state = 513;
                this.cteItem();
                }
                }
                this.state = 518;
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
        this.enterRule(localContext, 38, ExasolParser.RULE_cteItem);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 519;
            this.tableName();
            this.state = 531;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 159) {
                {
                this.state = 520;
                this.match(ExasolParser.LPAREN);
                this.state = 521;
                this.columnName();
                this.state = 526;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 161) {
                    {
                    {
                    this.state = 522;
                    this.match(ExasolParser.COMMA);
                    this.state = 523;
                    this.columnName();
                    }
                    }
                    this.state = 528;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 529;
                this.match(ExasolParser.RPAREN);
                }
            }

            this.state = 533;
            this.match(ExasolParser.AS);
            this.state = 534;
            this.match(ExasolParser.LPAREN);
            this.state = 535;
            this.selectStatement();
            this.state = 536;
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
        this.enterRule(localContext, 40, ExasolParser.RULE_selectList);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 538;
            this.selectItem();
            this.state = 543;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 67, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 539;
                    this.match(ExasolParser.COMMA);
                    this.state = 540;
                    this.selectItem();
                    }
                    }
                }
                this.state = 545;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 67, this.context);
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
        this.enterRule(localContext, 42, ExasolParser.RULE_selectItem);
        let _la: number;
        try {
            this.state = 559;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 71, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 549;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (((((_la - 107)) & ~0x1F) === 0 && ((1 << (_la - 107)) & 132607859) !== 0) || _la === 157 || _la === 158) {
                    {
                    this.state = 546;
                    this.tableName();
                    this.state = 547;
                    this.match(ExasolParser.DOT);
                    }
                }

                this.state = 551;
                this.match(ExasolParser.STAR);
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 552;
                this.expression(0);
                this.state = 557;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 70, this.context) ) {
                case 1:
                    {
                    this.state = 554;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 27) {
                        {
                        this.state = 553;
                        this.match(ExasolParser.AS);
                        }
                    }

                    this.state = 556;
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
        this.enterRule(localContext, 44, ExasolParser.RULE_fromClause);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 561;
            this.match(ExasolParser.FROM);
            this.state = 562;
            this.tableRef();
            this.state = 567;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 72, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 563;
                    this.match(ExasolParser.COMMA);
                    this.state = 564;
                    this.tableRef();
                    }
                    }
                }
                this.state = 569;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 72, this.context);
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
        this.enterRule(localContext, 46, ExasolParser.RULE_tableRef);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 570;
            this.tablePrimary();
            this.state = 574;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 73, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 571;
                    this.joinClause();
                    }
                    }
                }
                this.state = 576;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 73, this.context);
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
        this.enterRule(localContext, 48, ExasolParser.RULE_tablePrimary);
        let _la: number;
        try {
            this.state = 593;
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
                this.state = 577;
                this.schemaQualifiedTable();
                this.state = 582;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 75, this.context) ) {
                case 1:
                    {
                    this.state = 579;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 27) {
                        {
                        this.state = 578;
                        this.match(ExasolParser.AS);
                        }
                    }

                    this.state = 581;
                    this.alias();
                    }
                    break;
                }
                }
                break;
            case ExasolParser.LPAREN:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 584;
                this.match(ExasolParser.LPAREN);
                this.state = 585;
                this.selectStatement();
                this.state = 586;
                this.match(ExasolParser.RPAREN);
                this.state = 591;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 77, this.context) ) {
                case 1:
                    {
                    this.state = 588;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 27) {
                        {
                        this.state = 587;
                        this.match(ExasolParser.AS);
                        }
                    }

                    this.state = 590;
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
        this.enterRule(localContext, 50, ExasolParser.RULE_joinClause);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 609;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ExasolParser.INNER:
                {
                this.state = 595;
                this.match(ExasolParser.INNER);
                }
                break;
            case ExasolParser.LEFT:
                {
                this.state = 596;
                this.match(ExasolParser.LEFT);
                this.state = 598;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 42) {
                    {
                    this.state = 597;
                    this.match(ExasolParser.OUTER);
                    }
                }

                }
                break;
            case ExasolParser.RIGHT:
                {
                this.state = 600;
                this.match(ExasolParser.RIGHT);
                this.state = 602;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 42) {
                    {
                    this.state = 601;
                    this.match(ExasolParser.OUTER);
                    }
                }

                }
                break;
            case ExasolParser.FULL:
                {
                this.state = 604;
                this.match(ExasolParser.FULL);
                this.state = 606;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 42) {
                    {
                    this.state = 605;
                    this.match(ExasolParser.OUTER);
                    }
                }

                }
                break;
            case ExasolParser.CROSS:
                {
                this.state = 608;
                this.match(ExasolParser.CROSS);
                }
                break;
            case ExasolParser.JOIN:
                break;
            default:
                break;
            }
            this.state = 611;
            this.match(ExasolParser.JOIN);
            this.state = 612;
            this.tablePrimary();
            this.state = 627;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 84, this.context) ) {
            case 1:
                {
                this.state = 613;
                this.match(ExasolParser.ON);
                this.state = 614;
                this.expression(0);
                }
                break;
            case 2:
                {
                this.state = 615;
                this.match(ExasolParser.USING);
                this.state = 616;
                this.match(ExasolParser.LPAREN);
                this.state = 617;
                this.columnName();
                this.state = 622;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 161) {
                    {
                    {
                    this.state = 618;
                    this.match(ExasolParser.COMMA);
                    this.state = 619;
                    this.columnName();
                    }
                    }
                    this.state = 624;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 625;
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
        this.enterRule(localContext, 52, ExasolParser.RULE_whereClause);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 629;
            this.match(ExasolParser.WHERE);
            this.state = 630;
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
        this.enterRule(localContext, 54, ExasolParser.RULE_connectByClause);
        let _la: number;
        try {
            this.state = 653;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ExasolParser.CONNECT:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 632;
                this.match(ExasolParser.CONNECT);
                this.state = 633;
                this.match(ExasolParser.BY);
                this.state = 635;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 122) {
                    {
                    this.state = 634;
                    this.match(ExasolParser.NOCYCLE);
                    }
                }

                this.state = 637;
                this.expression(0);
                this.state = 641;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 86, this.context) ) {
                case 1:
                    {
                    this.state = 638;
                    this.match(ExasolParser.START);
                    this.state = 639;
                    this.match(ExasolParser.WITH);
                    this.state = 640;
                    this.expression(0);
                    }
                    break;
                }
                }
                break;
            case ExasolParser.START:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 643;
                this.match(ExasolParser.START);
                this.state = 644;
                this.match(ExasolParser.WITH);
                this.state = 645;
                this.expression(0);
                this.state = 646;
                this.match(ExasolParser.CONNECT);
                this.state = 647;
                this.match(ExasolParser.BY);
                this.state = 649;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 122) {
                    {
                    this.state = 648;
                    this.match(ExasolParser.NOCYCLE);
                    }
                }

                this.state = 651;
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
        this.enterRule(localContext, 56, ExasolParser.RULE_groupByClause);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 655;
            this.match(ExasolParser.GROUP);
            this.state = 656;
            this.match(ExasolParser.BY);
            this.state = 657;
            this.groupItem();
            this.state = 662;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 89, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    {
                    {
                    this.state = 658;
                    this.match(ExasolParser.COMMA);
                    this.state = 659;
                    this.groupItem();
                    }
                    }
                }
                this.state = 664;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 89, this.context);
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
        this.enterRule(localContext, 58, ExasolParser.RULE_groupItem);
        let _la: number;
        try {
            this.state = 716;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 94, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 665;
                this.match(ExasolParser.CUBE);
                this.state = 666;
                this.match(ExasolParser.LPAREN);
                this.state = 667;
                this.expression(0);
                this.state = 672;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 161) {
                    {
                    {
                    this.state = 668;
                    this.match(ExasolParser.COMMA);
                    this.state = 669;
                    this.expression(0);
                    }
                    }
                    this.state = 674;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 675;
                this.match(ExasolParser.RPAREN);
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 677;
                this.match(ExasolParser.ROLLUP);
                this.state = 678;
                this.match(ExasolParser.LPAREN);
                this.state = 679;
                this.expression(0);
                this.state = 684;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 161) {
                    {
                    {
                    this.state = 680;
                    this.match(ExasolParser.COMMA);
                    this.state = 681;
                    this.expression(0);
                    }
                    }
                    this.state = 686;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 687;
                this.match(ExasolParser.RPAREN);
                }
                break;
            case 3:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 689;
                this.match(ExasolParser.GROUPING);
                this.state = 690;
                this.match(ExasolParser.SETS);
                this.state = 691;
                this.match(ExasolParser.LPAREN);
                this.state = 692;
                this.groupItem();
                this.state = 697;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 161) {
                    {
                    {
                    this.state = 693;
                    this.match(ExasolParser.COMMA);
                    this.state = 694;
                    this.groupItem();
                    }
                    }
                    this.state = 699;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 700;
                this.match(ExasolParser.RPAREN);
                }
                break;
            case 4:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 702;
                this.match(ExasolParser.LPAREN);
                this.state = 703;
                this.match(ExasolParser.RPAREN);
                }
                break;
            case 5:
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 704;
                this.match(ExasolParser.LPAREN);
                this.state = 705;
                this.expression(0);
                this.state = 710;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 161) {
                    {
                    {
                    this.state = 706;
                    this.match(ExasolParser.COMMA);
                    this.state = 707;
                    this.expression(0);
                    }
                    }
                    this.state = 712;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 713;
                this.match(ExasolParser.RPAREN);
                }
                break;
            case 6:
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 715;
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
        this.enterRule(localContext, 60, ExasolParser.RULE_havingClause);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 718;
            this.match(ExasolParser.HAVING);
            this.state = 719;
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
        this.enterRule(localContext, 62, ExasolParser.RULE_qualifyClause);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 721;
            this.match(ExasolParser.QUALIFY);
            this.state = 722;
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
        this.enterRule(localContext, 64, ExasolParser.RULE_orderByClause);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 724;
            this.match(ExasolParser.ORDER);
            this.state = 725;
            this.match(ExasolParser.BY);
            this.state = 726;
            this.orderItem();
            this.state = 731;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 161) {
                {
                {
                this.state = 727;
                this.match(ExasolParser.COMMA);
                this.state = 728;
                this.orderItem();
                }
                }
                this.state = 733;
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
        this.enterRule(localContext, 66, ExasolParser.RULE_orderItem);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 734;
            this.expression(0);
            this.state = 736;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 76 || _la === 77) {
                {
                this.state = 735;
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

            this.state = 740;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 73) {
                {
                this.state = 738;
                this.match(ExasolParser.NULLS);
                this.state = 739;
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
        this.enterRule(localContext, 68, ExasolParser.RULE_limitClause);
        let _la: number;
        try {
            this.state = 752;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 99, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 742;
                this.match(ExasolParser.LIMIT);
                this.state = 743;
                this.match(ExasolParser.NUMBER);
                this.state = 746;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 25) {
                    {
                    this.state = 744;
                    this.match(ExasolParser.OFFSET);
                    this.state = 745;
                    this.match(ExasolParser.NUMBER);
                    }
                }

                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 748;
                this.match(ExasolParser.LIMIT);
                this.state = 749;
                this.match(ExasolParser.NUMBER);
                this.state = 750;
                this.match(ExasolParser.COMMA);
                this.state = 751;
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
        this.enterRule(localContext, 70, ExasolParser.RULE_insertStatement);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 754;
            this.match(ExasolParser.INSERT);
            this.state = 755;
            this.match(ExasolParser.INTO);
            this.state = 756;
            this.schemaQualifiedTable();
            this.state = 768;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 101, this.context) ) {
            case 1:
                {
                this.state = 757;
                this.match(ExasolParser.LPAREN);
                this.state = 758;
                this.columnName();
                this.state = 763;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 161) {
                    {
                    {
                    this.state = 759;
                    this.match(ExasolParser.COMMA);
                    this.state = 760;
                    this.columnName();
                    }
                    }
                    this.state = 765;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 766;
                this.match(ExasolParser.RPAREN);
                }
                break;
            }
            this.state = 801;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 105, this.context) ) {
            case 1:
                {
                this.state = 770;
                this.match(ExasolParser.VALUES);
                this.state = 771;
                this.match(ExasolParser.LPAREN);
                this.state = 772;
                this.insertValue();
                this.state = 777;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 161) {
                    {
                    {
                    this.state = 773;
                    this.match(ExasolParser.COMMA);
                    this.state = 774;
                    this.insertValue();
                    }
                    }
                    this.state = 779;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 780;
                this.match(ExasolParser.RPAREN);
                this.state = 795;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 161) {
                    {
                    {
                    this.state = 781;
                    this.match(ExasolParser.COMMA);
                    this.state = 782;
                    this.match(ExasolParser.LPAREN);
                    this.state = 783;
                    this.insertValue();
                    this.state = 788;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    while (_la === 161) {
                        {
                        {
                        this.state = 784;
                        this.match(ExasolParser.COMMA);
                        this.state = 785;
                        this.insertValue();
                        }
                        }
                        this.state = 790;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                    }
                    this.state = 791;
                    this.match(ExasolParser.RPAREN);
                    }
                    }
                    this.state = 797;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                }
                break;
            case 2:
                {
                this.state = 798;
                this.selectStatement();
                }
                break;
            case 3:
                {
                this.state = 799;
                this.match(ExasolParser.DEFAULT);
                this.state = 800;
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
        this.enterRule(localContext, 72, ExasolParser.RULE_insertValue);
        try {
            this.state = 805;
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
                this.state = 803;
                this.expression(0);
                }
                break;
            case ExasolParser.DEFAULT:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 804;
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
        this.enterRule(localContext, 74, ExasolParser.RULE_updateStatement);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 807;
            this.match(ExasolParser.UPDATE);
            this.state = 808;
            this.schemaQualifiedTable();
            this.state = 813;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 27 || ((((_la - 107)) & ~0x1F) === 0 && ((1 << (_la - 107)) & 132607859) !== 0) || _la === 157 || _la === 158) {
                {
                this.state = 810;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 27) {
                    {
                    this.state = 809;
                    this.match(ExasolParser.AS);
                    }
                }

                this.state = 812;
                this.alias();
                }
            }

            this.state = 815;
            this.match(ExasolParser.SET);
            this.state = 816;
            this.columnName();
            this.state = 817;
            this.match(ExasolParser.EQ);
            this.state = 818;
            this.expression(0);
            this.state = 826;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            while (_la === 161) {
                {
                {
                this.state = 819;
                this.match(ExasolParser.COMMA);
                this.state = 820;
                this.columnName();
                this.state = 821;
                this.match(ExasolParser.EQ);
                this.state = 822;
                this.expression(0);
                }
                }
                this.state = 828;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            }
            this.state = 830;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 17) {
                {
                this.state = 829;
                this.fromClause();
                }
            }

            this.state = 833;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 18) {
                {
                this.state = 832;
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
        this.enterRule(localContext, 76, ExasolParser.RULE_deleteStatement);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 835;
            this.match(ExasolParser.DELETE);
            this.state = 836;
            this.match(ExasolParser.FROM);
            this.state = 837;
            this.schemaQualifiedTable();
            this.state = 842;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 27 || ((((_la - 107)) & ~0x1F) === 0 && ((1 << (_la - 107)) & 132607859) !== 0) || _la === 157 || _la === 158) {
                {
                this.state = 839;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 27) {
                    {
                    this.state = 838;
                    this.match(ExasolParser.AS);
                    }
                }

                this.state = 841;
                this.alias();
                }
            }

            this.state = 845;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 18) {
                {
                this.state = 844;
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
        this.enterRule(localContext, 78, ExasolParser.RULE_mergeStatement);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 847;
            this.match(ExasolParser.MERGE);
            this.state = 848;
            this.match(ExasolParser.INTO);
            this.state = 849;
            this.schemaQualifiedTable();
            this.state = 854;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 27 || ((((_la - 107)) & ~0x1F) === 0 && ((1 << (_la - 107)) & 132607859) !== 0) || _la === 157 || _la === 158) {
                {
                this.state = 851;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 27) {
                    {
                    this.state = 850;
                    this.match(ExasolParser.AS);
                    }
                }

                this.state = 853;
                this.alias();
                }
            }

            this.state = 856;
            this.match(ExasolParser.USING);
            this.state = 857;
            this.tablePrimary();
            this.state = 858;
            this.match(ExasolParser.ON);
            this.state = 859;
            this.expression(0);
            this.state = 861;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            do {
                {
                {
                this.state = 860;
                this.mergeWhen();
                }
                }
                this.state = 863;
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
        this.enterRule(localContext, 80, ExasolParser.RULE_mergeWhen);
        let _la: number;
        try {
            this.state = 924;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 126, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 865;
                this.match(ExasolParser.WHEN);
                this.state = 866;
                this.match(ExasolParser.MATCHED);
                this.state = 867;
                this.match(ExasolParser.THEN);
                this.state = 890;
                this.errorHandler.sync(this);
                switch (this.tokenStream.LA(1)) {
                case ExasolParser.UPDATE:
                    {
                    this.state = 868;
                    this.match(ExasolParser.UPDATE);
                    this.state = 869;
                    this.match(ExasolParser.SET);
                    this.state = 870;
                    this.columnName();
                    this.state = 871;
                    this.match(ExasolParser.EQ);
                    this.state = 872;
                    this.expression(0);
                    this.state = 880;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    while (_la === 161) {
                        {
                        {
                        this.state = 873;
                        this.match(ExasolParser.COMMA);
                        this.state = 874;
                        this.columnName();
                        this.state = 875;
                        this.match(ExasolParser.EQ);
                        this.state = 876;
                        this.expression(0);
                        }
                        }
                        this.state = 882;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                    }
                    this.state = 884;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 18) {
                        {
                        this.state = 883;
                        this.whereClause();
                        }
                    }

                    }
                    break;
                case ExasolParser.DELETE:
                    {
                    this.state = 886;
                    this.match(ExasolParser.DELETE);
                    this.state = 888;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 18) {
                        {
                        this.state = 887;
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
                this.state = 892;
                this.match(ExasolParser.WHEN);
                this.state = 893;
                this.match(ExasolParser.NOT);
                this.state = 894;
                this.match(ExasolParser.MATCHED);
                this.state = 895;
                this.match(ExasolParser.THEN);
                this.state = 896;
                this.match(ExasolParser.INSERT);
                this.state = 908;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 159) {
                    {
                    this.state = 897;
                    this.match(ExasolParser.LPAREN);
                    this.state = 898;
                    this.columnName();
                    this.state = 903;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    while (_la === 161) {
                        {
                        {
                        this.state = 899;
                        this.match(ExasolParser.COMMA);
                        this.state = 900;
                        this.columnName();
                        }
                        }
                        this.state = 905;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                    }
                    this.state = 906;
                    this.match(ExasolParser.RPAREN);
                    }
                }

                this.state = 910;
                this.match(ExasolParser.VALUES);
                this.state = 911;
                this.match(ExasolParser.LPAREN);
                this.state = 912;
                this.insertValue();
                this.state = 917;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 161) {
                    {
                    {
                    this.state = 913;
                    this.match(ExasolParser.COMMA);
                    this.state = 914;
                    this.insertValue();
                    }
                    }
                    this.state = 919;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 920;
                this.match(ExasolParser.RPAREN);
                this.state = 922;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 18) {
                    {
                    this.state = 921;
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
        this.enterRule(localContext, 82, ExasolParser.RULE_truncateStatement);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 926;
            this.match(ExasolParser.TRUNCATE);
            this.state = 927;
            this.match(ExasolParser.TABLE);
            this.state = 928;
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
        this.enterRule(localContext, 84, ExasolParser.RULE_createSchemaStatement);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 930;
            this.match(ExasolParser.CREATE);
            this.state = 932;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 86) {
                {
                this.state = 931;
                this.match(ExasolParser.VIRTUAL);
                }
            }

            this.state = 934;
            this.match(ExasolParser.SCHEMA);
            this.state = 938;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 88) {
                {
                this.state = 935;
                this.match(ExasolParser.IF);
                this.state = 936;
                this.match(ExasolParser.NOT);
                this.state = 937;
                this.match(ExasolParser.EXISTS);
                }
            }

            this.state = 940;
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
        this.enterRule(localContext, 86, ExasolParser.RULE_createTableStatement);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 942;
            this.match(ExasolParser.CREATE);
            this.state = 945;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 47) {
                {
                this.state = 943;
                this.match(ExasolParser.OR);
                this.state = 944;
                this.match(ExasolParser.REPLACE);
                }
            }

            this.state = 947;
            this.match(ExasolParser.TABLE);
            this.state = 951;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 88) {
                {
                this.state = 948;
                this.match(ExasolParser.IF);
                this.state = 949;
                this.match(ExasolParser.NOT);
                this.state = 950;
                this.match(ExasolParser.EXISTS);
                }
            }

            this.state = 953;
            this.schemaQualifiedTable();
            this.state = 967;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ExasolParser.LPAREN:
                {
                this.state = 954;
                this.match(ExasolParser.LPAREN);
                this.state = 955;
                this.tableElement();
                this.state = 960;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 161) {
                    {
                    {
                    this.state = 956;
                    this.match(ExasolParser.COMMA);
                    this.state = 957;
                    this.tableElement();
                    }
                    }
                    this.state = 962;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 963;
                this.match(ExasolParser.RPAREN);
                }
                break;
            case ExasolParser.AS:
                {
                this.state = 965;
                this.match(ExasolParser.AS);
                this.state = 966;
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
        this.enterRule(localContext, 88, ExasolParser.RULE_tableElement);
        let _la: number;
        try {
            let alternative: number;
            this.state = 1026;
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
                this.state = 969;
                this.columnName();
                this.state = 970;
                this.dataType();
                this.state = 973;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 96) {
                    {
                    this.state = 971;
                    this.match(ExasolParser.DEFAULT);
                    this.state = 972;
                    this.expression(0);
                    }
                }

                this.state = 979;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 48 || _la === 55) {
                    {
                    this.state = 976;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 48) {
                        {
                        this.state = 975;
                        this.match(ExasolParser.NOT);
                        }
                    }

                    this.state = 978;
                    this.match(ExasolParser.NULL_);
                    }
                }

                this.state = 983;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 92) {
                    {
                    this.state = 981;
                    this.match(ExasolParser.PRIMARY);
                    this.state = 982;
                    this.match(ExasolParser.KEY);
                    }
                }

                this.state = 990;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 12) {
                    {
                    this.state = 985;
                    this.match(ExasolParser.COMMENT);
                    this.state = 987;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 54) {
                        {
                        this.state = 986;
                        this.match(ExasolParser.IS);
                        }
                    }

                    this.state = 989;
                    this.match(ExasolParser.STRING);
                    }
                }

                }
                break;
            case ExasolParser.CONSTRAINT:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 992;
                this.match(ExasolParser.CONSTRAINT);
                this.state = 994;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (((((_la - 107)) & ~0x1F) === 0 && ((1 << (_la - 107)) & 132607859) !== 0) || _la === 157 || _la === 158) {
                    {
                    this.state = 993;
                    this.alias();
                    }
                }

                this.state = 1000;
                this.errorHandler.sync(this);
                switch (this.tokenStream.LA(1)) {
                case ExasolParser.PRIMARY:
                    {
                    this.state = 996;
                    this.match(ExasolParser.PRIMARY);
                    this.state = 997;
                    this.match(ExasolParser.KEY);
                    }
                    break;
                case ExasolParser.FOREIGN:
                    {
                    this.state = 998;
                    this.match(ExasolParser.FOREIGN);
                    this.state = 999;
                    this.match(ExasolParser.KEY);
                    }
                    break;
                default:
                    throw new antlr.NoViableAltException(this);
                }
                this.state = 1002;
                this.match(ExasolParser.LPAREN);
                this.state = 1003;
                this.columnName();
                this.state = 1008;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 161) {
                    {
                    {
                    this.state = 1004;
                    this.match(ExasolParser.COMMA);
                    this.state = 1005;
                    this.columnName();
                    }
                    }
                    this.state = 1010;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                this.state = 1011;
                this.match(ExasolParser.RPAREN);
                this.state = 1014;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 95) {
                    {
                    this.state = 1012;
                    this.match(ExasolParser.REFERENCES);
                    this.state = 1013;
                    this.schemaQualifiedTable();
                    }
                }

                }
                break;
            case ExasolParser.DISTRIBUTE:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 1016;
                this.match(ExasolParser.DISTRIBUTE);
                this.state = 1017;
                this.match(ExasolParser.BY);
                this.state = 1018;
                this.columnName();
                this.state = 1023;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 143, this.context);
                while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                    if (alternative === 1) {
                        {
                        {
                        this.state = 1019;
                        this.match(ExasolParser.COMMA);
                        this.state = 1020;
                        this.columnName();
                        }
                        }
                    }
                    this.state = 1025;
                    this.errorHandler.sync(this);
                    alternative = this.interpreter.adaptivePredict(this.tokenStream, 143, this.context);
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
        this.enterRule(localContext, 90, ExasolParser.RULE_dropStatement);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1028;
            this.match(ExasolParser.DROP);
            this.state = 1029;
            _la = this.tokenStream.LA(1);
            if(!(((((_la - 78)) & ~0x1F) === 0 && ((1 << (_la - 78)) & 63) !== 0))) {
            this.errorHandler.recoverInline(this);
            }
            else {
                this.errorHandler.reportMatch(this);
                this.consume();
            }
            this.state = 1032;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 88) {
                {
                this.state = 1030;
                this.match(ExasolParser.IF);
                this.state = 1031;
                this.match(ExasolParser.EXISTS);
                }
            }

            this.state = 1034;
            this.schemaQualifiedTable();
            this.state = 1036;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 158) {
                {
                this.state = 1035;
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
        this.enterRule(localContext, 92, ExasolParser.RULE_dataType);
        let _la: number;
        try {
            this.state = 1137;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 165, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 1038;
                this.match(ExasolParser.DECIMAL_T);
                this.state = 1046;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 159) {
                    {
                    this.state = 1039;
                    this.match(ExasolParser.LPAREN);
                    this.state = 1040;
                    this.match(ExasolParser.NUMBER);
                    this.state = 1043;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 161) {
                        {
                        this.state = 1041;
                        this.match(ExasolParser.COMMA);
                        this.state = 1042;
                        this.match(ExasolParser.NUMBER);
                        }
                    }

                    this.state = 1045;
                    this.match(ExasolParser.RPAREN);
                    }
                }

                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 1048;
                this.match(ExasolParser.VARCHAR_T);
                this.state = 1049;
                this.match(ExasolParser.LPAREN);
                this.state = 1050;
                this.match(ExasolParser.NUMBER);
                this.state = 1051;
                this.match(ExasolParser.RPAREN);
                this.state = 1055;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 146) {
                    {
                    this.state = 1052;
                    this.match(ExasolParser.CHARACTER);
                    this.state = 1053;
                    this.match(ExasolParser.SET);
                    this.state = 1054;
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
                this.state = 1057;
                this.match(ExasolParser.CHAR_T);
                this.state = 1061;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 159) {
                    {
                    this.state = 1058;
                    this.match(ExasolParser.LPAREN);
                    this.state = 1059;
                    this.match(ExasolParser.NUMBER);
                    this.state = 1060;
                    this.match(ExasolParser.RPAREN);
                    }
                }

                }
                break;
            case 4:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 1063;
                this.match(ExasolParser.CHARACTER);
                this.state = 1065;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 147) {
                    {
                    this.state = 1064;
                    this.match(ExasolParser.VARYING);
                    }
                }

                this.state = 1070;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 159) {
                    {
                    this.state = 1067;
                    this.match(ExasolParser.LPAREN);
                    this.state = 1068;
                    this.match(ExasolParser.NUMBER);
                    this.state = 1069;
                    this.match(ExasolParser.RPAREN);
                    }
                }

                }
                break;
            case 5:
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 1072;
                this.match(ExasolParser.BOOLEAN_T);
                }
                break;
            case 6:
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 1073;
                this.match(ExasolParser.DOUBLE_T);
                this.state = 1075;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 143) {
                    {
                    this.state = 1074;
                    this.match(ExasolParser.PRECISION);
                    }
                }

                }
                break;
            case 7:
                this.enterOuterAlt(localContext, 7);
                {
                this.state = 1077;
                this.match(ExasolParser.DATE);
                }
                break;
            case 8:
                this.enterOuterAlt(localContext, 8);
                {
                this.state = 1078;
                this.match(ExasolParser.TIMESTAMP);
                this.state = 1087;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 26) {
                    {
                    this.state = 1079;
                    this.match(ExasolParser.WITH);
                    this.state = 1081;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 111) {
                        {
                        this.state = 1080;
                        this.match(ExasolParser.LOCAL);
                        }
                    }

                    this.state = 1083;
                    this.match(ExasolParser.IDENT);
                    this.state = 1085;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 158) {
                        {
                        this.state = 1084;
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
                this.state = 1089;
                this.match(ExasolParser.INTERVAL);
                this.state = 1090;
                this.match(ExasolParser.YEAR);
                this.state = 1094;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 159) {
                    {
                    this.state = 1091;
                    this.match(ExasolParser.LPAREN);
                    this.state = 1092;
                    this.match(ExasolParser.NUMBER);
                    this.state = 1093;
                    this.match(ExasolParser.RPAREN);
                    }
                }

                this.state = 1096;
                this.match(ExasolParser.TO);
                this.state = 1097;
                this.match(ExasolParser.MONTH);
                }
                break;
            case 10:
                this.enterOuterAlt(localContext, 10);
                {
                this.state = 1098;
                this.match(ExasolParser.INTERVAL);
                this.state = 1099;
                this.match(ExasolParser.DAY);
                this.state = 1103;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 159) {
                    {
                    this.state = 1100;
                    this.match(ExasolParser.LPAREN);
                    this.state = 1101;
                    this.match(ExasolParser.NUMBER);
                    this.state = 1102;
                    this.match(ExasolParser.RPAREN);
                    }
                }

                this.state = 1105;
                this.match(ExasolParser.TO);
                this.state = 1106;
                this.match(ExasolParser.SECOND);
                this.state = 1110;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 159) {
                    {
                    this.state = 1107;
                    this.match(ExasolParser.LPAREN);
                    this.state = 1108;
                    this.match(ExasolParser.NUMBER);
                    this.state = 1109;
                    this.match(ExasolParser.RPAREN);
                    }
                }

                }
                break;
            case 11:
                this.enterOuterAlt(localContext, 11);
                {
                this.state = 1112;
                this.match(ExasolParser.GEOMETRY);
                this.state = 1116;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 159) {
                    {
                    this.state = 1113;
                    this.match(ExasolParser.LPAREN);
                    this.state = 1114;
                    this.match(ExasolParser.NUMBER);
                    this.state = 1115;
                    this.match(ExasolParser.RPAREN);
                    }
                }

                }
                break;
            case 12:
                this.enterOuterAlt(localContext, 12);
                {
                this.state = 1118;
                this.match(ExasolParser.HASHTYPE);
                this.state = 1125;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 159) {
                    {
                    this.state = 1119;
                    this.match(ExasolParser.LPAREN);
                    this.state = 1120;
                    this.match(ExasolParser.NUMBER);
                    this.state = 1122;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 158) {
                        {
                        this.state = 1121;
                        this.match(ExasolParser.IDENT);
                        }
                    }

                    this.state = 1124;
                    this.match(ExasolParser.RPAREN);
                    }
                }

                }
                break;
            case 13:
                this.enterOuterAlt(localContext, 13);
                {
                this.state = 1127;
                this.match(ExasolParser.IDENT);
                this.state = 1135;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 159) {
                    {
                    this.state = 1128;
                    this.match(ExasolParser.LPAREN);
                    this.state = 1129;
                    this.match(ExasolParser.NUMBER);
                    this.state = 1132;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    if (_la === 161) {
                        {
                        this.state = 1130;
                        this.match(ExasolParser.COMMA);
                        this.state = 1131;
                        this.match(ExasolParser.NUMBER);
                        }
                    }

                    this.state = 1134;
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
        let _startState = 94;
        this.enterRecursionRule(localContext, 94, ExasolParser.RULE_expression, _p);
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1143;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ExasolParser.NOT:
                {
                this.state = 1140;
                this.match(ExasolParser.NOT);
                this.state = 1141;
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
                this.state = 1142;
                this.predicate();
                }
                break;
            default:
                throw new antlr.NoViableAltException(this);
            }
            this.context!.stop = this.tokenStream.LT(-1);
            this.state = 1153;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 168, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    if (this.parseListeners != null) {
                        this.triggerExitRuleEvent();
                    }
                    previousContext = localContext;
                    {
                    this.state = 1151;
                    this.errorHandler.sync(this);
                    switch (this.interpreter.adaptivePredict(this.tokenStream, 167, this.context) ) {
                    case 1:
                        {
                        localContext = new ExpressionContext(parentContext, parentState);
                        this.pushNewRecursionContext(localContext, _startState, ExasolParser.RULE_expression);
                        this.state = 1145;
                        if (!(this.precpred(this.context, 3))) {
                            throw this.createFailedPredicateException("this.precpred(this.context, 3)");
                        }
                        this.state = 1146;
                        this.match(ExasolParser.AND);
                        this.state = 1147;
                        this.expression(4);
                        }
                        break;
                    case 2:
                        {
                        localContext = new ExpressionContext(parentContext, parentState);
                        this.pushNewRecursionContext(localContext, _startState, ExasolParser.RULE_expression);
                        this.state = 1148;
                        if (!(this.precpred(this.context, 2))) {
                            throw this.createFailedPredicateException("this.precpred(this.context, 2)");
                        }
                        this.state = 1149;
                        this.match(ExasolParser.OR);
                        this.state = 1150;
                        this.expression(3);
                        }
                        break;
                    }
                    }
                }
                this.state = 1155;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 168, this.context);
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
        this.enterRule(localContext, 96, ExasolParser.RULE_predicate);
        let _la: number;
        try {
            this.state = 1216;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 177, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 1156;
                this.valueExpr(0);
                this.state = 1157;
                _la = this.tokenStream.LA(1);
                if(!(((((_la - 165)) & ~0x1F) === 0 && ((1 << (_la - 165)) & 63) !== 0))) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                this.state = 1159;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 169, this.context) ) {
                case 1:
                    {
                    this.state = 1158;
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
                this.state = 1166;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 170, this.context) ) {
                case 1:
                    {
                    this.state = 1161;
                    this.valueExpr(0);
                    }
                    break;
                case 2:
                    {
                    this.state = 1162;
                    this.match(ExasolParser.LPAREN);
                    this.state = 1163;
                    this.selectStatement();
                    this.state = 1164;
                    this.match(ExasolParser.RPAREN);
                    }
                    break;
                }
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 1168;
                this.valueExpr(0);
                this.state = 1170;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 48) {
                    {
                    this.state = 1169;
                    this.match(ExasolParser.NOT);
                    }
                }

                this.state = 1172;
                this.match(ExasolParser.BETWEEN);
                this.state = 1173;
                this.valueExpr(0);
                this.state = 1174;
                this.match(ExasolParser.AND);
                this.state = 1175;
                this.valueExpr(0);
                }
                break;
            case 3:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 1177;
                this.valueExpr(0);
                this.state = 1179;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 48) {
                    {
                    this.state = 1178;
                    this.match(ExasolParser.NOT);
                    }
                }

                this.state = 1181;
                this.match(ExasolParser.IN);
                this.state = 1182;
                this.match(ExasolParser.LPAREN);
                this.state = 1192;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 174, this.context) ) {
                case 1:
                    {
                    this.state = 1183;
                    this.selectStatement();
                    }
                    break;
                case 2:
                    {
                    this.state = 1184;
                    this.expression(0);
                    this.state = 1189;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                    while (_la === 161) {
                        {
                        {
                        this.state = 1185;
                        this.match(ExasolParser.COMMA);
                        this.state = 1186;
                        this.expression(0);
                        }
                        }
                        this.state = 1191;
                        this.errorHandler.sync(this);
                        _la = this.tokenStream.LA(1);
                    }
                    }
                    break;
                }
                this.state = 1194;
                this.match(ExasolParser.RPAREN);
                }
                break;
            case 4:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 1196;
                this.valueExpr(0);
                this.state = 1198;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 48) {
                    {
                    this.state = 1197;
                    this.match(ExasolParser.NOT);
                    }
                }

                this.state = 1200;
                _la = this.tokenStream.LA(1);
                if(!(_la === 52 || _la === 53)) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                this.state = 1201;
                this.valueExpr(0);
                }
                break;
            case 5:
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 1203;
                this.valueExpr(0);
                this.state = 1204;
                this.match(ExasolParser.IS);
                this.state = 1206;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 48) {
                    {
                    this.state = 1205;
                    this.match(ExasolParser.NOT);
                    }
                }

                this.state = 1208;
                this.match(ExasolParser.NULL_);
                }
                break;
            case 6:
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 1210;
                this.match(ExasolParser.EXISTS);
                this.state = 1211;
                this.match(ExasolParser.LPAREN);
                this.state = 1212;
                this.selectStatement();
                this.state = 1213;
                this.match(ExasolParser.RPAREN);
                }
                break;
            case 7:
                this.enterOuterAlt(localContext, 7);
                {
                this.state = 1215;
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
        let _startState = 98;
        this.enterRecursionRule(localContext, 98, ExasolParser.RULE_valueExpr, _p);
        let _la: number;
        try {
            let alternative: number;
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1224;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 178, this.context) ) {
            case 1:
                {
                this.state = 1219;
                this.match(ExasolParser.MINUS_OP);
                this.state = 1220;
                this.valueExpr(3);
                }
                break;
            case 2:
                {
                this.state = 1221;
                this.match(ExasolParser.PRIOR);
                this.state = 1222;
                this.valueExpr(2);
                }
                break;
            case 3:
                {
                this.state = 1223;
                this.primaryExpr();
                }
                break;
            }
            this.context!.stop = this.tokenStream.LT(-1);
            this.state = 1237;
            this.errorHandler.sync(this);
            alternative = this.interpreter.adaptivePredict(this.tokenStream, 180, this.context);
            while (alternative !== 2 && alternative !== antlr.ATN.INVALID_ALT_NUMBER) {
                if (alternative === 1) {
                    if (this.parseListeners != null) {
                        this.triggerExitRuleEvent();
                    }
                    previousContext = localContext;
                    {
                    this.state = 1235;
                    this.errorHandler.sync(this);
                    switch (this.interpreter.adaptivePredict(this.tokenStream, 179, this.context) ) {
                    case 1:
                        {
                        localContext = new ValueExprContext(parentContext, parentState);
                        this.pushNewRecursionContext(localContext, _startState, ExasolParser.RULE_valueExpr);
                        this.state = 1226;
                        if (!(this.precpred(this.context, 6))) {
                            throw this.createFailedPredicateException("this.precpred(this.context, 6)");
                        }
                        this.state = 1227;
                        this.match(ExasolParser.CONCAT_OP);
                        this.state = 1228;
                        this.valueExpr(7);
                        }
                        break;
                    case 2:
                        {
                        localContext = new ValueExprContext(parentContext, parentState);
                        this.pushNewRecursionContext(localContext, _startState, ExasolParser.RULE_valueExpr);
                        this.state = 1229;
                        if (!(this.precpred(this.context, 5))) {
                            throw this.createFailedPredicateException("this.precpred(this.context, 5)");
                        }
                        this.state = 1230;
                        _la = this.tokenStream.LA(1);
                        if(!(_la === 164 || _la === 173)) {
                        this.errorHandler.recoverInline(this);
                        }
                        else {
                            this.errorHandler.reportMatch(this);
                            this.consume();
                        }
                        this.state = 1231;
                        this.valueExpr(6);
                        }
                        break;
                    case 3:
                        {
                        localContext = new ValueExprContext(parentContext, parentState);
                        this.pushNewRecursionContext(localContext, _startState, ExasolParser.RULE_valueExpr);
                        this.state = 1232;
                        if (!(this.precpred(this.context, 4))) {
                            throw this.createFailedPredicateException("this.precpred(this.context, 4)");
                        }
                        this.state = 1233;
                        _la = this.tokenStream.LA(1);
                        if(!(_la === 171 || _la === 172)) {
                        this.errorHandler.recoverInline(this);
                        }
                        else {
                            this.errorHandler.reportMatch(this);
                            this.consume();
                        }
                        this.state = 1234;
                        this.valueExpr(5);
                        }
                        break;
                    }
                    }
                }
                this.state = 1239;
                this.errorHandler.sync(this);
                alternative = this.interpreter.adaptivePredict(this.tokenStream, 180, this.context);
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
        this.enterRule(localContext, 100, ExasolParser.RULE_primaryExpr);
        try {
            this.state = 1254;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 182, this.context) ) {
            case 1:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 1240;
                this.literal();
                }
                break;
            case 2:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 1241;
                this.caseExpr();
                }
                break;
            case 3:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 1242;
                this.castExpr();
                }
                break;
            case 4:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 1243;
                this.extractExpr();
                }
                break;
            case 5:
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 1244;
                this.positionExpr();
                }
                break;
            case 6:
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 1245;
                this.functionCall();
                }
                break;
            case 7:
                this.enterOuterAlt(localContext, 7);
                {
                this.state = 1246;
                this.columnRef();
                }
                break;
            case 8:
                this.enterOuterAlt(localContext, 8);
                {
                this.state = 1247;
                this.match(ExasolParser.LPAREN);
                this.state = 1250;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 181, this.context) ) {
                case 1:
                    {
                    this.state = 1248;
                    this.selectStatement();
                    }
                    break;
                case 2:
                    {
                    this.state = 1249;
                    this.expression(0);
                    }
                    break;
                }
                this.state = 1252;
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
        this.enterRule(localContext, 102, ExasolParser.RULE_caseExpr);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1256;
            this.match(ExasolParser.CASE);
            this.state = 1258;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (((((_la - 48)) & ~0x1F) === 0 && ((1 << (_la - 48)) & 34693) !== 0) || ((((_la - 107)) & ~0x1F) === 0 && ((1 << (_la - 107)) & 2146398067) !== 0) || ((((_la - 155)) & ~0x1F) === 0 && ((1 << (_la - 155)) & 1179679) !== 0)) {
                {
                this.state = 1257;
                this.expression(0);
                }
            }

            this.state = 1265;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            do {
                {
                {
                this.state = 1260;
                this.match(ExasolParser.WHEN);
                this.state = 1261;
                this.expression(0);
                this.state = 1262;
                this.match(ExasolParser.THEN);
                this.state = 1263;
                this.expression(0);
                }
                }
                this.state = 1267;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
            } while (_la === 59);
            this.state = 1271;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 61) {
                {
                this.state = 1269;
                this.match(ExasolParser.ELSE);
                this.state = 1270;
                this.expression(0);
                }
            }

            this.state = 1273;
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
        this.enterRule(localContext, 104, ExasolParser.RULE_castExpr);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1275;
            this.match(ExasolParser.CAST);
            this.state = 1276;
            this.match(ExasolParser.LPAREN);
            this.state = 1277;
            this.expression(0);
            this.state = 1278;
            this.match(ExasolParser.AS);
            this.state = 1279;
            this.dataType();
            this.state = 1280;
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
        this.enterRule(localContext, 106, ExasolParser.RULE_extractExpr);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1282;
            this.match(ExasolParser.EXTRACT);
            this.state = 1283;
            this.match(ExasolParser.LPAREN);
            this.state = 1284;
            _la = this.tokenStream.LA(1);
            if(!(((((_la - 128)) & ~0x1F) === 0 && ((1 << (_la - 128)) & 63) !== 0))) {
            this.errorHandler.recoverInline(this);
            }
            else {
                this.errorHandler.reportMatch(this);
                this.consume();
            }
            this.state = 1285;
            this.match(ExasolParser.FROM);
            this.state = 1286;
            this.expression(0);
            this.state = 1287;
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
        this.enterRule(localContext, 108, ExasolParser.RULE_positionExpr);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1289;
            this.match(ExasolParser.POSITION);
            this.state = 1290;
            this.match(ExasolParser.LPAREN);
            this.state = 1291;
            this.expression(0);
            this.state = 1292;
            this.match(ExasolParser.IN);
            this.state = 1293;
            this.expression(0);
            this.state = 1294;
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
        this.enterRule(localContext, 110, ExasolParser.RULE_functionCall);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1296;
            this.functionName();
            this.state = 1297;
            this.match(ExasolParser.LPAREN);
            this.state = 1310;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ExasolParser.STAR:
                {
                this.state = 1298;
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
                this.state = 1300;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                if (_la === 36) {
                    {
                    this.state = 1299;
                    this.match(ExasolParser.DISTINCT);
                    }
                }

                this.state = 1302;
                this.expression(0);
                this.state = 1307;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 161) {
                    {
                    {
                    this.state = 1303;
                    this.match(ExasolParser.COMMA);
                    this.state = 1304;
                    this.expression(0);
                    }
                    }
                    this.state = 1309;
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
            this.state = 1312;
            this.match(ExasolParser.RPAREN);
            this.state = 1314;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 189, this.context) ) {
            case 1:
                {
                this.state = 1313;
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
        this.enterRule(localContext, 112, ExasolParser.RULE_overClause);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1316;
            this.match(ExasolParser.OVER);
            this.state = 1317;
            this.match(ExasolParser.LPAREN);
            this.state = 1328;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 65) {
                {
                this.state = 1318;
                this.match(ExasolParser.PARTITION);
                this.state = 1319;
                this.match(ExasolParser.BY);
                this.state = 1320;
                this.expression(0);
                this.state = 1325;
                this.errorHandler.sync(this);
                _la = this.tokenStream.LA(1);
                while (_la === 161) {
                    {
                    {
                    this.state = 1321;
                    this.match(ExasolParser.COMMA);
                    this.state = 1322;
                    this.expression(0);
                    }
                    }
                    this.state = 1327;
                    this.errorHandler.sync(this);
                    _la = this.tokenStream.LA(1);
                }
                }
            }

            this.state = 1331;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 23) {
                {
                this.state = 1330;
                this.orderByClause();
                }
            }

            this.state = 1334;
            this.errorHandler.sync(this);
            _la = this.tokenStream.LA(1);
            if (_la === 66 || _la === 67) {
                {
                this.state = 1333;
                this.windowFrame();
                }
            }

            this.state = 1336;
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
        this.enterRule(localContext, 114, ExasolParser.RULE_windowFrame);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1338;
            _la = this.tokenStream.LA(1);
            if(!(_la === 66 || _la === 67)) {
            this.errorHandler.recoverInline(this);
            }
            else {
                this.errorHandler.reportMatch(this);
                this.consume();
            }
            this.state = 1345;
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
                this.state = 1339;
                this.frameBound();
                }
                break;
            case ExasolParser.BETWEEN:
                {
                this.state = 1340;
                this.match(ExasolParser.BETWEEN);
                this.state = 1341;
                this.frameBound();
                this.state = 1342;
                this.match(ExasolParser.AND);
                this.state = 1343;
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
        this.enterRule(localContext, 116, ExasolParser.RULE_frameBound);
        let _la: number;
        try {
            this.state = 1354;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ExasolParser.UNBOUNDED:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 1347;
                this.match(ExasolParser.UNBOUNDED);
                this.state = 1348;
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
                this.state = 1349;
                this.match(ExasolParser.CURRENT);
                this.state = 1350;
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
                this.state = 1351;
                this.valueExpr(0);
                this.state = 1352;
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
        this.enterRule(localContext, 118, ExasolParser.RULE_schemaQualifiedTable);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1359;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 196, this.context) ) {
            case 1:
                {
                this.state = 1356;
                this.schemaName();
                this.state = 1357;
                this.match(ExasolParser.DOT);
                }
                break;
            }
            this.state = 1361;
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
        this.enterRule(localContext, 120, ExasolParser.RULE_columnRef);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1371;
            this.errorHandler.sync(this);
            switch (this.interpreter.adaptivePredict(this.tokenStream, 198, this.context) ) {
            case 1:
                {
                this.state = 1366;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 197, this.context) ) {
                case 1:
                    {
                    this.state = 1363;
                    this.schemaName();
                    this.state = 1364;
                    this.match(ExasolParser.DOT);
                    }
                    break;
                }
                this.state = 1368;
                this.tableName();
                this.state = 1369;
                this.match(ExasolParser.DOT);
                }
                break;
            }
            this.state = 1373;
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
        this.enterRule(localContext, 122, ExasolParser.RULE_schemaName);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1375;
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
        this.enterRule(localContext, 124, ExasolParser.RULE_tableName);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1377;
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
        this.enterRule(localContext, 126, ExasolParser.RULE_columnName);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1379;
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
        this.enterRule(localContext, 128, ExasolParser.RULE_functionName);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1381;
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
        this.enterRule(localContext, 130, ExasolParser.RULE_alias);
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1383;
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
        this.enterRule(localContext, 132, ExasolParser.RULE_identifier);
        let _la: number;
        try {
            this.enterOuterAlt(localContext, 1);
            {
            this.state = 1385;
            _la = this.tokenStream.LA(1);
            if(!(((((_la - 107)) & ~0x1F) === 0 && ((1 << (_la - 107)) & 132607859) !== 0) || _la === 157 || _la === 158)) {
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
        this.enterRule(localContext, 134, ExasolParser.RULE_literal);
        let _la: number;
        try {
            this.state = 1409;
            this.errorHandler.sync(this);
            switch (this.tokenStream.LA(1)) {
            case ExasolParser.STRING:
                this.enterOuterAlt(localContext, 1);
                {
                this.state = 1387;
                this.match(ExasolParser.STRING);
                }
                break;
            case ExasolParser.NUMBER:
                this.enterOuterAlt(localContext, 2);
                {
                this.state = 1388;
                this.match(ExasolParser.NUMBER);
                }
                break;
            case ExasolParser.NULL_:
                this.enterOuterAlt(localContext, 3);
                {
                this.state = 1389;
                this.match(ExasolParser.NULL_);
                }
                break;
            case ExasolParser.TRUE_:
                this.enterOuterAlt(localContext, 4);
                {
                this.state = 1390;
                this.match(ExasolParser.TRUE_);
                }
                break;
            case ExasolParser.FALSE_:
                this.enterOuterAlt(localContext, 5);
                {
                this.state = 1391;
                this.match(ExasolParser.FALSE_);
                }
                break;
            case ExasolParser.PARAM:
                this.enterOuterAlt(localContext, 6);
                {
                this.state = 1392;
                this.match(ExasolParser.PARAM);
                }
                break;
            case ExasolParser.DATE:
                this.enterOuterAlt(localContext, 7);
                {
                this.state = 1393;
                this.match(ExasolParser.DATE);
                this.state = 1394;
                this.match(ExasolParser.STRING);
                }
                break;
            case ExasolParser.TIMESTAMP:
                this.enterOuterAlt(localContext, 8);
                {
                this.state = 1395;
                this.match(ExasolParser.TIMESTAMP);
                this.state = 1396;
                this.match(ExasolParser.STRING);
                }
                break;
            case ExasolParser.INTERVAL:
                this.enterOuterAlt(localContext, 9);
                {
                this.state = 1397;
                this.match(ExasolParser.INTERVAL);
                this.state = 1398;
                this.match(ExasolParser.STRING);
                this.state = 1399;
                _la = this.tokenStream.LA(1);
                if(!(((((_la - 128)) & ~0x1F) === 0 && ((1 << (_la - 128)) & 63) !== 0))) {
                this.errorHandler.recoverInline(this);
                }
                else {
                    this.errorHandler.reportMatch(this);
                    this.consume();
                }
                this.state = 1403;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 199, this.context) ) {
                case 1:
                    {
                    this.state = 1400;
                    this.match(ExasolParser.LPAREN);
                    this.state = 1401;
                    this.match(ExasolParser.NUMBER);
                    this.state = 1402;
                    this.match(ExasolParser.RPAREN);
                    }
                    break;
                }
                this.state = 1407;
                this.errorHandler.sync(this);
                switch (this.interpreter.adaptivePredict(this.tokenStream, 200, this.context) ) {
                case 1:
                    {
                    this.state = 1405;
                    this.match(ExasolParser.TO);
                    this.state = 1406;
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
        case 16:
            return this.queryExpression_sempred(localContext as QueryExpressionContext, predIndex);
        case 47:
            return this.expression_sempred(localContext as ExpressionContext, predIndex);
        case 49:
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
        4,1,179,1412,2,0,7,0,2,1,7,1,2,2,7,2,2,3,7,3,2,4,7,4,2,5,7,5,2,6,
        7,6,2,7,7,7,2,8,7,8,2,9,7,9,2,10,7,10,2,11,7,11,2,12,7,12,2,13,7,
        13,2,14,7,14,2,15,7,15,2,16,7,16,2,17,7,17,2,18,7,18,2,19,7,19,2,
        20,7,20,2,21,7,21,2,22,7,22,2,23,7,23,2,24,7,24,2,25,7,25,2,26,7,
        26,2,27,7,27,2,28,7,28,2,29,7,29,2,30,7,30,2,31,7,31,2,32,7,32,2,
        33,7,33,2,34,7,34,2,35,7,35,2,36,7,36,2,37,7,37,2,38,7,38,2,39,7,
        39,2,40,7,40,2,41,7,41,2,42,7,42,2,43,7,43,2,44,7,44,2,45,7,45,2,
        46,7,46,2,47,7,47,2,48,7,48,2,49,7,49,2,50,7,50,2,51,7,51,2,52,7,
        52,2,53,7,53,2,54,7,54,2,55,7,55,2,56,7,56,2,57,7,57,2,58,7,58,2,
        59,7,59,2,60,7,60,2,61,7,61,2,62,7,62,2,63,7,63,2,64,7,64,2,65,7,
        65,2,66,7,66,2,67,7,67,1,0,1,0,1,0,5,0,140,8,0,10,0,12,0,143,9,0,
        1,0,3,0,146,8,0,1,0,1,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
        1,1,1,1,1,1,1,1,3,1,164,8,1,1,2,1,2,1,2,1,2,1,2,1,2,1,2,5,2,173,
        8,2,10,2,12,2,176,9,2,1,2,1,2,3,2,180,8,2,1,2,1,2,1,2,5,2,185,8,
        2,10,2,12,2,188,9,2,1,2,3,2,191,8,2,1,3,1,3,3,3,195,8,3,1,3,1,3,
        4,3,199,8,3,11,3,12,3,200,1,3,1,3,1,3,1,3,4,3,207,8,3,11,3,12,3,
        208,1,3,1,3,1,3,1,3,1,3,1,3,1,3,4,3,218,8,3,11,3,12,3,219,3,3,222,
        8,3,3,3,224,8,3,1,4,1,4,1,4,1,4,1,4,1,4,3,4,232,8,4,1,4,1,4,1,4,
        5,4,237,8,4,10,4,12,4,240,9,4,1,4,3,4,243,8,4,1,5,1,5,3,5,247,8,
        5,1,5,1,5,4,5,251,8,5,11,5,12,5,252,1,5,1,5,1,5,1,5,4,5,259,8,5,
        11,5,12,5,260,1,5,1,5,1,5,1,5,1,5,1,5,1,5,4,5,270,8,5,11,5,12,5,
        271,3,5,274,8,5,3,5,276,8,5,1,6,1,6,3,6,280,8,6,1,6,1,6,1,6,1,6,
        1,6,3,6,287,8,6,1,7,1,7,1,7,1,8,1,8,3,8,294,8,8,1,8,1,8,1,8,3,8,
        299,8,8,1,8,1,8,1,8,1,8,3,8,305,8,8,1,8,1,8,1,8,1,8,3,8,311,8,8,
        1,8,1,8,1,8,1,8,1,8,1,8,3,8,319,8,8,3,8,321,8,8,1,9,1,9,1,9,1,9,
        3,9,327,8,9,1,10,1,10,1,10,3,10,332,8,10,1,10,3,10,335,8,10,1,10,
        3,10,338,8,10,1,10,1,10,1,10,1,10,1,10,1,10,5,10,346,8,10,10,10,
        12,10,349,9,10,1,10,1,10,1,10,1,10,3,10,355,8,10,1,10,1,10,1,10,
        3,10,360,8,10,1,10,1,10,1,10,1,10,1,10,5,10,367,8,10,10,10,12,10,
        370,9,10,1,10,1,10,3,10,374,8,10,1,10,1,10,1,10,1,11,1,11,1,12,1,
        12,3,12,383,8,12,1,13,1,13,1,13,1,13,1,13,1,13,1,13,5,13,392,8,13,
        10,13,12,13,395,9,13,3,13,397,8,13,1,13,3,13,400,8,13,1,14,1,14,
        1,14,1,14,1,14,1,14,3,14,408,8,14,1,14,1,14,1,14,1,14,1,14,1,14,
        1,14,1,14,4,14,418,8,14,11,14,12,14,419,3,14,422,8,14,1,15,3,15,
        425,8,15,1,15,1,15,3,15,429,8,15,1,15,3,15,432,8,15,1,16,1,16,1,
        16,1,16,1,16,1,16,3,16,440,8,16,1,16,1,16,1,16,3,16,445,8,16,1,16,
        1,16,1,16,3,16,450,8,16,1,16,5,16,453,8,16,10,16,12,16,456,9,16,
        1,17,1,17,3,17,460,8,17,1,17,1,17,3,17,464,8,17,1,17,3,17,467,8,
        17,1,17,3,17,470,8,17,1,17,3,17,473,8,17,1,17,3,17,476,8,17,1,17,
        3,17,479,8,17,1,17,1,17,1,17,1,17,1,17,5,17,486,8,17,10,17,12,17,
        489,9,17,1,17,1,17,1,17,1,17,1,17,1,17,5,17,497,8,17,10,17,12,17,
        500,9,17,1,17,1,17,5,17,504,8,17,10,17,12,17,507,9,17,3,17,509,8,
        17,1,18,1,18,1,18,1,18,5,18,515,8,18,10,18,12,18,518,9,18,1,19,1,
        19,1,19,1,19,1,19,5,19,525,8,19,10,19,12,19,528,9,19,1,19,1,19,3,
        19,532,8,19,1,19,1,19,1,19,1,19,1,19,1,20,1,20,1,20,5,20,542,8,20,
        10,20,12,20,545,9,20,1,21,1,21,1,21,3,21,550,8,21,1,21,1,21,1,21,
        3,21,555,8,21,1,21,3,21,558,8,21,3,21,560,8,21,1,22,1,22,1,22,1,
        22,5,22,566,8,22,10,22,12,22,569,9,22,1,23,1,23,5,23,573,8,23,10,
        23,12,23,576,9,23,1,24,1,24,3,24,580,8,24,1,24,3,24,583,8,24,1,24,
        1,24,1,24,1,24,3,24,589,8,24,1,24,3,24,592,8,24,3,24,594,8,24,1,
        25,1,25,1,25,3,25,599,8,25,1,25,1,25,3,25,603,8,25,1,25,1,25,3,25,
        607,8,25,1,25,3,25,610,8,25,1,25,1,25,1,25,1,25,1,25,1,25,1,25,1,
        25,1,25,5,25,621,8,25,10,25,12,25,624,9,25,1,25,1,25,3,25,628,8,
        25,1,26,1,26,1,26,1,27,1,27,1,27,3,27,636,8,27,1,27,1,27,1,27,1,
        27,3,27,642,8,27,1,27,1,27,1,27,1,27,1,27,1,27,3,27,650,8,27,1,27,
        1,27,3,27,654,8,27,1,28,1,28,1,28,1,28,1,28,5,28,661,8,28,10,28,
        12,28,664,9,28,1,29,1,29,1,29,1,29,1,29,5,29,671,8,29,10,29,12,29,
        674,9,29,1,29,1,29,1,29,1,29,1,29,1,29,1,29,5,29,683,8,29,10,29,
        12,29,686,9,29,1,29,1,29,1,29,1,29,1,29,1,29,1,29,1,29,5,29,696,
        8,29,10,29,12,29,699,9,29,1,29,1,29,1,29,1,29,1,29,1,29,1,29,1,29,
        5,29,709,8,29,10,29,12,29,712,9,29,1,29,1,29,1,29,3,29,717,8,29,
        1,30,1,30,1,30,1,31,1,31,1,31,1,32,1,32,1,32,1,32,1,32,5,32,730,
        8,32,10,32,12,32,733,9,32,1,33,1,33,3,33,737,8,33,1,33,1,33,3,33,
        741,8,33,1,34,1,34,1,34,1,34,3,34,747,8,34,1,34,1,34,1,34,1,34,3,
        34,753,8,34,1,35,1,35,1,35,1,35,1,35,1,35,1,35,5,35,762,8,35,10,
        35,12,35,765,9,35,1,35,1,35,3,35,769,8,35,1,35,1,35,1,35,1,35,1,
        35,5,35,776,8,35,10,35,12,35,779,9,35,1,35,1,35,1,35,1,35,1,35,1,
        35,5,35,787,8,35,10,35,12,35,790,9,35,1,35,1,35,5,35,794,8,35,10,
        35,12,35,797,9,35,1,35,1,35,1,35,3,35,802,8,35,1,36,1,36,3,36,806,
        8,36,1,37,1,37,1,37,3,37,811,8,37,1,37,3,37,814,8,37,1,37,1,37,1,
        37,1,37,1,37,1,37,1,37,1,37,1,37,5,37,825,8,37,10,37,12,37,828,9,
        37,1,37,3,37,831,8,37,1,37,3,37,834,8,37,1,38,1,38,1,38,1,38,3,38,
        840,8,38,1,38,3,38,843,8,38,1,38,3,38,846,8,38,1,39,1,39,1,39,1,
        39,3,39,852,8,39,1,39,3,39,855,8,39,1,39,1,39,1,39,1,39,1,39,4,39,
        862,8,39,11,39,12,39,863,1,40,1,40,1,40,1,40,1,40,1,40,1,40,1,40,
        1,40,1,40,1,40,1,40,1,40,5,40,879,8,40,10,40,12,40,882,9,40,1,40,
        3,40,885,8,40,1,40,1,40,3,40,889,8,40,3,40,891,8,40,1,40,1,40,1,
        40,1,40,1,40,1,40,1,40,1,40,1,40,5,40,902,8,40,10,40,12,40,905,9,
        40,1,40,1,40,3,40,909,8,40,1,40,1,40,1,40,1,40,1,40,5,40,916,8,40,
        10,40,12,40,919,9,40,1,40,1,40,3,40,923,8,40,3,40,925,8,40,1,41,
        1,41,1,41,1,41,1,42,1,42,3,42,933,8,42,1,42,1,42,1,42,1,42,3,42,
        939,8,42,1,42,1,42,1,43,1,43,1,43,3,43,946,8,43,1,43,1,43,1,43,1,
        43,3,43,952,8,43,1,43,1,43,1,43,1,43,1,43,5,43,959,8,43,10,43,12,
        43,962,9,43,1,43,1,43,1,43,1,43,3,43,968,8,43,1,44,1,44,1,44,1,44,
        3,44,974,8,44,1,44,3,44,977,8,44,1,44,3,44,980,8,44,1,44,1,44,3,
        44,984,8,44,1,44,1,44,3,44,988,8,44,1,44,3,44,991,8,44,1,44,1,44,
        3,44,995,8,44,1,44,1,44,1,44,1,44,3,44,1001,8,44,1,44,1,44,1,44,
        1,44,5,44,1007,8,44,10,44,12,44,1010,9,44,1,44,1,44,1,44,3,44,1015,
        8,44,1,44,1,44,1,44,1,44,1,44,5,44,1022,8,44,10,44,12,44,1025,9,
        44,3,44,1027,8,44,1,45,1,45,1,45,1,45,3,45,1033,8,45,1,45,1,45,3,
        45,1037,8,45,1,46,1,46,1,46,1,46,1,46,3,46,1044,8,46,1,46,3,46,1047,
        8,46,1,46,1,46,1,46,1,46,1,46,1,46,1,46,3,46,1056,8,46,1,46,1,46,
        1,46,1,46,3,46,1062,8,46,1,46,1,46,3,46,1066,8,46,1,46,1,46,1,46,
        3,46,1071,8,46,1,46,1,46,1,46,3,46,1076,8,46,1,46,1,46,1,46,1,46,
        3,46,1082,8,46,1,46,1,46,3,46,1086,8,46,3,46,1088,8,46,1,46,1,46,
        1,46,1,46,1,46,3,46,1095,8,46,1,46,1,46,1,46,1,46,1,46,1,46,1,46,
        3,46,1104,8,46,1,46,1,46,1,46,1,46,1,46,3,46,1111,8,46,1,46,1,46,
        1,46,1,46,3,46,1117,8,46,1,46,1,46,1,46,1,46,3,46,1123,8,46,1,46,
        3,46,1126,8,46,1,46,1,46,1,46,1,46,1,46,3,46,1133,8,46,1,46,3,46,
        1136,8,46,3,46,1138,8,46,1,47,1,47,1,47,1,47,3,47,1144,8,47,1,47,
        1,47,1,47,1,47,1,47,1,47,5,47,1152,8,47,10,47,12,47,1155,9,47,1,
        48,1,48,1,48,3,48,1160,8,48,1,48,1,48,1,48,1,48,1,48,3,48,1167,8,
        48,1,48,1,48,3,48,1171,8,48,1,48,1,48,1,48,1,48,1,48,1,48,1,48,3,
        48,1180,8,48,1,48,1,48,1,48,1,48,1,48,1,48,5,48,1188,8,48,10,48,
        12,48,1191,9,48,3,48,1193,8,48,1,48,1,48,1,48,1,48,3,48,1199,8,48,
        1,48,1,48,1,48,1,48,1,48,1,48,3,48,1207,8,48,1,48,1,48,1,48,1,48,
        1,48,1,48,1,48,1,48,3,48,1217,8,48,1,49,1,49,1,49,1,49,1,49,1,49,
        3,49,1225,8,49,1,49,1,49,1,49,1,49,1,49,1,49,1,49,1,49,1,49,5,49,
        1236,8,49,10,49,12,49,1239,9,49,1,50,1,50,1,50,1,50,1,50,1,50,1,
        50,1,50,1,50,1,50,3,50,1251,8,50,1,50,1,50,3,50,1255,8,50,1,51,1,
        51,3,51,1259,8,51,1,51,1,51,1,51,1,51,1,51,4,51,1266,8,51,11,51,
        12,51,1267,1,51,1,51,3,51,1272,8,51,1,51,1,51,1,52,1,52,1,52,1,52,
        1,52,1,52,1,52,1,53,1,53,1,53,1,53,1,53,1,53,1,53,1,54,1,54,1,54,
        1,54,1,54,1,54,1,54,1,55,1,55,1,55,1,55,3,55,1301,8,55,1,55,1,55,
        1,55,5,55,1306,8,55,10,55,12,55,1309,9,55,3,55,1311,8,55,1,55,1,
        55,3,55,1315,8,55,1,56,1,56,1,56,1,56,1,56,1,56,1,56,5,56,1324,8,
        56,10,56,12,56,1327,9,56,3,56,1329,8,56,1,56,3,56,1332,8,56,1,56,
        3,56,1335,8,56,1,56,1,56,1,57,1,57,1,57,1,57,1,57,1,57,1,57,3,57,
        1346,8,57,1,58,1,58,1,58,1,58,1,58,1,58,1,58,3,58,1355,8,58,1,59,
        1,59,1,59,3,59,1360,8,59,1,59,1,59,1,60,1,60,1,60,3,60,1367,8,60,
        1,60,1,60,1,60,3,60,1372,8,60,1,60,1,60,1,61,1,61,1,62,1,62,1,63,
        1,63,1,64,1,64,1,65,1,65,1,66,1,66,1,67,1,67,1,67,1,67,1,67,1,67,
        1,67,1,67,1,67,1,67,1,67,1,67,1,67,1,67,1,67,1,67,3,67,1404,8,67,
        1,67,1,67,3,67,1408,8,67,3,67,1410,8,67,1,67,0,3,32,94,98,68,0,2,
        4,6,8,10,12,14,16,18,20,22,24,26,28,30,32,34,36,38,40,42,44,46,48,
        50,52,54,56,58,60,62,64,66,68,70,72,74,76,78,80,82,84,86,88,90,92,
        94,96,98,100,102,104,106,108,110,112,114,116,118,120,122,124,126,
        128,130,132,134,0,19,1,0,107,108,1,0,109,110,2,0,156,156,158,158,
        2,0,30,30,100,100,2,0,87,87,103,106,1,0,35,36,1,0,76,77,1,0,74,75,
        1,0,78,83,1,0,148,149,1,0,165,170,2,0,35,35,123,124,1,0,52,53,2,
        0,164,164,173,173,1,0,171,172,1,0,128,133,1,0,66,67,1,0,68,69,7,
        0,107,108,111,113,115,118,120,121,123,125,128,133,157,158,1611,0,
        136,1,0,0,0,2,163,1,0,0,0,4,165,1,0,0,0,6,223,1,0,0,0,8,225,1,0,
        0,0,10,275,1,0,0,0,12,279,1,0,0,0,14,288,1,0,0,0,16,320,1,0,0,0,
        18,322,1,0,0,0,20,328,1,0,0,0,22,378,1,0,0,0,24,380,1,0,0,0,26,384,
        1,0,0,0,28,401,1,0,0,0,30,424,1,0,0,0,32,439,1,0,0,0,34,508,1,0,
        0,0,36,510,1,0,0,0,38,519,1,0,0,0,40,538,1,0,0,0,42,559,1,0,0,0,
        44,561,1,0,0,0,46,570,1,0,0,0,48,593,1,0,0,0,50,609,1,0,0,0,52,629,
        1,0,0,0,54,653,1,0,0,0,56,655,1,0,0,0,58,716,1,0,0,0,60,718,1,0,
        0,0,62,721,1,0,0,0,64,724,1,0,0,0,66,734,1,0,0,0,68,752,1,0,0,0,
        70,754,1,0,0,0,72,805,1,0,0,0,74,807,1,0,0,0,76,835,1,0,0,0,78,847,
        1,0,0,0,80,924,1,0,0,0,82,926,1,0,0,0,84,930,1,0,0,0,86,942,1,0,
        0,0,88,1026,1,0,0,0,90,1028,1,0,0,0,92,1137,1,0,0,0,94,1143,1,0,
        0,0,96,1216,1,0,0,0,98,1224,1,0,0,0,100,1254,1,0,0,0,102,1256,1,
        0,0,0,104,1275,1,0,0,0,106,1282,1,0,0,0,108,1289,1,0,0,0,110,1296,
        1,0,0,0,112,1316,1,0,0,0,114,1338,1,0,0,0,116,1354,1,0,0,0,118,1359,
        1,0,0,0,120,1371,1,0,0,0,122,1375,1,0,0,0,124,1377,1,0,0,0,126,1379,
        1,0,0,0,128,1381,1,0,0,0,130,1383,1,0,0,0,132,1385,1,0,0,0,134,1409,
        1,0,0,0,136,141,3,2,1,0,137,138,5,163,0,0,138,140,3,2,1,0,139,137,
        1,0,0,0,140,143,1,0,0,0,141,139,1,0,0,0,141,142,1,0,0,0,142,145,
        1,0,0,0,143,141,1,0,0,0,144,146,5,163,0,0,145,144,1,0,0,0,145,146,
        1,0,0,0,146,147,1,0,0,0,147,148,5,0,0,1,148,1,1,0,0,0,149,164,3,
        30,15,0,150,164,3,70,35,0,151,164,3,74,37,0,152,164,3,76,38,0,153,
        164,3,78,39,0,154,164,3,82,41,0,155,164,3,84,42,0,156,164,3,86,43,
        0,157,164,3,90,45,0,158,164,3,4,2,0,159,164,3,8,4,0,160,164,3,20,
        10,0,161,164,3,26,13,0,162,164,3,28,14,0,163,149,1,0,0,0,163,150,
        1,0,0,0,163,151,1,0,0,0,163,152,1,0,0,0,163,153,1,0,0,0,163,154,
        1,0,0,0,163,155,1,0,0,0,163,156,1,0,0,0,163,157,1,0,0,0,163,158,
        1,0,0,0,163,159,1,0,0,0,163,160,1,0,0,0,163,161,1,0,0,0,163,162,
        1,0,0,0,164,3,1,0,0,0,165,166,5,13,0,0,166,167,5,28,0,0,167,179,
        3,118,59,0,168,169,5,159,0,0,169,174,3,126,63,0,170,171,5,161,0,
        0,171,173,3,126,63,0,172,170,1,0,0,0,173,176,1,0,0,0,174,172,1,0,
        0,0,174,175,1,0,0,0,175,177,1,0,0,0,176,174,1,0,0,0,177,178,5,160,
        0,0,178,180,1,0,0,0,179,168,1,0,0,0,179,180,1,0,0,0,180,181,1,0,
        0,0,181,182,5,17,0,0,182,186,3,6,3,0,183,185,3,16,8,0,184,183,1,
        0,0,0,185,188,1,0,0,0,186,184,1,0,0,0,186,187,1,0,0,0,187,190,1,
        0,0,0,188,186,1,0,0,0,189,191,3,18,9,0,190,189,1,0,0,0,190,191,1,
        0,0,0,191,5,1,0,0,0,192,194,5,111,0,0,193,195,5,114,0,0,194,193,
        1,0,0,0,194,195,1,0,0,0,195,196,1,0,0,0,196,198,7,0,0,0,197,199,
        3,14,7,0,198,197,1,0,0,0,199,200,1,0,0,0,200,198,1,0,0,0,200,201,
        1,0,0,0,201,224,1,0,0,0,202,203,7,0,0,0,203,204,5,112,0,0,204,206,
        3,12,6,0,205,207,3,14,7,0,206,205,1,0,0,0,207,208,1,0,0,0,208,206,
        1,0,0,0,208,209,1,0,0,0,209,224,1,0,0,0,210,211,7,1,0,0,211,212,
        5,112,0,0,212,221,3,12,6,0,213,214,5,79,0,0,214,222,3,118,59,0,215,
        217,5,150,0,0,216,218,5,155,0,0,217,216,1,0,0,0,218,219,1,0,0,0,
        219,217,1,0,0,0,219,220,1,0,0,0,220,222,1,0,0,0,221,213,1,0,0,0,
        221,215,1,0,0,0,222,224,1,0,0,0,223,192,1,0,0,0,223,202,1,0,0,0,
        223,210,1,0,0,0,224,7,1,0,0,0,225,231,5,14,0,0,226,232,3,118,59,
        0,227,228,5,159,0,0,228,229,3,30,15,0,229,230,5,160,0,0,230,232,
        1,0,0,0,231,226,1,0,0,0,231,227,1,0,0,0,232,233,1,0,0,0,233,234,
        5,28,0,0,234,238,3,10,5,0,235,237,3,16,8,0,236,235,1,0,0,0,237,240,
        1,0,0,0,238,236,1,0,0,0,238,239,1,0,0,0,239,242,1,0,0,0,240,238,
        1,0,0,0,241,243,3,18,9,0,242,241,1,0,0,0,242,243,1,0,0,0,243,9,1,
        0,0,0,244,246,5,111,0,0,245,247,5,114,0,0,246,245,1,0,0,0,246,247,
        1,0,0,0,247,248,1,0,0,0,248,250,7,0,0,0,249,251,3,14,7,0,250,249,
        1,0,0,0,251,252,1,0,0,0,252,250,1,0,0,0,252,253,1,0,0,0,253,276,
        1,0,0,0,254,255,7,0,0,0,255,256,5,112,0,0,256,258,3,12,6,0,257,259,
        3,14,7,0,258,257,1,0,0,0,259,260,1,0,0,0,260,258,1,0,0,0,260,261,
        1,0,0,0,261,276,1,0,0,0,262,263,7,1,0,0,263,264,5,112,0,0,264,273,
        3,12,6,0,265,266,5,79,0,0,266,274,3,118,59,0,267,269,5,150,0,0,268,
        270,5,155,0,0,269,268,1,0,0,0,270,271,1,0,0,0,271,269,1,0,0,0,271,
        272,1,0,0,0,272,274,1,0,0,0,273,265,1,0,0,0,273,267,1,0,0,0,274,
        276,1,0,0,0,275,244,1,0,0,0,275,254,1,0,0,0,275,262,1,0,0,0,276,
        11,1,0,0,0,277,280,3,132,66,0,278,280,5,155,0,0,279,277,1,0,0,0,
        279,278,1,0,0,0,280,286,1,0,0,0,281,282,5,84,0,0,282,283,5,155,0,
        0,283,284,5,99,0,0,284,285,5,20,0,0,285,287,5,155,0,0,286,281,1,
        0,0,0,286,287,1,0,0,0,287,13,1,0,0,0,288,289,5,113,0,0,289,290,5,
        155,0,0,290,15,1,0,0,0,291,293,5,154,0,0,292,294,5,165,0,0,293,292,
        1,0,0,0,293,294,1,0,0,0,294,295,1,0,0,0,295,321,5,155,0,0,296,298,
        5,153,0,0,297,299,5,165,0,0,298,297,1,0,0,0,298,299,1,0,0,0,299,
        300,1,0,0,0,300,321,5,156,0,0,301,302,5,72,0,0,302,304,5,158,0,0,
        303,305,5,165,0,0,304,303,1,0,0,0,304,305,1,0,0,0,305,306,1,0,0,
        0,306,321,5,155,0,0,307,308,5,90,0,0,308,310,5,158,0,0,309,311,5,
        165,0,0,310,309,1,0,0,0,310,311,1,0,0,0,311,312,1,0,0,0,312,321,
        5,155,0,0,313,314,3,132,66,0,314,318,5,165,0,0,315,319,5,155,0,0,
        316,319,5,156,0,0,317,319,3,132,66,0,318,315,1,0,0,0,318,316,1,0,
        0,0,318,317,1,0,0,0,319,321,1,0,0,0,320,291,1,0,0,0,320,296,1,0,
        0,0,320,301,1,0,0,0,320,307,1,0,0,0,320,313,1,0,0,0,321,17,1,0,0,
        0,322,323,5,152,0,0,323,324,5,24,0,0,324,326,7,2,0,0,325,327,5,151,
        0,0,326,325,1,0,0,0,326,327,1,0,0,0,327,19,1,0,0,0,328,331,5,6,0,
        0,329,330,5,47,0,0,330,332,5,89,0,0,331,329,1,0,0,0,331,332,1,0,
        0,0,332,334,1,0,0,0,333,335,3,22,11,0,334,333,1,0,0,0,334,335,1,
        0,0,0,335,337,1,0,0,0,336,338,7,3,0,0,337,336,1,0,0,0,337,338,1,
        0,0,0,338,339,1,0,0,0,339,340,5,82,0,0,340,354,3,118,59,0,341,342,
        5,159,0,0,342,347,3,24,12,0,343,344,5,161,0,0,344,346,3,24,12,0,
        345,343,1,0,0,0,346,349,1,0,0,0,347,345,1,0,0,0,347,348,1,0,0,0,
        348,350,1,0,0,0,349,347,1,0,0,0,350,351,5,160,0,0,351,355,1,0,0,
        0,352,353,5,159,0,0,353,355,5,160,0,0,354,341,1,0,0,0,354,352,1,
        0,0,0,354,355,1,0,0,0,355,373,1,0,0,0,356,359,5,101,0,0,357,360,
        3,92,46,0,358,360,5,79,0,0,359,357,1,0,0,0,359,358,1,0,0,0,360,374,
        1,0,0,0,361,362,5,102,0,0,362,363,5,159,0,0,363,368,3,24,12,0,364,
        365,5,161,0,0,365,367,3,24,12,0,366,364,1,0,0,0,367,370,1,0,0,0,
        368,366,1,0,0,0,368,369,1,0,0,0,369,371,1,0,0,0,370,368,1,0,0,0,
        371,372,5,160,0,0,372,374,1,0,0,0,373,356,1,0,0,0,373,361,1,0,0,
        0,373,374,1,0,0,0,374,375,1,0,0,0,375,376,5,27,0,0,376,377,5,179,
        0,0,377,21,1,0,0,0,378,379,7,4,0,0,379,23,1,0,0,0,380,382,3,126,
        63,0,381,383,3,92,46,0,382,381,1,0,0,0,382,383,1,0,0,0,383,25,1,
        0,0,0,384,385,5,15,0,0,385,386,5,82,0,0,386,399,3,118,59,0,387,396,
        5,159,0,0,388,393,3,94,47,0,389,390,5,161,0,0,390,392,3,94,47,0,
        391,389,1,0,0,0,392,395,1,0,0,0,393,391,1,0,0,0,393,394,1,0,0,0,
        394,397,1,0,0,0,395,393,1,0,0,0,396,388,1,0,0,0,396,397,1,0,0,0,
        397,398,1,0,0,0,398,400,5,160,0,0,399,387,1,0,0,0,399,400,1,0,0,
        0,400,27,1,0,0,0,401,402,5,6,0,0,402,403,5,86,0,0,403,407,5,78,0,
        0,404,405,5,88,0,0,405,406,5,48,0,0,406,408,5,50,0,0,407,404,1,0,
        0,0,407,408,1,0,0,0,408,409,1,0,0,0,409,410,3,122,61,0,410,411,5,
        45,0,0,411,421,3,118,59,0,412,417,5,26,0,0,413,414,3,132,66,0,414,
        415,5,165,0,0,415,416,3,134,67,0,416,418,1,0,0,0,417,413,1,0,0,0,
        418,419,1,0,0,0,419,417,1,0,0,0,419,420,1,0,0,0,420,422,1,0,0,0,
        421,412,1,0,0,0,421,422,1,0,0,0,422,29,1,0,0,0,423,425,3,36,18,0,
        424,423,1,0,0,0,424,425,1,0,0,0,425,426,1,0,0,0,426,428,3,32,16,
        0,427,429,3,64,32,0,428,427,1,0,0,0,428,429,1,0,0,0,429,431,1,0,
        0,0,430,432,3,68,34,0,431,430,1,0,0,0,431,432,1,0,0,0,432,31,1,0,
        0,0,433,434,6,16,-1,0,434,440,3,34,17,0,435,436,5,159,0,0,436,437,
        3,30,15,0,437,438,5,160,0,0,438,440,1,0,0,0,439,433,1,0,0,0,439,
        435,1,0,0,0,440,454,1,0,0,0,441,449,10,3,0,0,442,444,5,31,0,0,443,
        445,5,35,0,0,444,443,1,0,0,0,444,445,1,0,0,0,445,450,1,0,0,0,446,
        450,5,32,0,0,447,450,5,33,0,0,448,450,5,34,0,0,449,442,1,0,0,0,449,
        446,1,0,0,0,449,447,1,0,0,0,449,448,1,0,0,0,450,451,1,0,0,0,451,
        453,3,32,16,4,452,441,1,0,0,0,453,456,1,0,0,0,454,452,1,0,0,0,454,
        455,1,0,0,0,455,33,1,0,0,0,456,454,1,0,0,0,457,459,5,1,0,0,458,460,
        7,5,0,0,459,458,1,0,0,0,459,460,1,0,0,0,460,461,1,0,0,0,461,463,
        3,40,20,0,462,464,3,44,22,0,463,462,1,0,0,0,463,464,1,0,0,0,464,
        466,1,0,0,0,465,467,3,52,26,0,466,465,1,0,0,0,466,467,1,0,0,0,467,
        469,1,0,0,0,468,470,3,54,27,0,469,468,1,0,0,0,469,470,1,0,0,0,470,
        472,1,0,0,0,471,473,3,56,28,0,472,471,1,0,0,0,472,473,1,0,0,0,473,
        475,1,0,0,0,474,476,3,60,30,0,475,474,1,0,0,0,475,476,1,0,0,0,476,
        478,1,0,0,0,477,479,3,62,31,0,478,477,1,0,0,0,478,479,1,0,0,0,479,
        509,1,0,0,0,480,481,5,29,0,0,481,482,5,159,0,0,482,487,3,94,47,0,
        483,484,5,161,0,0,484,486,3,94,47,0,485,483,1,0,0,0,486,489,1,0,
        0,0,487,485,1,0,0,0,487,488,1,0,0,0,488,490,1,0,0,0,489,487,1,0,
        0,0,490,505,5,160,0,0,491,492,5,161,0,0,492,493,5,159,0,0,493,498,
        3,94,47,0,494,495,5,161,0,0,495,497,3,94,47,0,496,494,1,0,0,0,497,
        500,1,0,0,0,498,496,1,0,0,0,498,499,1,0,0,0,499,501,1,0,0,0,500,
        498,1,0,0,0,501,502,5,160,0,0,502,504,1,0,0,0,503,491,1,0,0,0,504,
        507,1,0,0,0,505,503,1,0,0,0,505,506,1,0,0,0,506,509,1,0,0,0,507,
        505,1,0,0,0,508,457,1,0,0,0,508,480,1,0,0,0,509,35,1,0,0,0,510,511,
        5,26,0,0,511,516,3,38,19,0,512,513,5,161,0,0,513,515,3,38,19,0,514,
        512,1,0,0,0,515,518,1,0,0,0,516,514,1,0,0,0,516,517,1,0,0,0,517,
        37,1,0,0,0,518,516,1,0,0,0,519,531,3,124,62,0,520,521,5,159,0,0,
        521,526,3,126,63,0,522,523,5,161,0,0,523,525,3,126,63,0,524,522,
        1,0,0,0,525,528,1,0,0,0,526,524,1,0,0,0,526,527,1,0,0,0,527,529,
        1,0,0,0,528,526,1,0,0,0,529,530,5,160,0,0,530,532,1,0,0,0,531,520,
        1,0,0,0,531,532,1,0,0,0,532,533,1,0,0,0,533,534,5,27,0,0,534,535,
        5,159,0,0,535,536,3,30,15,0,536,537,5,160,0,0,537,39,1,0,0,0,538,
        543,3,42,21,0,539,540,5,161,0,0,540,542,3,42,21,0,541,539,1,0,0,
        0,542,545,1,0,0,0,543,541,1,0,0,0,543,544,1,0,0,0,544,41,1,0,0,0,
        545,543,1,0,0,0,546,547,3,124,62,0,547,548,5,162,0,0,548,550,1,0,
        0,0,549,546,1,0,0,0,549,550,1,0,0,0,550,551,1,0,0,0,551,560,5,164,
        0,0,552,557,3,94,47,0,553,555,5,27,0,0,554,553,1,0,0,0,554,555,1,
        0,0,0,555,556,1,0,0,0,556,558,3,130,65,0,557,554,1,0,0,0,557,558,
        1,0,0,0,558,560,1,0,0,0,559,549,1,0,0,0,559,552,1,0,0,0,560,43,1,
        0,0,0,561,562,5,17,0,0,562,567,3,46,23,0,563,564,5,161,0,0,564,566,
        3,46,23,0,565,563,1,0,0,0,566,569,1,0,0,0,567,565,1,0,0,0,567,568,
        1,0,0,0,568,45,1,0,0,0,569,567,1,0,0,0,570,574,3,48,24,0,571,573,
        3,50,25,0,572,571,1,0,0,0,573,576,1,0,0,0,574,572,1,0,0,0,574,575,
        1,0,0,0,575,47,1,0,0,0,576,574,1,0,0,0,577,582,3,118,59,0,578,580,
        5,27,0,0,579,578,1,0,0,0,579,580,1,0,0,0,580,581,1,0,0,0,581,583,
        3,130,65,0,582,579,1,0,0,0,582,583,1,0,0,0,583,594,1,0,0,0,584,585,
        5,159,0,0,585,586,3,30,15,0,586,591,5,160,0,0,587,589,5,27,0,0,588,
        587,1,0,0,0,588,589,1,0,0,0,589,590,1,0,0,0,590,592,3,130,65,0,591,
        588,1,0,0,0,591,592,1,0,0,0,592,594,1,0,0,0,593,577,1,0,0,0,593,
        584,1,0,0,0,594,49,1,0,0,0,595,610,5,38,0,0,596,598,5,39,0,0,597,
        599,5,42,0,0,598,597,1,0,0,0,598,599,1,0,0,0,599,610,1,0,0,0,600,
        602,5,40,0,0,601,603,5,42,0,0,602,601,1,0,0,0,602,603,1,0,0,0,603,
        610,1,0,0,0,604,606,5,41,0,0,605,607,5,42,0,0,606,605,1,0,0,0,606,
        607,1,0,0,0,607,610,1,0,0,0,608,610,5,43,0,0,609,595,1,0,0,0,609,
        596,1,0,0,0,609,600,1,0,0,0,609,604,1,0,0,0,609,608,1,0,0,0,609,
        610,1,0,0,0,610,611,1,0,0,0,611,612,5,37,0,0,612,627,3,48,24,0,613,
        614,5,44,0,0,614,628,3,94,47,0,615,616,5,45,0,0,616,617,5,159,0,
        0,617,622,3,126,63,0,618,619,5,161,0,0,619,621,3,126,63,0,620,618,
        1,0,0,0,621,624,1,0,0,0,622,620,1,0,0,0,622,623,1,0,0,0,623,625,
        1,0,0,0,624,622,1,0,0,0,625,626,5,160,0,0,626,628,1,0,0,0,627,613,
        1,0,0,0,627,615,1,0,0,0,627,628,1,0,0,0,628,51,1,0,0,0,629,630,5,
        18,0,0,630,631,3,94,47,0,631,53,1,0,0,0,632,633,5,119,0,0,633,635,
        5,20,0,0,634,636,5,122,0,0,635,634,1,0,0,0,635,636,1,0,0,0,636,637,
        1,0,0,0,637,641,3,94,47,0,638,639,5,120,0,0,639,640,5,26,0,0,640,
        642,3,94,47,0,641,638,1,0,0,0,641,642,1,0,0,0,642,654,1,0,0,0,643,
        644,5,120,0,0,644,645,5,26,0,0,645,646,3,94,47,0,646,647,5,119,0,
        0,647,649,5,20,0,0,648,650,5,122,0,0,649,648,1,0,0,0,649,650,1,0,
        0,0,650,651,1,0,0,0,651,652,3,94,47,0,652,654,1,0,0,0,653,632,1,
        0,0,0,653,643,1,0,0,0,654,55,1,0,0,0,655,656,5,19,0,0,656,657,5,
        20,0,0,657,662,3,58,29,0,658,659,5,161,0,0,659,661,3,58,29,0,660,
        658,1,0,0,0,661,664,1,0,0,0,662,660,1,0,0,0,662,663,1,0,0,0,663,
        57,1,0,0,0,664,662,1,0,0,0,665,666,5,115,0,0,666,667,5,159,0,0,667,
        672,3,94,47,0,668,669,5,161,0,0,669,671,3,94,47,0,670,668,1,0,0,
        0,671,674,1,0,0,0,672,670,1,0,0,0,672,673,1,0,0,0,673,675,1,0,0,
        0,674,672,1,0,0,0,675,676,5,160,0,0,676,717,1,0,0,0,677,678,5,116,
        0,0,678,679,5,159,0,0,679,684,3,94,47,0,680,681,5,161,0,0,681,683,
        3,94,47,0,682,680,1,0,0,0,683,686,1,0,0,0,684,682,1,0,0,0,684,685,
        1,0,0,0,685,687,1,0,0,0,686,684,1,0,0,0,687,688,5,160,0,0,688,717,
        1,0,0,0,689,690,5,117,0,0,690,691,5,118,0,0,691,692,5,159,0,0,692,
        697,3,58,29,0,693,694,5,161,0,0,694,696,3,58,29,0,695,693,1,0,0,
        0,696,699,1,0,0,0,697,695,1,0,0,0,697,698,1,0,0,0,698,700,1,0,0,
        0,699,697,1,0,0,0,700,701,5,160,0,0,701,717,1,0,0,0,702,703,5,159,
        0,0,703,717,5,160,0,0,704,705,5,159,0,0,705,710,3,94,47,0,706,707,
        5,161,0,0,707,709,3,94,47,0,708,706,1,0,0,0,709,712,1,0,0,0,710,
        708,1,0,0,0,710,711,1,0,0,0,711,713,1,0,0,0,712,710,1,0,0,0,713,
        714,5,160,0,0,714,717,1,0,0,0,715,717,3,94,47,0,716,665,1,0,0,0,
        716,677,1,0,0,0,716,689,1,0,0,0,716,702,1,0,0,0,716,704,1,0,0,0,
        716,715,1,0,0,0,717,59,1,0,0,0,718,719,5,21,0,0,719,720,3,94,47,
        0,720,61,1,0,0,0,721,722,5,22,0,0,722,723,3,94,47,0,723,63,1,0,0,
        0,724,725,5,23,0,0,725,726,5,20,0,0,726,731,3,66,33,0,727,728,5,
        161,0,0,728,730,3,66,33,0,729,727,1,0,0,0,730,733,1,0,0,0,731,729,
        1,0,0,0,731,732,1,0,0,0,732,65,1,0,0,0,733,731,1,0,0,0,734,736,3,
        94,47,0,735,737,7,6,0,0,736,735,1,0,0,0,736,737,1,0,0,0,737,740,
        1,0,0,0,738,739,5,73,0,0,739,741,7,7,0,0,740,738,1,0,0,0,740,741,
        1,0,0,0,741,67,1,0,0,0,742,743,5,24,0,0,743,746,5,156,0,0,744,745,
        5,25,0,0,745,747,5,156,0,0,746,744,1,0,0,0,746,747,1,0,0,0,747,753,
        1,0,0,0,748,749,5,24,0,0,749,750,5,156,0,0,750,751,5,161,0,0,751,
        753,5,156,0,0,752,742,1,0,0,0,752,748,1,0,0,0,753,69,1,0,0,0,754,
        755,5,2,0,0,755,756,5,28,0,0,756,768,3,118,59,0,757,758,5,159,0,
        0,758,763,3,126,63,0,759,760,5,161,0,0,760,762,3,126,63,0,761,759,
        1,0,0,0,762,765,1,0,0,0,763,761,1,0,0,0,763,764,1,0,0,0,764,766,
        1,0,0,0,765,763,1,0,0,0,766,767,5,160,0,0,767,769,1,0,0,0,768,757,
        1,0,0,0,768,769,1,0,0,0,769,801,1,0,0,0,770,771,5,29,0,0,771,772,
        5,159,0,0,772,777,3,72,36,0,773,774,5,161,0,0,774,776,3,72,36,0,
        775,773,1,0,0,0,776,779,1,0,0,0,777,775,1,0,0,0,777,778,1,0,0,0,
        778,780,1,0,0,0,779,777,1,0,0,0,780,795,5,160,0,0,781,782,5,161,
        0,0,782,783,5,159,0,0,783,788,3,72,36,0,784,785,5,161,0,0,785,787,
        3,72,36,0,786,784,1,0,0,0,787,790,1,0,0,0,788,786,1,0,0,0,788,789,
        1,0,0,0,789,791,1,0,0,0,790,788,1,0,0,0,791,792,5,160,0,0,792,794,
        1,0,0,0,793,781,1,0,0,0,794,797,1,0,0,0,795,793,1,0,0,0,795,796,
        1,0,0,0,796,802,1,0,0,0,797,795,1,0,0,0,798,802,3,30,15,0,799,800,
        5,96,0,0,800,802,5,29,0,0,801,770,1,0,0,0,801,798,1,0,0,0,801,799,
        1,0,0,0,802,71,1,0,0,0,803,806,3,94,47,0,804,806,5,96,0,0,805,803,
        1,0,0,0,805,804,1,0,0,0,806,73,1,0,0,0,807,808,5,3,0,0,808,813,3,
        118,59,0,809,811,5,27,0,0,810,809,1,0,0,0,810,811,1,0,0,0,811,812,
        1,0,0,0,812,814,3,130,65,0,813,810,1,0,0,0,813,814,1,0,0,0,814,815,
        1,0,0,0,815,816,5,30,0,0,816,817,3,126,63,0,817,818,5,165,0,0,818,
        826,3,94,47,0,819,820,5,161,0,0,820,821,3,126,63,0,821,822,5,165,
        0,0,822,823,3,94,47,0,823,825,1,0,0,0,824,819,1,0,0,0,825,828,1,
        0,0,0,826,824,1,0,0,0,826,827,1,0,0,0,827,830,1,0,0,0,828,826,1,
        0,0,0,829,831,3,44,22,0,830,829,1,0,0,0,830,831,1,0,0,0,831,833,
        1,0,0,0,832,834,3,52,26,0,833,832,1,0,0,0,833,834,1,0,0,0,834,75,
        1,0,0,0,835,836,5,4,0,0,836,837,5,17,0,0,837,842,3,118,59,0,838,
        840,5,27,0,0,839,838,1,0,0,0,839,840,1,0,0,0,840,841,1,0,0,0,841,
        843,3,130,65,0,842,839,1,0,0,0,842,843,1,0,0,0,843,845,1,0,0,0,844,
        846,3,52,26,0,845,844,1,0,0,0,845,846,1,0,0,0,846,77,1,0,0,0,847,
        848,5,5,0,0,848,849,5,28,0,0,849,854,3,118,59,0,850,852,5,27,0,0,
        851,850,1,0,0,0,851,852,1,0,0,0,852,853,1,0,0,0,853,855,3,130,65,
        0,854,851,1,0,0,0,854,855,1,0,0,0,855,856,1,0,0,0,856,857,5,45,0,
        0,857,858,3,48,24,0,858,859,5,44,0,0,859,861,3,94,47,0,860,862,3,
        80,40,0,861,860,1,0,0,0,862,863,1,0,0,0,863,861,1,0,0,0,863,864,
        1,0,0,0,864,79,1,0,0,0,865,866,5,59,0,0,866,867,5,125,0,0,867,890,
        5,60,0,0,868,869,5,3,0,0,869,870,5,30,0,0,870,871,3,126,63,0,871,
        872,5,165,0,0,872,880,3,94,47,0,873,874,5,161,0,0,874,875,3,126,
        63,0,875,876,5,165,0,0,876,877,3,94,47,0,877,879,1,0,0,0,878,873,
        1,0,0,0,879,882,1,0,0,0,880,878,1,0,0,0,880,881,1,0,0,0,881,884,
        1,0,0,0,882,880,1,0,0,0,883,885,3,52,26,0,884,883,1,0,0,0,884,885,
        1,0,0,0,885,891,1,0,0,0,886,888,5,4,0,0,887,889,3,52,26,0,888,887,
        1,0,0,0,888,889,1,0,0,0,889,891,1,0,0,0,890,868,1,0,0,0,890,886,
        1,0,0,0,891,925,1,0,0,0,892,893,5,59,0,0,893,894,5,48,0,0,894,895,
        5,125,0,0,895,896,5,60,0,0,896,908,5,2,0,0,897,898,5,159,0,0,898,
        903,3,126,63,0,899,900,5,161,0,0,900,902,3,126,63,0,901,899,1,0,
        0,0,902,905,1,0,0,0,903,901,1,0,0,0,903,904,1,0,0,0,904,906,1,0,
        0,0,905,903,1,0,0,0,906,907,5,160,0,0,907,909,1,0,0,0,908,897,1,
        0,0,0,908,909,1,0,0,0,909,910,1,0,0,0,910,911,5,29,0,0,911,912,5,
        159,0,0,912,917,3,72,36,0,913,914,5,161,0,0,914,916,3,72,36,0,915,
        913,1,0,0,0,916,919,1,0,0,0,917,915,1,0,0,0,917,918,1,0,0,0,918,
        920,1,0,0,0,919,917,1,0,0,0,920,922,5,160,0,0,921,923,3,52,26,0,
        922,921,1,0,0,0,922,923,1,0,0,0,923,925,1,0,0,0,924,865,1,0,0,0,
        924,892,1,0,0,0,925,81,1,0,0,0,926,927,5,9,0,0,927,928,5,79,0,0,
        928,929,3,118,59,0,929,83,1,0,0,0,930,932,5,6,0,0,931,933,5,86,0,
        0,932,931,1,0,0,0,932,933,1,0,0,0,933,934,1,0,0,0,934,938,5,78,0,
        0,935,936,5,88,0,0,936,937,5,48,0,0,937,939,5,50,0,0,938,935,1,0,
        0,0,938,939,1,0,0,0,939,940,1,0,0,0,940,941,3,122,61,0,941,85,1,
        0,0,0,942,945,5,6,0,0,943,944,5,47,0,0,944,946,5,89,0,0,945,943,
        1,0,0,0,945,946,1,0,0,0,946,947,1,0,0,0,947,951,5,79,0,0,948,949,
        5,88,0,0,949,950,5,48,0,0,950,952,5,50,0,0,951,948,1,0,0,0,951,952,
        1,0,0,0,952,953,1,0,0,0,953,967,3,118,59,0,954,955,5,159,0,0,955,
        960,3,88,44,0,956,957,5,161,0,0,957,959,3,88,44,0,958,956,1,0,0,
        0,959,962,1,0,0,0,960,958,1,0,0,0,960,961,1,0,0,0,961,963,1,0,0,
        0,962,960,1,0,0,0,963,964,5,160,0,0,964,968,1,0,0,0,965,966,5,27,
        0,0,966,968,3,30,15,0,967,954,1,0,0,0,967,965,1,0,0,0,968,87,1,0,
        0,0,969,970,3,126,63,0,970,973,3,92,46,0,971,972,5,96,0,0,972,974,
        3,94,47,0,973,971,1,0,0,0,973,974,1,0,0,0,974,979,1,0,0,0,975,977,
        5,48,0,0,976,975,1,0,0,0,976,977,1,0,0,0,977,978,1,0,0,0,978,980,
        5,55,0,0,979,976,1,0,0,0,979,980,1,0,0,0,980,983,1,0,0,0,981,982,
        5,92,0,0,982,984,5,93,0,0,983,981,1,0,0,0,983,984,1,0,0,0,984,990,
        1,0,0,0,985,987,5,12,0,0,986,988,5,54,0,0,987,986,1,0,0,0,987,988,
        1,0,0,0,988,989,1,0,0,0,989,991,5,155,0,0,990,985,1,0,0,0,990,991,
        1,0,0,0,991,1027,1,0,0,0,992,994,5,91,0,0,993,995,3,130,65,0,994,
        993,1,0,0,0,994,995,1,0,0,0,995,1000,1,0,0,0,996,997,5,92,0,0,997,
        1001,5,93,0,0,998,999,5,94,0,0,999,1001,5,93,0,0,1000,996,1,0,0,
        0,1000,998,1,0,0,0,1001,1002,1,0,0,0,1002,1003,5,159,0,0,1003,1008,
        3,126,63,0,1004,1005,5,161,0,0,1005,1007,3,126,63,0,1006,1004,1,
        0,0,0,1007,1010,1,0,0,0,1008,1006,1,0,0,0,1008,1009,1,0,0,0,1009,
        1011,1,0,0,0,1010,1008,1,0,0,0,1011,1014,5,160,0,0,1012,1013,5,95,
        0,0,1013,1015,3,118,59,0,1014,1012,1,0,0,0,1014,1015,1,0,0,0,1015,
        1027,1,0,0,0,1016,1017,5,98,0,0,1017,1018,5,20,0,0,1018,1023,3,126,
        63,0,1019,1020,5,161,0,0,1020,1022,3,126,63,0,1021,1019,1,0,0,0,
        1022,1025,1,0,0,0,1023,1021,1,0,0,0,1023,1024,1,0,0,0,1024,1027,
        1,0,0,0,1025,1023,1,0,0,0,1026,969,1,0,0,0,1026,992,1,0,0,0,1026,
        1016,1,0,0,0,1027,89,1,0,0,0,1028,1029,5,8,0,0,1029,1032,7,8,0,0,
        1030,1031,5,88,0,0,1031,1033,5,50,0,0,1032,1030,1,0,0,0,1032,1033,
        1,0,0,0,1033,1034,1,0,0,0,1034,1036,3,118,59,0,1035,1037,5,158,0,
        0,1036,1035,1,0,0,0,1036,1037,1,0,0,0,1037,91,1,0,0,0,1038,1046,
        5,138,0,0,1039,1040,5,159,0,0,1040,1043,5,156,0,0,1041,1042,5,161,
        0,0,1042,1044,5,156,0,0,1043,1041,1,0,0,0,1043,1044,1,0,0,0,1044,
        1045,1,0,0,0,1045,1047,5,160,0,0,1046,1039,1,0,0,0,1046,1047,1,0,
        0,0,1047,1138,1,0,0,0,1048,1049,5,139,0,0,1049,1050,5,159,0,0,1050,
        1051,5,156,0,0,1051,1055,5,160,0,0,1052,1053,5,146,0,0,1053,1054,
        5,30,0,0,1054,1056,7,9,0,0,1055,1052,1,0,0,0,1055,1056,1,0,0,0,1056,
        1138,1,0,0,0,1057,1061,5,140,0,0,1058,1059,5,159,0,0,1059,1060,5,
        156,0,0,1060,1062,5,160,0,0,1061,1058,1,0,0,0,1061,1062,1,0,0,0,
        1062,1138,1,0,0,0,1063,1065,5,146,0,0,1064,1066,5,147,0,0,1065,1064,
        1,0,0,0,1065,1066,1,0,0,0,1066,1070,1,0,0,0,1067,1068,5,159,0,0,
        1068,1069,5,156,0,0,1069,1071,5,160,0,0,1070,1067,1,0,0,0,1070,1071,
        1,0,0,0,1071,1138,1,0,0,0,1072,1138,5,141,0,0,1073,1075,5,142,0,
        0,1074,1076,5,143,0,0,1075,1074,1,0,0,0,1075,1076,1,0,0,0,1076,1138,
        1,0,0,0,1077,1138,5,134,0,0,1078,1087,5,135,0,0,1079,1081,5,26,0,
        0,1080,1082,5,111,0,0,1081,1080,1,0,0,0,1081,1082,1,0,0,0,1082,1083,
        1,0,0,0,1083,1085,5,158,0,0,1084,1086,5,158,0,0,1085,1084,1,0,0,
        0,1085,1086,1,0,0,0,1086,1088,1,0,0,0,1087,1079,1,0,0,0,1087,1088,
        1,0,0,0,1088,1138,1,0,0,0,1089,1090,5,126,0,0,1090,1094,5,128,0,
        0,1091,1092,5,159,0,0,1092,1093,5,156,0,0,1093,1095,5,160,0,0,1094,
        1091,1,0,0,0,1094,1095,1,0,0,0,1095,1096,1,0,0,0,1096,1097,5,127,
        0,0,1097,1138,5,129,0,0,1098,1099,5,126,0,0,1099,1103,5,130,0,0,
        1100,1101,5,159,0,0,1101,1102,5,156,0,0,1102,1104,5,160,0,0,1103,
        1100,1,0,0,0,1103,1104,1,0,0,0,1104,1105,1,0,0,0,1105,1106,5,127,
        0,0,1106,1110,5,133,0,0,1107,1108,5,159,0,0,1108,1109,5,156,0,0,
        1109,1111,5,160,0,0,1110,1107,1,0,0,0,1110,1111,1,0,0,0,1111,1138,
        1,0,0,0,1112,1116,5,144,0,0,1113,1114,5,159,0,0,1114,1115,5,156,
        0,0,1115,1117,5,160,0,0,1116,1113,1,0,0,0,1116,1117,1,0,0,0,1117,
        1138,1,0,0,0,1118,1125,5,145,0,0,1119,1120,5,159,0,0,1120,1122,5,
        156,0,0,1121,1123,5,158,0,0,1122,1121,1,0,0,0,1122,1123,1,0,0,0,
        1123,1124,1,0,0,0,1124,1126,5,160,0,0,1125,1119,1,0,0,0,1125,1126,
        1,0,0,0,1126,1138,1,0,0,0,1127,1135,5,158,0,0,1128,1129,5,159,0,
        0,1129,1132,5,156,0,0,1130,1131,5,161,0,0,1131,1133,5,156,0,0,1132,
        1130,1,0,0,0,1132,1133,1,0,0,0,1133,1134,1,0,0,0,1134,1136,5,160,
        0,0,1135,1128,1,0,0,0,1135,1136,1,0,0,0,1136,1138,1,0,0,0,1137,1038,
        1,0,0,0,1137,1048,1,0,0,0,1137,1057,1,0,0,0,1137,1063,1,0,0,0,1137,
        1072,1,0,0,0,1137,1073,1,0,0,0,1137,1077,1,0,0,0,1137,1078,1,0,0,
        0,1137,1089,1,0,0,0,1137,1098,1,0,0,0,1137,1112,1,0,0,0,1137,1118,
        1,0,0,0,1137,1127,1,0,0,0,1138,93,1,0,0,0,1139,1140,6,47,-1,0,1140,
        1141,5,48,0,0,1141,1144,3,94,47,4,1142,1144,3,96,48,0,1143,1139,
        1,0,0,0,1143,1142,1,0,0,0,1144,1153,1,0,0,0,1145,1146,10,3,0,0,1146,
        1147,5,46,0,0,1147,1152,3,94,47,4,1148,1149,10,2,0,0,1149,1150,5,
        47,0,0,1150,1152,3,94,47,3,1151,1145,1,0,0,0,1151,1148,1,0,0,0,1152,
        1155,1,0,0,0,1153,1151,1,0,0,0,1153,1154,1,0,0,0,1154,95,1,0,0,0,
        1155,1153,1,0,0,0,1156,1157,3,98,49,0,1157,1159,7,10,0,0,1158,1160,
        7,11,0,0,1159,1158,1,0,0,0,1159,1160,1,0,0,0,1160,1166,1,0,0,0,1161,
        1167,3,98,49,0,1162,1163,5,159,0,0,1163,1164,3,30,15,0,1164,1165,
        5,160,0,0,1165,1167,1,0,0,0,1166,1161,1,0,0,0,1166,1162,1,0,0,0,
        1167,1217,1,0,0,0,1168,1170,3,98,49,0,1169,1171,5,48,0,0,1170,1169,
        1,0,0,0,1170,1171,1,0,0,0,1171,1172,1,0,0,0,1172,1173,5,51,0,0,1173,
        1174,3,98,49,0,1174,1175,5,46,0,0,1175,1176,3,98,49,0,1176,1217,
        1,0,0,0,1177,1179,3,98,49,0,1178,1180,5,48,0,0,1179,1178,1,0,0,0,
        1179,1180,1,0,0,0,1180,1181,1,0,0,0,1181,1182,5,49,0,0,1182,1192,
        5,159,0,0,1183,1193,3,30,15,0,1184,1189,3,94,47,0,1185,1186,5,161,
        0,0,1186,1188,3,94,47,0,1187,1185,1,0,0,0,1188,1191,1,0,0,0,1189,
        1187,1,0,0,0,1189,1190,1,0,0,0,1190,1193,1,0,0,0,1191,1189,1,0,0,
        0,1192,1183,1,0,0,0,1192,1184,1,0,0,0,1193,1194,1,0,0,0,1194,1195,
        5,160,0,0,1195,1217,1,0,0,0,1196,1198,3,98,49,0,1197,1199,5,48,0,
        0,1198,1197,1,0,0,0,1198,1199,1,0,0,0,1199,1200,1,0,0,0,1200,1201,
        7,12,0,0,1201,1202,3,98,49,0,1202,1217,1,0,0,0,1203,1204,3,98,49,
        0,1204,1206,5,54,0,0,1205,1207,5,48,0,0,1206,1205,1,0,0,0,1206,1207,
        1,0,0,0,1207,1208,1,0,0,0,1208,1209,5,55,0,0,1209,1217,1,0,0,0,1210,
        1211,5,50,0,0,1211,1212,5,159,0,0,1212,1213,3,30,15,0,1213,1214,
        5,160,0,0,1214,1217,1,0,0,0,1215,1217,3,98,49,0,1216,1156,1,0,0,
        0,1216,1168,1,0,0,0,1216,1177,1,0,0,0,1216,1196,1,0,0,0,1216,1203,
        1,0,0,0,1216,1210,1,0,0,0,1216,1215,1,0,0,0,1217,97,1,0,0,0,1218,
        1219,6,49,-1,0,1219,1220,5,172,0,0,1220,1225,3,98,49,3,1221,1222,
        5,121,0,0,1222,1225,3,98,49,2,1223,1225,3,100,50,0,1224,1218,1,0,
        0,0,1224,1221,1,0,0,0,1224,1223,1,0,0,0,1225,1237,1,0,0,0,1226,1227,
        10,6,0,0,1227,1228,5,174,0,0,1228,1236,3,98,49,7,1229,1230,10,5,
        0,0,1230,1231,7,13,0,0,1231,1236,3,98,49,6,1232,1233,10,4,0,0,1233,
        1234,7,14,0,0,1234,1236,3,98,49,5,1235,1226,1,0,0,0,1235,1229,1,
        0,0,0,1235,1232,1,0,0,0,1236,1239,1,0,0,0,1237,1235,1,0,0,0,1237,
        1238,1,0,0,0,1238,99,1,0,0,0,1239,1237,1,0,0,0,1240,1255,3,134,67,
        0,1241,1255,3,102,51,0,1242,1255,3,104,52,0,1243,1255,3,106,53,0,
        1244,1255,3,108,54,0,1245,1255,3,110,55,0,1246,1255,3,120,60,0,1247,
        1250,5,159,0,0,1248,1251,3,30,15,0,1249,1251,3,94,47,0,1250,1248,
        1,0,0,0,1250,1249,1,0,0,0,1251,1252,1,0,0,0,1252,1253,5,160,0,0,
        1253,1255,1,0,0,0,1254,1240,1,0,0,0,1254,1241,1,0,0,0,1254,1242,
        1,0,0,0,1254,1243,1,0,0,0,1254,1244,1,0,0,0,1254,1245,1,0,0,0,1254,
        1246,1,0,0,0,1254,1247,1,0,0,0,1255,101,1,0,0,0,1256,1258,5,58,0,
        0,1257,1259,3,94,47,0,1258,1257,1,0,0,0,1258,1259,1,0,0,0,1259,1265,
        1,0,0,0,1260,1261,5,59,0,0,1261,1262,3,94,47,0,1262,1263,5,60,0,
        0,1263,1264,3,94,47,0,1264,1266,1,0,0,0,1265,1260,1,0,0,0,1266,1267,
        1,0,0,0,1267,1265,1,0,0,0,1267,1268,1,0,0,0,1268,1271,1,0,0,0,1269,
        1270,5,61,0,0,1270,1272,3,94,47,0,1271,1269,1,0,0,0,1271,1272,1,
        0,0,0,1272,1273,1,0,0,0,1273,1274,5,62,0,0,1274,103,1,0,0,0,1275,
        1276,5,63,0,0,1276,1277,5,159,0,0,1277,1278,3,94,47,0,1278,1279,
        5,27,0,0,1279,1280,3,92,46,0,1280,1281,5,160,0,0,1281,105,1,0,0,
        0,1282,1283,5,136,0,0,1283,1284,5,159,0,0,1284,1285,7,15,0,0,1285,
        1286,5,17,0,0,1286,1287,3,94,47,0,1287,1288,5,160,0,0,1288,107,1,
        0,0,0,1289,1290,5,137,0,0,1290,1291,5,159,0,0,1291,1292,3,94,47,
        0,1292,1293,5,49,0,0,1293,1294,3,94,47,0,1294,1295,5,160,0,0,1295,
        109,1,0,0,0,1296,1297,3,128,64,0,1297,1310,5,159,0,0,1298,1311,5,
        164,0,0,1299,1301,5,36,0,0,1300,1299,1,0,0,0,1300,1301,1,0,0,0,1301,
        1302,1,0,0,0,1302,1307,3,94,47,0,1303,1304,5,161,0,0,1304,1306,3,
        94,47,0,1305,1303,1,0,0,0,1306,1309,1,0,0,0,1307,1305,1,0,0,0,1307,
        1308,1,0,0,0,1308,1311,1,0,0,0,1309,1307,1,0,0,0,1310,1298,1,0,0,
        0,1310,1300,1,0,0,0,1310,1311,1,0,0,0,1311,1312,1,0,0,0,1312,1314,
        5,160,0,0,1313,1315,3,112,56,0,1314,1313,1,0,0,0,1314,1315,1,0,0,
        0,1315,111,1,0,0,0,1316,1317,5,64,0,0,1317,1328,5,159,0,0,1318,1319,
        5,65,0,0,1319,1320,5,20,0,0,1320,1325,3,94,47,0,1321,1322,5,161,
        0,0,1322,1324,3,94,47,0,1323,1321,1,0,0,0,1324,1327,1,0,0,0,1325,
        1323,1,0,0,0,1325,1326,1,0,0,0,1326,1329,1,0,0,0,1327,1325,1,0,0,
        0,1328,1318,1,0,0,0,1328,1329,1,0,0,0,1329,1331,1,0,0,0,1330,1332,
        3,64,32,0,1331,1330,1,0,0,0,1331,1332,1,0,0,0,1332,1334,1,0,0,0,
        1333,1335,3,114,57,0,1334,1333,1,0,0,0,1334,1335,1,0,0,0,1335,1336,
        1,0,0,0,1336,1337,5,160,0,0,1337,113,1,0,0,0,1338,1345,7,16,0,0,
        1339,1346,3,116,58,0,1340,1341,5,51,0,0,1341,1342,3,116,58,0,1342,
        1343,5,46,0,0,1343,1344,3,116,58,0,1344,1346,1,0,0,0,1345,1339,1,
        0,0,0,1345,1340,1,0,0,0,1346,115,1,0,0,0,1347,1348,5,70,0,0,1348,
        1355,7,17,0,0,1349,1350,5,71,0,0,1350,1355,5,72,0,0,1351,1352,3,
        98,49,0,1352,1353,7,17,0,0,1353,1355,1,0,0,0,1354,1347,1,0,0,0,1354,
        1349,1,0,0,0,1354,1351,1,0,0,0,1355,117,1,0,0,0,1356,1357,3,122,
        61,0,1357,1358,5,162,0,0,1358,1360,1,0,0,0,1359,1356,1,0,0,0,1359,
        1360,1,0,0,0,1360,1361,1,0,0,0,1361,1362,3,124,62,0,1362,119,1,0,
        0,0,1363,1364,3,122,61,0,1364,1365,5,162,0,0,1365,1367,1,0,0,0,1366,
        1363,1,0,0,0,1366,1367,1,0,0,0,1367,1368,1,0,0,0,1368,1369,3,124,
        62,0,1369,1370,5,162,0,0,1370,1372,1,0,0,0,1371,1366,1,0,0,0,1371,
        1372,1,0,0,0,1372,1373,1,0,0,0,1373,1374,3,126,63,0,1374,121,1,0,
        0,0,1375,1376,3,132,66,0,1376,123,1,0,0,0,1377,1378,3,132,66,0,1378,
        125,1,0,0,0,1379,1380,3,132,66,0,1380,127,1,0,0,0,1381,1382,3,132,
        66,0,1382,129,1,0,0,0,1383,1384,3,132,66,0,1384,131,1,0,0,0,1385,
        1386,7,18,0,0,1386,133,1,0,0,0,1387,1410,5,155,0,0,1388,1410,5,156,
        0,0,1389,1410,5,55,0,0,1390,1410,5,56,0,0,1391,1410,5,57,0,0,1392,
        1410,5,175,0,0,1393,1394,5,134,0,0,1394,1410,5,155,0,0,1395,1396,
        5,135,0,0,1396,1410,5,155,0,0,1397,1398,5,126,0,0,1398,1399,5,155,
        0,0,1399,1403,7,15,0,0,1400,1401,5,159,0,0,1401,1402,5,156,0,0,1402,
        1404,5,160,0,0,1403,1400,1,0,0,0,1403,1404,1,0,0,0,1404,1407,1,0,
        0,0,1405,1406,5,127,0,0,1406,1408,7,15,0,0,1407,1405,1,0,0,0,1407,
        1408,1,0,0,0,1408,1410,1,0,0,0,1409,1387,1,0,0,0,1409,1388,1,0,0,
        0,1409,1389,1,0,0,0,1409,1390,1,0,0,0,1409,1391,1,0,0,0,1409,1392,
        1,0,0,0,1409,1393,1,0,0,0,1409,1395,1,0,0,0,1409,1397,1,0,0,0,1410,
        135,1,0,0,0,202,141,145,163,174,179,186,190,194,200,208,219,221,
        223,231,238,242,246,252,260,271,273,275,279,286,293,298,304,310,
        318,320,326,331,334,337,347,354,359,368,373,382,393,396,399,407,
        419,421,424,428,431,439,444,449,454,459,463,466,469,472,475,478,
        487,498,505,508,516,526,531,543,549,554,557,559,567,574,579,582,
        588,591,593,598,602,606,609,622,627,635,641,649,653,662,672,684,
        697,710,716,731,736,740,746,752,763,768,777,788,795,801,805,810,
        813,826,830,833,839,842,845,851,854,863,880,884,888,890,903,908,
        917,922,924,932,938,945,951,960,967,973,976,979,983,987,990,994,
        1000,1008,1014,1023,1026,1032,1036,1043,1046,1055,1061,1065,1070,
        1075,1081,1085,1087,1094,1103,1110,1116,1122,1125,1132,1135,1137,
        1143,1151,1153,1159,1166,1170,1179,1189,1192,1198,1206,1216,1224,
        1235,1237,1250,1254,1258,1267,1271,1300,1307,1310,1314,1325,1328,
        1331,1334,1345,1354,1359,1366,1371,1403,1407,1409
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
    public importStatement(): ImportStatementContext | null {
        return this.getRuleContext(0, ImportStatementContext);
    }
    public exportStatement(): ExportStatementContext | null {
        return this.getRuleContext(0, ExportStatementContext);
    }
    public scriptStatement(): ScriptStatementContext | null {
        return this.getRuleContext(0, ScriptStatementContext);
    }
    public executeScriptStatement(): ExecuteScriptStatementContext | null {
        return this.getRuleContext(0, ExecuteScriptStatementContext);
    }
    public createVirtualSchemaStatement(): CreateVirtualSchemaStatementContext | null {
        return this.getRuleContext(0, CreateVirtualSchemaStatementContext);
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


export class ImportStatementContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public IMPORT(): antlr.TerminalNode {
        return this.getToken(ExasolParser.IMPORT, 0)!;
    }
    public INTO(): antlr.TerminalNode {
        return this.getToken(ExasolParser.INTO, 0)!;
    }
    public schemaQualifiedTable(): SchemaQualifiedTableContext {
        return this.getRuleContext(0, SchemaQualifiedTableContext)!;
    }
    public FROM(): antlr.TerminalNode {
        return this.getToken(ExasolParser.FROM, 0)!;
    }
    public importSource(): ImportSourceContext {
        return this.getRuleContext(0, ImportSourceContext)!;
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
    public importOption(): ImportOptionContext[];
    public importOption(i: number): ImportOptionContext | null;
    public importOption(i?: number): ImportOptionContext[] | ImportOptionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ImportOptionContext);
        }

        return this.getRuleContext(i, ImportOptionContext);
    }
    public errorsClause(): ErrorsClauseContext | null {
        return this.getRuleContext(0, ErrorsClauseContext);
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
        return ExasolParser.RULE_importStatement;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterImportStatement) {
             listener.enterImportStatement(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitImportStatement) {
             listener.exitImportStatement(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitImportStatement) {
            return visitor.visitImportStatement(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class ImportSourceContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public LOCAL(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.LOCAL, 0);
    }
    public CSV(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.CSV, 0);
    }
    public FBV(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.FBV, 0);
    }
    public SECURE(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.SECURE, 0);
    }
    public fileClause(): FileClauseContext[];
    public fileClause(i: number): FileClauseContext | null;
    public fileClause(i?: number): FileClauseContext[] | FileClauseContext | null {
        if (i === undefined) {
            return this.getRuleContexts(FileClauseContext);
        }

        return this.getRuleContext(i, FileClauseContext);
    }
    public AT_KW(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.AT_KW, 0);
    }
    public connectionRef(): ConnectionRefContext | null {
        return this.getRuleContext(0, ConnectionRefContext);
    }
    public JDBC(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.JDBC, 0);
    }
    public EXA(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.EXA, 0);
    }
    public TABLE(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.TABLE, 0);
    }
    public schemaQualifiedTable(): SchemaQualifiedTableContext | null {
        return this.getRuleContext(0, SchemaQualifiedTableContext);
    }
    public STATEMENT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.STATEMENT, 0);
    }
    public STRING(): antlr.TerminalNode[];
    public STRING(i: number): antlr.TerminalNode | null;
    public STRING(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.STRING);
    	} else {
    		return this.getToken(ExasolParser.STRING, i);
    	}
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_importSource;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterImportSource) {
             listener.enterImportSource(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitImportSource) {
             listener.exitImportSource(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitImportSource) {
            return visitor.visitImportSource(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class ExportStatementContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public EXPORT(): antlr.TerminalNode {
        return this.getToken(ExasolParser.EXPORT, 0)!;
    }
    public INTO(): antlr.TerminalNode {
        return this.getToken(ExasolParser.INTO, 0)!;
    }
    public exportTarget(): ExportTargetContext {
        return this.getRuleContext(0, ExportTargetContext)!;
    }
    public schemaQualifiedTable(): SchemaQualifiedTableContext | null {
        return this.getRuleContext(0, SchemaQualifiedTableContext);
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
    public importOption(): ImportOptionContext[];
    public importOption(i: number): ImportOptionContext | null;
    public importOption(i?: number): ImportOptionContext[] | ImportOptionContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ImportOptionContext);
        }

        return this.getRuleContext(i, ImportOptionContext);
    }
    public errorsClause(): ErrorsClauseContext | null {
        return this.getRuleContext(0, ErrorsClauseContext);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_exportStatement;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterExportStatement) {
             listener.enterExportStatement(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitExportStatement) {
             listener.exitExportStatement(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitExportStatement) {
            return visitor.visitExportStatement(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class ExportTargetContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public LOCAL(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.LOCAL, 0);
    }
    public CSV(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.CSV, 0);
    }
    public FBV(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.FBV, 0);
    }
    public SECURE(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.SECURE, 0);
    }
    public fileClause(): FileClauseContext[];
    public fileClause(i: number): FileClauseContext | null;
    public fileClause(i?: number): FileClauseContext[] | FileClauseContext | null {
        if (i === undefined) {
            return this.getRuleContexts(FileClauseContext);
        }

        return this.getRuleContext(i, FileClauseContext);
    }
    public AT_KW(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.AT_KW, 0);
    }
    public connectionRef(): ConnectionRefContext | null {
        return this.getRuleContext(0, ConnectionRefContext);
    }
    public JDBC(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.JDBC, 0);
    }
    public EXA(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.EXA, 0);
    }
    public TABLE(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.TABLE, 0);
    }
    public schemaQualifiedTable(): SchemaQualifiedTableContext | null {
        return this.getRuleContext(0, SchemaQualifiedTableContext);
    }
    public STATEMENT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.STATEMENT, 0);
    }
    public STRING(): antlr.TerminalNode[];
    public STRING(i: number): antlr.TerminalNode | null;
    public STRING(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.STRING);
    	} else {
    		return this.getToken(ExasolParser.STRING, i);
    	}
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_exportTarget;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterExportTarget) {
             listener.enterExportTarget(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitExportTarget) {
             listener.exitExportTarget(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitExportTarget) {
            return visitor.visitExportTarget(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class ConnectionRefContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public identifier(): IdentifierContext | null {
        return this.getRuleContext(0, IdentifierContext);
    }
    public STRING(): antlr.TerminalNode[];
    public STRING(i: number): antlr.TerminalNode | null;
    public STRING(i?: number): antlr.TerminalNode | null | antlr.TerminalNode[] {
    	if (i === undefined) {
    		return this.getTokens(ExasolParser.STRING);
    	} else {
    		return this.getToken(ExasolParser.STRING, i);
    	}
    }
    public USER(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.USER, 0);
    }
    public IDENTIFIED(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.IDENTIFIED, 0);
    }
    public BY(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.BY, 0);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_connectionRef;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterConnectionRef) {
             listener.enterConnectionRef(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitConnectionRef) {
             listener.exitConnectionRef(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitConnectionRef) {
            return visitor.visitConnectionRef(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class FileClauseContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public FILE_KW(): antlr.TerminalNode {
        return this.getToken(ExasolParser.FILE_KW, 0)!;
    }
    public STRING(): antlr.TerminalNode {
        return this.getToken(ExasolParser.STRING, 0)!;
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_fileClause;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterFileClause) {
             listener.enterFileClause(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitFileClause) {
             listener.exitFileClause(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitFileClause) {
            return visitor.visitFileClause(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class ImportOptionContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public ENCODING(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.ENCODING, 0);
    }
    public STRING(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.STRING, 0);
    }
    public EQ(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.EQ, 0);
    }
    public SKIP_KW(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.SKIP_KW, 0);
    }
    public NUMBER(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.NUMBER, 0);
    }
    public ROW(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.ROW, 0);
    }
    public IDENT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.IDENT, 0);
    }
    public COLUMN(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.COLUMN, 0);
    }
    public identifier(): IdentifierContext[];
    public identifier(i: number): IdentifierContext | null;
    public identifier(i?: number): IdentifierContext[] | IdentifierContext | null {
        if (i === undefined) {
            return this.getRuleContexts(IdentifierContext);
        }

        return this.getRuleContext(i, IdentifierContext);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_importOption;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterImportOption) {
             listener.enterImportOption(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitImportOption) {
             listener.exitImportOption(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitImportOption) {
            return visitor.visitImportOption(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class ErrorsClauseContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public REJECT_KW(): antlr.TerminalNode {
        return this.getToken(ExasolParser.REJECT_KW, 0)!;
    }
    public LIMIT(): antlr.TerminalNode {
        return this.getToken(ExasolParser.LIMIT, 0)!;
    }
    public NUMBER(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.NUMBER, 0);
    }
    public IDENT(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.IDENT, 0);
    }
    public ERRORS(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.ERRORS, 0);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_errorsClause;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterErrorsClause) {
             listener.enterErrorsClause(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitErrorsClause) {
             listener.exitErrorsClause(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitErrorsClause) {
            return visitor.visitErrorsClause(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class ScriptStatementContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public CREATE(): antlr.TerminalNode {
        return this.getToken(ExasolParser.CREATE, 0)!;
    }
    public SCRIPT(): antlr.TerminalNode {
        return this.getToken(ExasolParser.SCRIPT, 0)!;
    }
    public schemaQualifiedTable(): SchemaQualifiedTableContext {
        return this.getRuleContext(0, SchemaQualifiedTableContext)!;
    }
    public AS(): antlr.TerminalNode {
        return this.getToken(ExasolParser.AS, 0)!;
    }
    public SCRIPT_BODY(): antlr.TerminalNode {
        return this.getToken(ExasolParser.SCRIPT_BODY, 0)!;
    }
    public OR(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.OR, 0);
    }
    public REPLACE(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.REPLACE, 0);
    }
    public scriptLang(): ScriptLangContext | null {
        return this.getRuleContext(0, ScriptLangContext);
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
    public scriptParam(): ScriptParamContext[];
    public scriptParam(i: number): ScriptParamContext | null;
    public scriptParam(i?: number): ScriptParamContext[] | ScriptParamContext | null {
        if (i === undefined) {
            return this.getRuleContexts(ScriptParamContext);
        }

        return this.getRuleContext(i, ScriptParamContext);
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
    public RETURNS(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.RETURNS, 0);
    }
    public EMITS(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.EMITS, 0);
    }
    public SCALAR(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.SCALAR, 0);
    }
    public SET(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.SET, 0);
    }
    public dataType(): DataTypeContext | null {
        return this.getRuleContext(0, DataTypeContext);
    }
    public TABLE(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.TABLE, 0);
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
        return ExasolParser.RULE_scriptStatement;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterScriptStatement) {
             listener.enterScriptStatement(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitScriptStatement) {
             listener.exitScriptStatement(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitScriptStatement) {
            return visitor.visitScriptStatement(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class ScriptLangContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public PYTHON3(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.PYTHON3, 0);
    }
    public LUA(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.LUA, 0);
    }
    public JAVA(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.JAVA, 0);
    }
    public R_LANG(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.R_LANG, 0);
    }
    public ADAPTER(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.ADAPTER, 0);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_scriptLang;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterScriptLang) {
             listener.enterScriptLang(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitScriptLang) {
             listener.exitScriptLang(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitScriptLang) {
            return visitor.visitScriptLang(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class ScriptParamContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public columnName(): ColumnNameContext {
        return this.getRuleContext(0, ColumnNameContext)!;
    }
    public dataType(): DataTypeContext | null {
        return this.getRuleContext(0, DataTypeContext);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_scriptParam;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterScriptParam) {
             listener.enterScriptParam(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitScriptParam) {
             listener.exitScriptParam(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitScriptParam) {
            return visitor.visitScriptParam(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class ExecuteScriptStatementContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public EXECUTE(): antlr.TerminalNode {
        return this.getToken(ExasolParser.EXECUTE, 0)!;
    }
    public SCRIPT(): antlr.TerminalNode {
        return this.getToken(ExasolParser.SCRIPT, 0)!;
    }
    public schemaQualifiedTable(): SchemaQualifiedTableContext {
        return this.getRuleContext(0, SchemaQualifiedTableContext)!;
    }
    public LPAREN(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.LPAREN, 0);
    }
    public RPAREN(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.RPAREN, 0);
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
        return ExasolParser.RULE_executeScriptStatement;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterExecuteScriptStatement) {
             listener.enterExecuteScriptStatement(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitExecuteScriptStatement) {
             listener.exitExecuteScriptStatement(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitExecuteScriptStatement) {
            return visitor.visitExecuteScriptStatement(this);
        } else {
            return visitor.visitChildren(this);
        }
    }
}


export class CreateVirtualSchemaStatementContext extends antlr.ParserRuleContext {
    public constructor(parent: antlr.ParserRuleContext | null, invokingState: number) {
        super(parent, invokingState);
    }
    public CREATE(): antlr.TerminalNode {
        return this.getToken(ExasolParser.CREATE, 0)!;
    }
    public VIRTUAL(): antlr.TerminalNode {
        return this.getToken(ExasolParser.VIRTUAL, 0)!;
    }
    public SCHEMA(): antlr.TerminalNode {
        return this.getToken(ExasolParser.SCHEMA, 0)!;
    }
    public schemaName(): SchemaNameContext {
        return this.getRuleContext(0, SchemaNameContext)!;
    }
    public USING(): antlr.TerminalNode {
        return this.getToken(ExasolParser.USING, 0)!;
    }
    public schemaQualifiedTable(): SchemaQualifiedTableContext {
        return this.getRuleContext(0, SchemaQualifiedTableContext)!;
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
    public WITH(): antlr.TerminalNode | null {
        return this.getToken(ExasolParser.WITH, 0);
    }
    public identifier(): IdentifierContext[];
    public identifier(i: number): IdentifierContext | null;
    public identifier(i?: number): IdentifierContext[] | IdentifierContext | null {
        if (i === undefined) {
            return this.getRuleContexts(IdentifierContext);
        }

        return this.getRuleContext(i, IdentifierContext);
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
    public literal(): LiteralContext[];
    public literal(i: number): LiteralContext | null;
    public literal(i?: number): LiteralContext[] | LiteralContext | null {
        if (i === undefined) {
            return this.getRuleContexts(LiteralContext);
        }

        return this.getRuleContext(i, LiteralContext);
    }
    public override get ruleIndex(): number {
        return ExasolParser.RULE_createVirtualSchemaStatement;
    }
    public override enterRule(listener: ExasolParserListener): void {
        if(listener.enterCreateVirtualSchemaStatement) {
             listener.enterCreateVirtualSchemaStatement(this);
        }
    }
    public override exitRule(listener: ExasolParserListener): void {
        if(listener.exitCreateVirtualSchemaStatement) {
             listener.exitCreateVirtualSchemaStatement(this);
        }
    }
    public override accept<Result>(visitor: ExasolParserVisitor<Result>): Result | null {
        if (visitor.visitCreateVirtualSchemaStatement) {
            return visitor.visitCreateVirtualSchemaStatement(this);
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
