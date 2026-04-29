import { getFunctionBlockArity, serializeFunctionBlock, parseFunctionBlock } from "./function-blocks";
import { formulaToExpression, token, tokenizeFormulaExpression } from "./helpers";
import { FormulaToken } from "./types";
import { buildConstExpression, formatConstDisplayValue, isMathOperatorText } from "./formula-ui";

export function mutateBlockArgExpression(
  blockExpr: string,
  argIndex: number,
  conceptCodeById: Record<number, string>,
  updater: (tokens: FormulaToken[]) => FormulaToken[]
): string {
  const parsed = parseFunctionBlock(blockExpr);
  if (!parsed) return blockExpr;
  const nextArgs = [...parsed.args];
  while (nextArgs.length < getFunctionBlockArity(parsed.name)) nextArgs.push("");
  const tokens = tokenizeFormulaExpression(nextArgs[argIndex] ?? "", { conceptCodeById });
  nextArgs[argIndex] = formulaToExpression(updater(tokens));
  return serializeFunctionBlock(parsed.name, nextArgs);
}

export function insertRawTextIntoBlockArg(
  blockExpr: string,
  argIndex: number,
  insertAt: number,
  rawValue: string,
  conceptCodeById: Record<number, string>
): string {
  const value = rawValue.trim();
  if (!value) return blockExpr;
  return mutateBlockArgExpression(blockExpr, argIndex, conceptCodeById, (tokens) => {
    const next = [...tokens];
    const safeInsertAt = Math.max(0, Math.min(insertAt, next.length));
    if (isMathOperatorText(value)) {
      next.splice(safeInsertAt, 0, token(value, `MATH("${value}")`, "function"));
    } else {
      next.splice(
        safeInsertAt,
        0,
        token(formatConstDisplayValue(value), buildConstExpression(value), "function")
      );
    }
    return next;
  });
}
