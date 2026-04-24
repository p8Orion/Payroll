import { DragEvent, MutableRefObject, ReactNode } from "react";
import { FormulaInlineEditor } from "./FormulaInlineEditor";
import { getFunctionBlockArity, parseFunctionBlock, functionBlockTemplates } from "../model/function-blocks";
import { tokenizeFormulaExpression, token, getShapeGlyph } from "../model/helpers";
import { FormulaToken } from "../model/types";

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
    shape: "circle" | "square" | "star" | "triangle" | "diamond" | "plus" | "hex";
  } | null;
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
  conceptVisualForToken
}: FormulaBlockEditorProps): ReactNode {
  const parsed = parseFunctionBlock(blockExpr);
  if (!parsed) return <span className="formula-text">{blockExpr}</span>;
  const labels =
    parsed.name in functionBlockTemplates
      ? functionBlockTemplates[parsed.name as keyof typeof functionBlockTemplates].branches
      : (["ARG 1", "ARG 2", "ARG 3"] as const);
  const args = [...parsed.args];
  while (args.length < getFunctionBlockArity(parsed.name)) args.push("");

  return (
    <div className="si-block" style={scopePastelStyle(parsed.name, level)}>
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
      <div className="si-block-title">{parsed.name}</div>
      {args.map((slotExpression, slotOffset) => {
        const roleClass =
          slotOffset === 0 ? "slot-cond" : slotOffset === 1 ? "slot-true" : "slot-false";
        const branchLabel = labels[slotOffset as 0 | 1 | 2] ?? `ARG ${slotOffset + 1}`;
        const branchTokens = tokenizeFormulaExpression(slotExpression, { conceptCodeById }).map(
          (tk, i) => ({
            ...tk,
            id: `${pathKey}:${slotOffset}:${i}`
          })
        );
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
                                label: nextValue,
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
      })}
    </div>
  );
}
