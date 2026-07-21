// Generated from src/grammar/ExasolParser.g4 by ANTLR 4.13.1

import { ErrorNode, ParserRuleContext, TerminalNode } from "antlr4ng";
import type { ParseTreeListener } from "antlr4ng";


import { ProgramContext } from "./ExasolParser.ts";
import { StatementContext } from "./ExasolParser.ts";
import { ImportStatementContext } from "./ExasolParser.ts";
import { ImportSourceContext } from "./ExasolParser.ts";
import { ExportStatementContext } from "./ExasolParser.ts";
import { ExportTargetContext } from "./ExasolParser.ts";
import { ConnectionRefContext } from "./ExasolParser.ts";
import { FileClauseContext } from "./ExasolParser.ts";
import { ImportOptionContext } from "./ExasolParser.ts";
import { ErrorsClauseContext } from "./ExasolParser.ts";
import { ScriptStatementContext } from "./ExasolParser.ts";
import { ScriptLangContext } from "./ExasolParser.ts";
import { ScriptParamContext } from "./ExasolParser.ts";
import { ExecuteScriptStatementContext } from "./ExasolParser.ts";
import { CreateVirtualSchemaStatementContext } from "./ExasolParser.ts";
import { SelectStatementContext } from "./ExasolParser.ts";
import { QueryExpressionContext } from "./ExasolParser.ts";
import { QuerySpecContext } from "./ExasolParser.ts";
import { WithClauseContext } from "./ExasolParser.ts";
import { CteItemContext } from "./ExasolParser.ts";
import { SelectListContext } from "./ExasolParser.ts";
import { SelectItemContext } from "./ExasolParser.ts";
import { FromClauseContext } from "./ExasolParser.ts";
import { TableRefContext } from "./ExasolParser.ts";
import { TablePrimaryContext } from "./ExasolParser.ts";
import { JoinClauseContext } from "./ExasolParser.ts";
import { WhereClauseContext } from "./ExasolParser.ts";
import { ConnectByClauseContext } from "./ExasolParser.ts";
import { GroupByClauseContext } from "./ExasolParser.ts";
import { GroupItemContext } from "./ExasolParser.ts";
import { HavingClauseContext } from "./ExasolParser.ts";
import { QualifyClauseContext } from "./ExasolParser.ts";
import { OrderByClauseContext } from "./ExasolParser.ts";
import { OrderItemContext } from "./ExasolParser.ts";
import { LimitClauseContext } from "./ExasolParser.ts";
import { InsertStatementContext } from "./ExasolParser.ts";
import { InsertValueContext } from "./ExasolParser.ts";
import { UpdateStatementContext } from "./ExasolParser.ts";
import { DeleteStatementContext } from "./ExasolParser.ts";
import { MergeStatementContext } from "./ExasolParser.ts";
import { MergeWhenContext } from "./ExasolParser.ts";
import { TruncateStatementContext } from "./ExasolParser.ts";
import { CreateSchemaStatementContext } from "./ExasolParser.ts";
import { CreateTableStatementContext } from "./ExasolParser.ts";
import { TableElementContext } from "./ExasolParser.ts";
import { DropStatementContext } from "./ExasolParser.ts";
import { DataTypeContext } from "./ExasolParser.ts";
import { ExpressionContext } from "./ExasolParser.ts";
import { PredicateContext } from "./ExasolParser.ts";
import { ValueExprContext } from "./ExasolParser.ts";
import { PrimaryExprContext } from "./ExasolParser.ts";
import { CaseExprContext } from "./ExasolParser.ts";
import { CastExprContext } from "./ExasolParser.ts";
import { ExtractExprContext } from "./ExasolParser.ts";
import { PositionExprContext } from "./ExasolParser.ts";
import { FunctionCallContext } from "./ExasolParser.ts";
import { OverClauseContext } from "./ExasolParser.ts";
import { WindowFrameContext } from "./ExasolParser.ts";
import { FrameBoundContext } from "./ExasolParser.ts";
import { SchemaQualifiedTableContext } from "./ExasolParser.ts";
import { ColumnRefContext } from "./ExasolParser.ts";
import { SchemaNameContext } from "./ExasolParser.ts";
import { TableNameContext } from "./ExasolParser.ts";
import { ColumnNameContext } from "./ExasolParser.ts";
import { FunctionNameContext } from "./ExasolParser.ts";
import { AliasContext } from "./ExasolParser.ts";
import { IdentifierContext } from "./ExasolParser.ts";
import { LiteralContext } from "./ExasolParser.ts";


