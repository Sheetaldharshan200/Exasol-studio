// Generated from src/grammar/ExasolParser.g4 by ANTLR 4.13.1

import { AbstractParseTreeVisitor } from "antlr4ng";


import { ProgramContext } from "./ExasolParser.ts";
import { StatementContext } from "./ExasolParser.ts";
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
 * This interface defines a complete generic visitor for a parse tree produced
 * by `ExasolParser`.
 *
 * @param <Result> The return type of the visit operation. Use `void` for
 * operations with no return type.
 */
export class ExasolParserVisitor<Result> extends AbstractParseTreeVisitor<Result> {
    /**
     * Visit a parse tree produced by `ExasolParser.program`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitProgram?: (ctx: ProgramContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.statement`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitStatement?: (ctx: StatementContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.selectStatement`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitSelectStatement?: (ctx: SelectStatementContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.queryExpression`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitQueryExpression?: (ctx: QueryExpressionContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.querySpec`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitQuerySpec?: (ctx: QuerySpecContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.withClause`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitWithClause?: (ctx: WithClauseContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.cteItem`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitCteItem?: (ctx: CteItemContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.selectList`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitSelectList?: (ctx: SelectListContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.selectItem`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitSelectItem?: (ctx: SelectItemContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.fromClause`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitFromClause?: (ctx: FromClauseContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.tableRef`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitTableRef?: (ctx: TableRefContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.tablePrimary`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitTablePrimary?: (ctx: TablePrimaryContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.joinClause`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitJoinClause?: (ctx: JoinClauseContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.whereClause`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitWhereClause?: (ctx: WhereClauseContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.connectByClause`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitConnectByClause?: (ctx: ConnectByClauseContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.groupByClause`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitGroupByClause?: (ctx: GroupByClauseContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.groupItem`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitGroupItem?: (ctx: GroupItemContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.havingClause`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitHavingClause?: (ctx: HavingClauseContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.qualifyClause`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitQualifyClause?: (ctx: QualifyClauseContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.orderByClause`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitOrderByClause?: (ctx: OrderByClauseContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.orderItem`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitOrderItem?: (ctx: OrderItemContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.limitClause`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitLimitClause?: (ctx: LimitClauseContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.insertStatement`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitInsertStatement?: (ctx: InsertStatementContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.insertValue`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitInsertValue?: (ctx: InsertValueContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.updateStatement`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitUpdateStatement?: (ctx: UpdateStatementContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.deleteStatement`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitDeleteStatement?: (ctx: DeleteStatementContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.mergeStatement`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitMergeStatement?: (ctx: MergeStatementContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.mergeWhen`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitMergeWhen?: (ctx: MergeWhenContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.truncateStatement`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitTruncateStatement?: (ctx: TruncateStatementContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.createSchemaStatement`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitCreateSchemaStatement?: (ctx: CreateSchemaStatementContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.createTableStatement`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitCreateTableStatement?: (ctx: CreateTableStatementContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.tableElement`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitTableElement?: (ctx: TableElementContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.dropStatement`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitDropStatement?: (ctx: DropStatementContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.dataType`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitDataType?: (ctx: DataTypeContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.expression`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitExpression?: (ctx: ExpressionContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.predicate`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitPredicate?: (ctx: PredicateContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.valueExpr`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitValueExpr?: (ctx: ValueExprContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.primaryExpr`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitPrimaryExpr?: (ctx: PrimaryExprContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.caseExpr`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitCaseExpr?: (ctx: CaseExprContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.castExpr`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitCastExpr?: (ctx: CastExprContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.extractExpr`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitExtractExpr?: (ctx: ExtractExprContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.positionExpr`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitPositionExpr?: (ctx: PositionExprContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.functionCall`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitFunctionCall?: (ctx: FunctionCallContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.overClause`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitOverClause?: (ctx: OverClauseContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.windowFrame`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitWindowFrame?: (ctx: WindowFrameContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.frameBound`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitFrameBound?: (ctx: FrameBoundContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.schemaQualifiedTable`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitSchemaQualifiedTable?: (ctx: SchemaQualifiedTableContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.columnRef`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitColumnRef?: (ctx: ColumnRefContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.schemaName`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitSchemaName?: (ctx: SchemaNameContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.tableName`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitTableName?: (ctx: TableNameContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.columnName`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitColumnName?: (ctx: ColumnNameContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.functionName`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitFunctionName?: (ctx: FunctionNameContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.alias`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitAlias?: (ctx: AliasContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.identifier`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitIdentifier?: (ctx: IdentifierContext) => Result;
    /**
     * Visit a parse tree produced by `ExasolParser.literal`.
     * @param ctx the parse tree
     * @return the visitor result
     */
    visitLiteral?: (ctx: LiteralContext) => Result;
}

