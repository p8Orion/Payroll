import { DragEvent, useEffect, useRef, useState } from "react";
import { FormulaToken } from "../model/types";

interface FormulaInlineEditorProps {
  tokens: FormulaToken[];
  onDropAt: (event: DragEvent<HTMLElement>, index: number) => void;
  onInsertAt?: (rawValue: string, index: number) => void;
  renderToken: (token: FormulaToken, index: number) => React.ReactNode;
  onEmptyDrop?: (event: DragEvent<HTMLElement>) => void;
  dndEnabled?: boolean;
  openInsertAtEndSignal?: number;
}

export function FormulaInlineEditor({
  tokens,
  onDropAt,
  onInsertAt,
  renderToken,
  onEmptyDrop,
  dndEnabled = true,
  openInsertAtEndSignal
}: FormulaInlineEditorProps) {
  const [activeDropIndex, setActiveDropIndex] = useState<number | null>(null);
  const [emptyActive, setEmptyActive] = useState(false);
  const [insertEditorIndex, setInsertEditorIndex] = useState<number | null>(null);
  const [insertEditorDraft, setInsertEditorDraft] = useState("");
  const lastOpenSignalRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const clear = () => {
      setActiveDropIndex(null);
      setEmptyActive(false);
    };
    window.addEventListener("dragend", clear);
    window.addEventListener("drop", clear);
    return () => {
      window.removeEventListener("dragend", clear);
      window.removeEventListener("drop", clear);
    };
  }, []);

  useEffect(() => {
    if (!dndEnabled) {
      setActiveDropIndex(null);
      setEmptyActive(false);
    }
  }, [dndEnabled]);

  useEffect(() => {
    setInsertEditorIndex(null);
    setInsertEditorDraft("");
  }, [tokens]);

  useEffect(() => {
    if (!onInsertAt) return;
    if (openInsertAtEndSignal === undefined) return;
    if (lastOpenSignalRef.current === openInsertAtEndSignal) return;
    lastOpenSignalRef.current = openInsertAtEndSignal;
    setInsertEditorIndex(tokens.length);
    setInsertEditorDraft("");
  }, [openInsertAtEndSignal, onInsertAt, tokens.length]);

  const handleDropAt = (event: DragEvent<HTMLElement>, index: number) => {
    event.preventDefault();
    event.stopPropagation();
    if (!dndEnabled) return;
    onDropAt(event, index);
    setActiveDropIndex(null);
  };

  const startInsertEditor = (index: number) => {
    if (!onInsertAt) return;
    setInsertEditorIndex(index);
    setInsertEditorDraft("");
  };

  const commitInsertEditor = () => {
    if (!onInsertAt || insertEditorIndex === null) return;
    const raw = insertEditorDraft.trim();
    if (raw) onInsertAt(raw, insertEditorIndex);
    setInsertEditorIndex(null);
    setInsertEditorDraft("");
  };

  const insertionIndexForPointer = (
    clientX: number,
    currentTarget: HTMLElement,
    beforeIndex: number,
    afterIndex: number
  ): number => {
    const rect = currentTarget.getBoundingClientRect();
    const midpoint = rect.left + rect.width / 2;
    return clientX < midpoint ? beforeIndex : afterIndex;
  };

  if (!tokens.length) {
    return (
      <div
        className={emptyActive ? "empty-drop-target active" : "empty-drop-target"}
        onDoubleClick={() => startInsertEditor(0)}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!dndEnabled) return;
          setEmptyActive(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!dndEnabled) return;
          e.dataTransfer.dropEffect = "move";
          setEmptyActive(true);
        }}
        onDragLeave={(e) => {
          e.stopPropagation();
          setEmptyActive(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setEmptyActive(false);
          if (!dndEnabled) return;
          if (onEmptyDrop) onEmptyDrop(e);
          else onDropAt(e, 0);
        }}
      />
    );
  }

  return (
    <>
      {insertEditorIndex === 0 ? (
        <input
          className="formula-insert-input"
          value={insertEditorDraft}
          onChange={(e) => setInsertEditorDraft(e.target.value)}
          autoFocus
          onBlur={commitInsertEditor}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitInsertEditor();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setInsertEditorIndex(null);
              setInsertEditorDraft("");
            }
          }}
        />
      ) : null}
      <span
        className={activeDropIndex === 0 ? "drag-insert-cursor active leading" : "drag-insert-cursor leading"}
        onDoubleClick={() => startInsertEditor(0)}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!dndEnabled) return;
          e.dataTransfer.dropEffect = "move";
          setActiveDropIndex(0);
        }}
        onDrop={(e) => handleDropAt(e, 0)}
      />
      {tokens.map((token, index) => (
        <div
          key={token.id}
          className="formula-segment formula-segment-inline"
          onDragLeave={() => {
            setActiveDropIndex((current) =>
              current === index || current === index + 1 ? null : current
            );
          }}
        >
          <span
            className={activeDropIndex === index ? "drag-insert-cursor active" : "drag-insert-cursor"}
            onDoubleClick={() => startInsertEditor(index)}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!dndEnabled) return;
              e.dataTransfer.dropEffect = "move";
              setActiveDropIndex(index);
            }}
            onDrop={(e) => handleDropAt(e, index)}
          />
          {insertEditorIndex === index ? (
            <input
              className="formula-insert-input"
              value={insertEditorDraft}
              onChange={(e) => setInsertEditorDraft(e.target.value)}
              autoFocus
              onBlur={commitInsertEditor}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitInsertEditor();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setInsertEditorIndex(null);
                  setInsertEditorDraft("");
                }
              }}
            />
          ) : null}
          <div
            className="inline-token-drop"
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!dndEnabled) return;
              e.dataTransfer.dropEffect = "move";
              const insertAt = insertionIndexForPointer(e.clientX, e.currentTarget, index, index + 1);
              setActiveDropIndex(insertAt);
            }}
            onDrop={(e) => {
              const insertAt = insertionIndexForPointer(e.clientX, e.currentTarget, index, index + 1);
              handleDropAt(e, insertAt);
            }}
          >
            {renderToken(token, index)}
          </div>
          {index === tokens.length - 1 ? (
            <>
              <span
                className={
                  activeDropIndex === index + 1 ? "drag-insert-cursor active" : "drag-insert-cursor"
                }
                onDoubleClick={() => startInsertEditor(index + 1)}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!dndEnabled) return;
                  e.dataTransfer.dropEffect = "move";
                  setActiveDropIndex(index + 1);
                }}
                onDrop={(e) => handleDropAt(e, index + 1)}
              />
              {insertEditorIndex === index + 1 ? (
                <input
                  className="formula-insert-input"
                  value={insertEditorDraft}
                  onChange={(e) => setInsertEditorDraft(e.target.value)}
                  autoFocus
                  onBlur={commitInsertEditor}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitInsertEditor();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setInsertEditorIndex(null);
                      setInsertEditorDraft("");
                    }
                  }}
                />
              ) : null}
            </>
          ) : null}
        </div>
      ))}
    </>
  );
}