/**
 * This interface defines a complete listener for a parse tree produced by
 * `ExasolParser`.
 */
export class ExasolParserListener implements ParseTreeListener {
    /**
     * Enter a parse tree produced by `ExasolParser.program`.
     * @param ctx the parse tree
     */
    enterProgram?: (ctx: ProgramContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.program`.
     * @param ctx the parse tree
     */
    exitProgram?: (ctx: ProgramContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.statement`.
     * @param ctx the parse tree
     */
    enterStatement?: (ctx: StatementContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.statement`.
     * @param ctx the parse tree
     */
    exitStatement?: (ctx: StatementContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.importStatement`.
     * @param ctx the parse tree
     */
    enterImportStatement?: (ctx: ImportStatementContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.importStatement`.
     * @param ctx the parse tree
     */
    exitImportStatement?: (ctx: ImportStatementContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.importSource`.
     * @param ctx the parse tree
     */
    enterImportSource?: (ctx: ImportSourceContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.importSource`.
     * @param ctx the parse tree
     */
    exitImportSource?: (ctx: ImportSourceContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.exportStatement`.
     * @param ctx the parse tree
     */
    enterExportStatement?: (ctx: ExportStatementContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.exportStatement`.
     * @param ctx the parse tree
     */
    exitExportStatement?: (ctx: ExportStatementContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.exportTarget`.
     * @param ctx the parse tree
     */
    enterExportTarget?: (ctx: ExportTargetContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.exportTarget`.
     * @param ctx the parse tree
     */
    exitExportTarget?: (ctx: ExportTargetContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.connectionRef`.
     * @param ctx the parse tree
     */
    enterConnectionRef?: (ctx: ConnectionRefContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.connectionRef`.
     * @param ctx the parse tree
     */
    exitConnectionRef?: (ctx: ConnectionRefContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.fileClause`.
     * @param ctx the parse tree
     */
    enterFileClause?: (ctx: FileClauseContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.fileClause`.
     * @param ctx the parse tree
     */
    exitFileClause?: (ctx: FileClauseContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.importOption`.
     * @param ctx the parse tree
     */
    enterImportOption?: (ctx: ImportOptionContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.importOption`.
     * @param ctx the parse tree
     */
    exitImportOption?: (ctx: ImportOptionContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.errorsClause`.
     * @param ctx the parse tree
     */
    enterErrorsClause?: (ctx: ErrorsClauseContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.errorsClause`.
     * @param ctx the parse tree
     */
    exitErrorsClause?: (ctx: ErrorsClauseContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.scriptStatement`.
     * @param ctx the parse tree
     */
    enterScriptStatement?: (ctx: ScriptStatementContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.scriptStatement`.
     * @param ctx the parse tree
     */
    exitScriptStatement?: (ctx: ScriptStatementContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.scriptLang`.
     * @param ctx the parse tree
     */
    enterScriptLang?: (ctx: ScriptLangContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.scriptLang`.
     * @param ctx the parse tree
     */
    exitScriptLang?: (ctx: ScriptLangContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.scriptParam`.
     * @param ctx the parse tree
     */
    enterScriptParam?: (ctx: ScriptParamContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.scriptParam`.
     * @param ctx the parse tree
     */
    exitScriptParam?: (ctx: ScriptParamContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.executeScriptStatement`.
     * @param ctx the parse tree
     */
    enterExecuteScriptStatement?: (ctx: ExecuteScriptStatementContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.executeScriptStatement`.
     * @param ctx the parse tree
     */
    exitExecuteScriptStatement?: (ctx: ExecuteScriptStatementContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.createVirtualSchemaStatement`.
     * @param ctx the parse tree
     */
    enterCreateVirtualSchemaStatement?: (ctx: CreateVirtualSchemaStatementContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.createVirtualSchemaStatement`.
     * @param ctx the parse tree
     */
    exitCreateVirtualSchemaStatement?: (ctx: CreateVirtualSchemaStatementContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.selectStatement`.
     * @param ctx the parse tree
     */
    enterSelectStatement?: (ctx: SelectStatementContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.selectStatement`.
     * @param ctx the parse tree
     */
    exitSelectStatement?: (ctx: SelectStatementContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.queryExpression`.
     * @param ctx the parse tree
     */
    enterQueryExpression?: (ctx: QueryExpressionContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.queryExpression`.
     * @param ctx the parse tree
     */
    exitQueryExpression?: (ctx: QueryExpressionContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.querySpec`.
     * @param ctx the parse tree
     */
    enterQuerySpec?: (ctx: QuerySpecContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.querySpec`.
     * @param ctx the parse tree
     */
    exitQuerySpec?: (ctx: QuerySpecContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.withClause`.
     * @param ctx the parse tree
     */
    enterWithClause?: (ctx: WithClauseContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.withClause`.
     * @param ctx the parse tree
     */
    exitWithClause?: (ctx: WithClauseContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.cteItem`.
     * @param ctx the parse tree
     */
    enterCteItem?: (ctx: CteItemContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.cteItem`.
     * @param ctx the parse tree
     */
    exitCteItem?: (ctx: CteItemContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.selectList`.
     * @param ctx the parse tree
     */
    enterSelectList?: (ctx: SelectListContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.selectList`.
     * @param ctx the parse tree
     */
    exitSelectList?: (ctx: SelectListContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.selectItem`.
     * @param ctx the parse tree
     */
    enterSelectItem?: (ctx: SelectItemContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.selectItem`.
     * @param ctx the parse tree
     */
    exitSelectItem?: (ctx: SelectItemContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.fromClause`.
     * @param ctx the parse tree
     */
    enterFromClause?: (ctx: FromClauseContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.fromClause`.
     * @param ctx the parse tree
     */
    exitFromClause?: (ctx: FromClauseContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.tableRef`.
     * @param ctx the parse tree
     */
    enterTableRef?: (ctx: TableRefContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.tableRef`.
     * @param ctx the parse tree
     */
    exitTableRef?: (ctx: TableRefContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.tablePrimary`.
     * @param ctx the parse tree
     */
    enterTablePrimary?: (ctx: TablePrimaryContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.tablePrimary`.
     * @param ctx the parse tree
     */
    exitTablePrimary?: (ctx: TablePrimaryContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.joinClause`.
     * @param ctx the parse tree
     */
    enterJoinClause?: (ctx: JoinClauseContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.joinClause`.
     * @param ctx the parse tree
     */
    exitJoinClause?: (ctx: JoinClauseContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.whereClause`.
     * @param ctx the parse tree
     */
    enterWhereClause?: (ctx: WhereClauseContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.whereClause`.
     * @param ctx the parse tree
     */
    exitWhereClause?: (ctx: WhereClauseContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.connectByClause`.
     * @param ctx the parse tree
     */
    enterConnectByClause?: (ctx: ConnectByClauseContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.connectByClause`.
     * @param ctx the parse tree
     */
    exitConnectByClause?: (ctx: ConnectByClauseContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.groupByClause`.
     * @param ctx the parse tree
     */
    enterGroupByClause?: (ctx: GroupByClauseContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.groupByClause`.
     * @param ctx the parse tree
     */
    exitGroupByClause?: (ctx: GroupByClauseContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.groupItem`.
     * @param ctx the parse tree
     */
    enterGroupItem?: (ctx: GroupItemContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.groupItem`.
     * @param ctx the parse tree
     */
    exitGroupItem?: (ctx: GroupItemContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.havingClause`.
     * @param ctx the parse tree
     */
    enterHavingClause?: (ctx: HavingClauseContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.havingClause`.
     * @param ctx the parse tree
     */
    exitHavingClause?: (ctx: HavingClauseContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.qualifyClause`.
     * @param ctx the parse tree
     */
    enterQualifyClause?: (ctx: QualifyClauseContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.qualifyClause`.
     * @param ctx the parse tree
     */
    exitQualifyClause?: (ctx: QualifyClauseContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.orderByClause`.
     * @param ctx the parse tree
     */
    enterOrderByClause?: (ctx: OrderByClauseContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.orderByClause`.
     * @param ctx the parse tree
     */
    exitOrderByClause?: (ctx: OrderByClauseContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.orderItem`.
     * @param ctx the parse tree
     */
    enterOrderItem?: (ctx: OrderItemContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.orderItem`.
     * @param ctx the parse tree
     */
    exitOrderItem?: (ctx: OrderItemContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.limitClause`.
     * @param ctx the parse tree
     */
    enterLimitClause?: (ctx: LimitClauseContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.limitClause`.
     * @param ctx the parse tree
     */
    exitLimitClause?: (ctx: LimitClauseContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.insertStatement`.
     * @param ctx the parse tree
     */
    enterInsertStatement?: (ctx: InsertStatementContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.insertStatement`.
     * @param ctx the parse tree
     */
    exitInsertStatement?: (ctx: InsertStatementContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.insertValue`.
     * @param ctx the parse tree
     */
    enterInsertValue?: (ctx: InsertValueContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.insertValue`.
     * @param ctx the parse tree
     */
    exitInsertValue?: (ctx: InsertValueContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.updateStatement`.
     * @param ctx the parse tree
     */
    enterUpdateStatement?: (ctx: UpdateStatementContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.updateStatement`.
     * @param ctx the parse tree
     */
    exitUpdateStatement?: (ctx: UpdateStatementContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.deleteStatement`.
     * @param ctx the parse tree
     */
    enterDeleteStatement?: (ctx: DeleteStatementContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.deleteStatement`.
     * @param ctx the parse tree
     */
    exitDeleteStatement?: (ctx: DeleteStatementContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.mergeStatement`.
     * @param ctx the parse tree
     */
    enterMergeStatement?: (ctx: MergeStatementContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.mergeStatement`.
     * @param ctx the parse tree
     */
    exitMergeStatement?: (ctx: MergeStatementContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.mergeWhen`.
     * @param ctx the parse tree
     */
    enterMergeWhen?: (ctx: MergeWhenContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.mergeWhen`.
     * @param ctx the parse tree
     */
    exitMergeWhen?: (ctx: MergeWhenContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.truncateStatement`.
     * @param ctx the parse tree
     */
    enterTruncateStatement?: (ctx: TruncateStatementContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.truncateStatement`.
     * @param ctx the parse tree
     */
    exitTruncateStatement?: (ctx: TruncateStatementContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.createSchemaStatement`.
     * @param ctx the parse tree
     */
    enterCreateSchemaStatement?: (ctx: CreateSchemaStatementContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.createSchemaStatement`.
     * @param ctx the parse tree
     */
    exitCreateSchemaStatement?: (ctx: CreateSchemaStatementContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.createTableStatement`.
     * @param ctx the parse tree
     */
    enterCreateTableStatement?: (ctx: CreateTableStatementContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.createTableStatement`.
     * @param ctx the parse tree
     */
    exitCreateTableStatement?: (ctx: CreateTableStatementContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.tableElement`.
     * @param ctx the parse tree
     */
    enterTableElement?: (ctx: TableElementContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.tableElement`.
     * @param ctx the parse tree
     */
    exitTableElement?: (ctx: TableElementContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.dropStatement`.
     * @param ctx the parse tree
     */
    enterDropStatement?: (ctx: DropStatementContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.dropStatement`.
     * @param ctx the parse tree
     */
    exitDropStatement?: (ctx: DropStatementContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.dataType`.
     * @param ctx the parse tree
     */
    enterDataType?: (ctx: DataTypeContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.dataType`.
     * @param ctx the parse tree
     */
    exitDataType?: (ctx: DataTypeContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.expression`.
     * @param ctx the parse tree
     */
    enterExpression?: (ctx: ExpressionContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.expression`.
     * @param ctx the parse tree
     */
    exitExpression?: (ctx: ExpressionContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.predicate`.
     * @param ctx the parse tree
     */
    enterPredicate?: (ctx: PredicateContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.predicate`.
     * @param ctx the parse tree
     */
    exitPredicate?: (ctx: PredicateContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.valueExpr`.
     * @param ctx the parse tree
     */
    enterValueExpr?: (ctx: ValueExprContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.valueExpr`.
     * @param ctx the parse tree
     */
    exitValueExpr?: (ctx: ValueExprContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.primaryExpr`.
     * @param ctx the parse tree
     */
    enterPrimaryExpr?: (ctx: PrimaryExprContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.primaryExpr`.
     * @param ctx the parse tree
     */
    exitPrimaryExpr?: (ctx: PrimaryExprContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.caseExpr`.
     * @param ctx the parse tree
     */
    enterCaseExpr?: (ctx: CaseExprContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.caseExpr`.
     * @param ctx the parse tree
     */
    exitCaseExpr?: (ctx: CaseExprContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.castExpr`.
     * @param ctx the parse tree
     */
    enterCastExpr?: (ctx: CastExprContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.castExpr`.
     * @param ctx the parse tree
     */
    exitCastExpr?: (ctx: CastExprContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.extractExpr`.
     * @param ctx the parse tree
     */
    enterExtractExpr?: (ctx: ExtractExprContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.extractExpr`.
     * @param ctx the parse tree
     */
    exitExtractExpr?: (ctx: ExtractExprContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.positionExpr`.
     * @param ctx the parse tree
     */
    enterPositionExpr?: (ctx: PositionExprContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.positionExpr`.
     * @param ctx the parse tree
     */
    exitPositionExpr?: (ctx: PositionExprContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.functionCall`.
     * @param ctx the parse tree
     */
    enterFunctionCall?: (ctx: FunctionCallContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.functionCall`.
     * @param ctx the parse tree
     */
    exitFunctionCall?: (ctx: FunctionCallContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.overClause`.
     * @param ctx the parse tree
     */
    enterOverClause?: (ctx: OverClauseContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.overClause`.
     * @param ctx the parse tree
     */
    exitOverClause?: (ctx: OverClauseContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.windowFrame`.
     * @param ctx the parse tree
     */
    enterWindowFrame?: (ctx: WindowFrameContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.windowFrame`.
     * @param ctx the parse tree
     */
    exitWindowFrame?: (ctx: WindowFrameContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.frameBound`.
     * @param ctx the parse tree
     */
    enterFrameBound?: (ctx: FrameBoundContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.frameBound`.
     * @param ctx the parse tree
     */
    exitFrameBound?: (ctx: FrameBoundContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.schemaQualifiedTable`.
     * @param ctx the parse tree
     */
    enterSchemaQualifiedTable?: (ctx: SchemaQualifiedTableContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.schemaQualifiedTable`.
     * @param ctx the parse tree
     */
    exitSchemaQualifiedTable?: (ctx: SchemaQualifiedTableContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.columnRef`.
     * @param ctx the parse tree
     */
    enterColumnRef?: (ctx: ColumnRefContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.columnRef`.
     * @param ctx the parse tree
     */
    exitColumnRef?: (ctx: ColumnRefContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.schemaName`.
     * @param ctx the parse tree
     */
    enterSchemaName?: (ctx: SchemaNameContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.schemaName`.
     * @param ctx the parse tree
     */
    exitSchemaName?: (ctx: SchemaNameContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.tableName`.
     * @param ctx the parse tree
     */
    enterTableName?: (ctx: TableNameContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.tableName`.
     * @param ctx the parse tree
     */
    exitTableName?: (ctx: TableNameContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.columnName`.
     * @param ctx the parse tree
     */
    enterColumnName?: (ctx: ColumnNameContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.columnName`.
     * @param ctx the parse tree
     */
    exitColumnName?: (ctx: ColumnNameContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.functionName`.
     * @param ctx the parse tree
     */
    enterFunctionName?: (ctx: FunctionNameContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.functionName`.
     * @param ctx the parse tree
     */
    exitFunctionName?: (ctx: FunctionNameContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.alias`.
     * @param ctx the parse tree
     */
    enterAlias?: (ctx: AliasContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.alias`.
     * @param ctx the parse tree
     */
    exitAlias?: (ctx: AliasContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.identifier`.
     * @param ctx the parse tree
     */
    enterIdentifier?: (ctx: IdentifierContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.identifier`.
     * @param ctx the parse tree
     */
    exitIdentifier?: (ctx: IdentifierContext) => void;
    /**
     * Enter a parse tree produced by `ExasolParser.literal`.
     * @param ctx the parse tree
     */
    enterLiteral?: (ctx: LiteralContext) => void;
    /**
     * Exit a parse tree produced by `ExasolParser.literal`.
     * @param ctx the parse tree
     */
    exitLiteral?: (ctx: LiteralContext) => void;

    visitTerminal(node: TerminalNode): void {}
    visitErrorNode(node: ErrorNode): void {}
    enterEveryRule(node: ParserRuleContext): void {}
    exitEveryRule(node: ParserRuleContext): void {}
}

