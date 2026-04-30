import { DragEvent, MutableRefObject, ReactNode } from "react";
import { FormulaInlineEditor } from "./FormulaInlineEditor";
import {
  getFunctionBlockArity,
  parseFunctionBlock,
  serializeFunctionBlock,
  functionBlockTemplates
} from "../model/function-blocks";
import { tokenizeFormulaExpression, token, getShapeGlyph } from "../model/helpers";
import { formatConstDisplayValue } from "../model/formula-ui";
import { FormulaToken, LIQUIDATION_TYPES } from "../model/types";
const annualAllLiquidationTypes = "(Todos)";

interface FormulaBlockEditorProps {
  blockExpr: string;
  onChange: (next: string) => void;
  pathKey: string;
  level: number;
  onRemove?: () => void;
  conceptCodeById: Record<number, string>;
  scopePastelStyle: (functionName: string, level: number) => React.CSSProperties;
  onDropToNestedArgAt: (
    event: DragEvent<HTMLElement>,
    blockExpr: string,
    onChange: (next: string) => void,
    pathKey: string,
    argIndex: number,
    insertAt: number
  ) => void;
  insertRawTextIntoNestedArg: (
    blockExpr: string,
    onChange: (next: string) => void,
    argIndex: number,
    insertAt: number,
    rawValue: string
  ) => void;
  mutateBlockArgTokens: (
    blockExpr: string,
    argIndex: number,
    updater: (tokens: FormulaToken[]) => FormulaToken[]
  ) => string;
  setNestedDragSource: (
    pathKey: string,
    argIndex: number,
    tokenIndex: number,
    token: FormulaToken
  ) => void;
  setCursorGhost: (event: DragEvent<HTMLElement>, label: string) => void;
  editingTextTokenId: string | null;
  setEditingTextTokenId: (value: string | null) => void;
  editingTextDraft: string;
  setEditingTextDraft: (value: string) => void;
  textTokenEditRef: MutableRefObject<HTMLDivElement | null>;
  editingConstTokenId: string | null;
  setEditingConstTokenId: (value: string | null) => void;
  editingConstDraft: string;
  setEditingConstDraft: (value: string) => void;
  isConstExpression: (expr: string) => boolean;
  parseConstValue: (expr: string) => string;
  buildConstExpression: (value: string) => string;
  isMathExpression: (expr: string) => boolean;
  isTagAggregationExpression: (expr: string) => boolean;
  conceptVisualForToken: (tk: FormulaToken) => {
    color: string;
    shape:
      | "circle"
      | "square"
      | "star"
      | "triangle"
      | "diamond"
      | "plus"
      | "moon"
      | "clover"
      | "xmark"
      | "spark"
      | "exclamation"
      | "question"
      | "bolt"
      | "hex";
  } | null;
  getPillTitle?: (tk: FormulaToken) => string | null;
  onConceptClick?: (tk: FormulaToken) => void;
}

export function FormulaBlockEditor({
  blockExpr,
  onChange,
  pathKey,
  level,
  onRemove,
  conceptCodeById,
  scopePastelStyle,
  onDropToNestedArgAt,
  insertRawTextIntoNestedArg,
  mutateBlockArgTokens,
  setNestedDragSource,
  setCursorGhost,
  editingTextTokenId,
  setEditingTextTokenId,
  editingTextDraft,
  setEditingTextDraft,
  textTokenEditRef,
  editingConstTokenId,
  setEditingConstTokenId,
  editingConstDraft,
  setEditingConstDraft,
  isConstExpression,
  parseConstValue,
  buildConstExpression,
  isMathExpression,
  isTagAggregationExpression,
  conceptVisualForToken,
  getPillTitle,
  onConceptClick
}: FormulaBlockEditorProps): ReactNode {
  const parsed = parseFunctionBlock(blockExpr);
  if (!parsed) return <span className="formula-text">{blockExpr}</span>;
  const labels =
    parsed.name in functionBlockTemplates
      ? functionBlockTemplates[parsed.name as keyof typeof functionBlockTemplates].branches
      : (["ARG 1", "ARG 2", "ARG 3"] as const);
  const args = [...parsed.args];
  while (args.length < getFunctionBlockArity(parsed.name)) args.push("");
  if (parsed.name === "SI" && args.length % 2 === 0) args.push("");

  const renderBranchEditor = (
    slotExpression: string,
    slotOffset: number,
    branchLabel: string,
    roleClass: string
  ) => {
    const branchTokens = tokenizeFormulaExpression(slotExpression, { conceptCodeById }).map((tk, i) => ({
      ...tk,
      id: `${pathKey}:${slotOffset}:${i}`
    }));
    return (
      <div key={`${pathKey}:${slotOffset}`} className={`si-branch ${roleClass}`}>
        {branchLabel.trim() ? <strong>{branchLabel}</strong> : null}
        <div
          className="si-branch-content"
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "move";
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDropToNestedArgAt(
              e,
              blockExpr,
              onChange,
              pathKey,
              slotOffset,
              branchTokens.length
            );
          }}
        >
          <FormulaInlineEditor
            tokens={branchTokens}
            onInsertAt={(rawValue, insertAt) =>
              insertRawTextIntoNestedArg(
                blockExpr,
                onChange,
                slotOffset,
                insertAt,
                rawValue
              )
            }
            onDropAt={(e, insertAt) =>
              onDropToNestedArgAt(e, blockExpr, onChange, pathKey, slotOffset, insertAt)
            }
            onEmptyDrop={(e) =>
              onDropToNestedArgAt(e, blockExpr, onChange, pathKey, slotOffset, 0)
            }
            renderToken={(branchToken, branchIndex) =>
              branchToken.kind === "block" ? (
                <div
                  className="formula-block-token"
                  title={getPillTitle?.(branchToken) ?? "Click der: quitar"}
                  draggable
                  onDragStart={(e) => {
                    e.stopPropagation();
                    setNestedDragSource(pathKey, slotOffset, branchIndex, branchToken);
                    e.dataTransfer.setData("text/plain", branchToken.label);
                    e.dataTransfer.setData(
                      "text/block-local-token-json",
                      JSON.stringify({
                        pathKey,
                        argIndex: slotOffset,
                        tokenIndex: branchIndex,
                        token: branchToken
                      })
                    );
                    e.dataTransfer.setData("text/token-json", JSON.stringify(branchToken));
                    e.dataTransfer.effectAllowed = "move";
                    setCursorGhost(e, branchToken.label);
                  }}
                >
                  <FormulaBlockEditor
                    blockExpr={branchToken.expression}
                    onChange={(nestedNext) => {
                      onChange(
                        mutateBlockArgTokens(blockExpr, slotOffset, (tokens) => {
                          const next = [...tokens];
                          next[branchIndex] = {
                            ...next[branchIndex],
                            expression: nestedNext
                          };
                          return next;
                        })
                      );
                    }}
                    pathKey={`${pathKey}:${slotOffset}:${branchIndex}`}
                    level={level + 1}
                    onRemove={() => {
                      onChange(
                        mutateBlockArgTokens(blockExpr, slotOffset, (tokens) =>
                          tokens.filter((_, i) => i !== branchIndex)
                        )
                      );
                    }}
                    conceptCodeById={conceptCodeById}
                    scopePastelStyle={scopePastelStyle}
                    onDropToNestedArgAt={onDropToNestedArgAt}
                    insertRawTextIntoNestedArg={insertRawTextIntoNestedArg}
                    mutateBlockArgTokens={mutateBlockArgTokens}
                    setNestedDragSource={setNestedDragSource}
                    setCursorGhost={setCursorGhost}
                    editingTextTokenId={editingTextTokenId}
                    setEditingTextTokenId={setEditingTextTokenId}
                    editingTextDraft={editingTextDraft}
                    setEditingTextDraft={setEditingTextDraft}
                    textTokenEditRef={textTokenEditRef}
                    editingConstTokenId={editingConstTokenId}
                    setEditingConstTokenId={setEditingConstTokenId}
                    editingConstDraft={editingConstDraft}
                    setEditingConstDraft={setEditingConstDraft}
                    isConstExpression={isConstExpression}
                    parseConstValue={parseConstValue}
                    buildConstExpression={buildConstExpression}
                    isMathExpression={isMathExpression}
                    isTagAggregationExpression={isTagAggregationExpression}
                    conceptVisualForToken={conceptVisualForToken}
                    getPillTitle={getPillTitle}
                    onConceptClick={onConceptClick}
                  />
                </div>
              ) : branchToken.kind === "text" ? (
                editingTextTokenId === `${pathKey}:${slotOffset}:${branchIndex}` ? (
                  <div className="text-token-edit-wrap" ref={textTokenEditRef}>
                    <input
                      className="text-token-input"
                      value={editingTextDraft}
                      onChange={(e) => setEditingTextDraft(e.target.value)}
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      draggable={false}
                      onDragStart={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      style={{ width: `${Math.max(4, editingTextDraft.length + 1)}ch` }}
                      onBlur={() => {
                        const nextValue = editingTextDraft.trim();
                        if (!nextValue) {
                          onChange(
                            mutateBlockArgTokens(blockExpr, slotOffset, (tokens) =>
                              tokens.filter((_, i) => i !== branchIndex)
                            )
                          );
                        } else {
                          onChange(
                            mutateBlockArgTokens(blockExpr, slotOffset, (tokens) => {
                              const next = [...tokens];
                              next[branchIndex] = {
                                ...next[branchIndex],
                                label: nextValue,
                                expression: nextValue
                              };
                              return next;
                            })
                          );
                        }
                        setEditingTextTokenId(null);
                        setEditingTextDraft("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          (e.target as HTMLInputElement).blur();
                        }
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setEditingTextTokenId(null);
                          setEditingTextDraft("");
                        }
                      }}
                    />
                  </div>
                ) : (
                  <span
                    className="formula-text"
                    draggable
                    onDragStart={(e) => {
                      e.stopPropagation();
                      setNestedDragSource(pathKey, slotOffset, branchIndex, branchToken);
                      e.dataTransfer.setData("text/plain", branchToken.label);
                      e.dataTransfer.setData(
                        "text/block-local-token-json",
                        JSON.stringify({
                          pathKey,
                          argIndex: slotOffset,
                          tokenIndex: branchIndex,
                          token: branchToken
                        })
                      );
                      e.dataTransfer.setData("text/token-json", JSON.stringify(branchToken));
                      e.dataTransfer.effectAllowed = "move";
                      setCursorGhost(e, branchToken.label);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingTextTokenId(`${pathKey}:${slotOffset}:${branchIndex}`);
                      setEditingTextDraft(branchToken.label);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      onChange(
                        mutateBlockArgTokens(blockExpr, slotOffset, (tokens) =>
                          tokens.filter((_, i) => i !== branchIndex)
                        )
                      );
                    }}
                  >
                    {branchToken.label}
                  </span>
                )
              ) : isConstExpression(branchToken.expression) &&
                editingConstTokenId === `${pathKey}:${slotOffset}:${branchIndex}` ? (
                <input
                  className="text-token-input"
                  value={editingConstDraft}
                  onChange={(e) => setEditingConstDraft(e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  autoFocus
                  draggable={false}
                  onDragStart={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  style={{ width: `${Math.max(4, editingConstDraft.length + 1)}ch` }}
                  onBlur={() => {
                    const nextValue = editingConstDraft.trim();
                    if (!nextValue) {
                      onChange(
                        mutateBlockArgTokens(blockExpr, slotOffset, (tokens) =>
                          tokens.filter((_, i) => i !== branchIndex)
                        )
                      );
                    } else {
                      onChange(
                        mutateBlockArgTokens(blockExpr, slotOffset, (tokens) => {
                          const next = [...tokens];
                          next[branchIndex] = {
                            ...next[branchIndex],
                            label: formatConstDisplayValue(nextValue),
                            expression: buildConstExpression(nextValue)
                          };
                          return next;
                        })
                      );
                    }
                    setEditingConstTokenId(null);
                    setEditingConstDraft("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      (e.target as HTMLInputElement).blur();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setEditingConstTokenId(null);
                      setEditingConstDraft("");
                    }
                  }}
                />
              ) : (
                <button
                  className={`formula-pill ${branchToken.kind}${
                    isConstExpression(branchToken.expression)
                      ? " const-pill"
                      : isMathExpression(branchToken.expression)
                        ? " math-pill"
                        : isTagAggregationExpression(branchToken.expression)
                          ? " tag-pill"
                          : /^VALOR_(?:FIJO|LEGAJO)\("/.test(branchToken.expression)
                            ? " fixed-value-pill"
                            : ""
                  }`}
                  draggable
                  onDragStart={(e) => {
                    e.stopPropagation();
                    setNestedDragSource(pathKey, slotOffset, branchIndex, branchToken);
                    e.dataTransfer.setData("text/plain", branchToken.label);
                    e.dataTransfer.setData(
                      "text/block-local-token-json",
                      JSON.stringify({
                        pathKey,
                        argIndex: slotOffset,
                        tokenIndex: branchIndex,
                        token: branchToken
                      })
                    );
                    e.dataTransfer.setData("text/token-json", JSON.stringify(branchToken));
                    e.dataTransfer.effectAllowed = "move";
                    setCursorGhost(e, branchToken.label);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (branchToken.kind === "concept") {
                      onConceptClick?.(branchToken);
                      return;
                    }
                    if (isConstExpression(branchToken.expression)) {
                      setEditingConstTokenId(`${pathKey}:${slotOffset}:${branchIndex}`);
                      setEditingConstDraft(parseConstValue(branchToken.expression));
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onChange(
                      mutateBlockArgTokens(blockExpr, slotOffset, (tokens) =>
                        tokens.filter((_, i) => i !== branchIndex)
                      )
                    );
                  }}
                  title={
                    getPillTitle?.(branchToken) ??
                    (isConstExpression(branchToken.expression)
                      ? "Click izq: editar constante. Click der: quitar"
                      : "Click der: quitar")
                  }
                >
                  {branchToken.kind === "concept" ? (
                    <span className="formula-pill-concept">
                      <span
                        className="concept-marker"
                        style={{ color: conceptVisualForToken(branchToken)?.color ?? "#334155" }}
                      >
                        {getShapeGlyph(conceptVisualForToken(branchToken)?.shape ?? "circle")}
                      </span>
                      {branchToken.label}
                    </span>
                  ) : isMathExpression(branchToken.expression) ? (
                    branchToken.expression.match(/^MATH\("((?:[^"\\]|\\.)*)"\)$/)?.[1] ?? branchToken.label
                  ) : (
                    branchToken.label
                  )}
                </button>
              )
            }
          />
        </div>
      </div>
    );
  };

  return (
    <div
      className={parsed.name === "MES_ANTERIOR" ? "si-block mes-anterior-block" : "si-block"}
      style={scopePastelStyle(parsed.name, level)}
    >
      {onRemove ? (
        <button
          type="button"
          className="function-block-remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title="Quitar bloque"
        >
          -
        </button>
      ) : null}
      <div className="si-block-title">
        {parsed.name === "MES_ANTERIOR" ? "MES-ANTERIOR" : parsed.name === "SUMA_ANUAL" ? "SUMA-ANUAL" : parsed.name}
      </div>
      {parsed.name === "MES_ANTERIOR" ? (
        <>
          <div className="mes-anterior-concept-row">
            {renderBranchEditor(args[0] ?? "", 0, "CONCEPTO", "slot-cond")}
          </div>
          <div className="mes-anterior-controls">
            <label className="mes-anterior-control">
              <strong>TIPO</strong>
              <select
                value={(() => {
                  const raw = (args[1] ?? "").trim();
                  const parsedType = isConstExpression(raw) ? parseConstValue(raw) : raw.replace(/^"|"$/g, "");
                  return LIQUIDATION_TYPES.includes(parsedType as (typeof LIQUIDATION_TYPES)[number])
                    ? parsedType
                    : LIQUIDATION_TYPES[0];
                })()}
                onChange={(e) => {
                  const nextArgs = [...args];
                  nextArgs[1] = buildConstExpression(e.target.value);
                  onChange(serializeFunctionBlock(parsed.name, nextArgs));
                }}
              >
                {LIQUIDATION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label className="mes-anterior-control">
              <strong>MESES ATRÁS</strong>
              <input
                type="number"
                min={0}
                step={1}
                value={(() => {
                  const raw = (args[2] ?? "").trim();
                  const parsedMonths = Number(isConstExpression(raw) ? parseConstValue(raw) : raw);
                  return Number.isFinite(parsedMonths) && parsedMonths >= 0 ? Math.floor(parsedMonths) : 0;
                })()}
                onChange={(e) => {
                  const parsedMonths = Math.max(0, Math.floor(Number(e.target.value || "0")));
                  const nextArgs = [...args];
                  nextArgs[2] = buildConstExpression(String(parsedMonths));
                  onChange(serializeFunctionBlock(parsed.name, nextArgs));
                }}
              />
            </label>
          </div>
        </>
      ) : parsed.name === "SUMA_ANUAL" ? (
        <div className="suma-anual-row">
          <div className="suma-anual-concept">
            {renderBranchEditor(args[0] ?? "", 0, "CONCEPTO", "slot-cond")}
          </div>
          <label className="mes-anterior-control suma-anual-type">
            <strong>TIPO</strong>
            <select
              value={(() => {
                const raw = (args[1] ?? "").trim();
                const parsedType = isConstExpression(raw) ? parseConstValue(raw) : raw.replace(/^"|"$/g, "");
                return parsedType === annualAllLiquidationTypes ||
                  LIQUIDATION_TYPES.includes(parsedType as (typeof LIQUIDATION_TYPES)[number])
                  ? parsedType
                  : LIQUIDATION_TYPES[0];
              })()}
              onChange={(e) => {
                const nextArgs = [...args];
                nextArgs[1] = buildConstExpression(e.target.value);
                onChange(serializeFunctionBlock(parsed.name, nextArgs));
              }}
            >
              <option value={annualAllLiquidationTypes}>{annualAllLiquidationTypes}</option>
              {LIQUIDATION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : parsed.name === "SI" ? (
        <>
          {Array.from({ length: Math.max(1, Math.floor((args.length - 1) / 2)) }, (_, pairIndex) => {
            const conditionIndex = pairIndex * 2;
            const thenIndex = conditionIndex + 1;
            return (
              <div key={`${pathKey}:si-row:${pairIndex}`} className="si-switch-row">
                {renderBranchEditor(args[conditionIndex] ?? "", conditionIndex, "CONDICIÓN", "slot-cond")}
                {renderBranchEditor(args[thenIndex] ?? "", thenIndex, "ENTONCES", "slot-true")}
                <button
                  type="button"
                  className="si-remove-row-button"
                  title="Eliminar caso"
                  onClick={() => {
                    const pairCount = Math.max(1, Math.floor((args.length - 1) / 2));
                    if (pairCount <= 1) return;
                    const fallback = args[args.length - 1] ?? "";
                    const body = args.slice(0, -1);
                    const nextBody = body.filter((_, i) => i !== conditionIndex && i !== thenIndex);
                    const nextArgs = [...nextBody, fallback];
                    onChange(serializeFunctionBlock(parsed.name, nextArgs));
                  }}
                  disabled={Math.max(1, Math.floor((args.length - 1) / 2)) <= 1}
                >
                  -
                </button>
              </div>
            );
          })}
          <button
            type="button"
            className="si-add-row-button"
            title="Agregar caso ENTONCES / CONDICIÓN"
            onClick={() => {
              const fallback = args[args.length - 1] ?? "";
              const nextArgs = [...args.slice(0, -1), "", "", fallback];
              onChange(serializeFunctionBlock(parsed.name, nextArgs));
            }}
          >
            +
          </button>
          {renderBranchEditor(args[args.length - 1] ?? "", args.length - 1, "SI NO", "slot-false")}
        </>
      ) : (
        args.map((slotExpression, slotOffset) => {
          const roleClass =
            slotOffset === 0 ? "slot-cond" : slotOffset === 1 ? "slot-true" : "slot-false";
          const branchLabel = labels[slotOffset as 0 | 1 | 2] ?? `ARG ${slotOffset + 1}`;
          return renderBranchEditor(slotExpression, slotOffset, branchLabel, roleClass);
        })
      )}
    </div>
  );
}
