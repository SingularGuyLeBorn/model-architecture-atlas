import { createContext, useContext, type ReactNode } from "react";
import { Handle, Position } from "@xyflow/react";

export type RecipeObjectPort = {
  id: string;
  tex: string;
  side?: "left" | "right" | "top" | "bottom";
};
export const RecipePortsContext = createContext<{
  inputs?: RecipeObjectPort[];
  outputs?: RecipeObjectPort[];
}>({});

/** 供矩阵内部行使用，不额外插入包装框或改变行列布局。 */
export function RecipePortHandles({
  tex,
  direction,
  side,
}: {
  tex: string;
  direction: "in" | "out";
  side?: "left" | "right";
}) {
  const ports = useContext(RecipePortsContext);
  const matches =
    (direction === "in" ? ports.inputs : ports.outputs)?.filter(
      (p) => p.tex === tex,
    ) ?? [];
  return matches.map((port) => {
    const actualSide =
      port.side ?? side ?? (direction === "in" ? "top" : "bottom");
    const siblings = matches.filter(
      (p) =>
        (p.side ?? side ?? (direction === "in" ? "top" : "bottom")) ===
        actualSide,
    );
    const offset = `${((siblings.indexOf(port) + 1) * 100) / (siblings.length + 1)}%`;
    return (
      <Handle
        key={port.id}
        id={port.id}
        type={direction === "in" ? "target" : "source"}
        position={
          actualSide === "left"
            ? Position.Left
            : actualSide === "right"
              ? Position.Right
              : actualSide === "top"
                ? Position.Top
                : Position.Bottom
        }
        style={
          actualSide === "left" || actualSide === "right"
            ? { top: offset }
            : { left: offset }
        }
      />
    );
  });
}

/** 数据对象自己拥有端口；分组框与说明文字不承担数据出口。 */
export function RecipePort({
  tex,
  direction,
  children,
}: {
  tex: string;
  direction: "in" | "out";
  children: ReactNode;
}) {
  return (
    <div
      className="recipe-object-port"
      data-variable={tex}
      data-direction={direction}
    >
      {children}
      <RecipePortHandles tex={tex} direction={direction} />
    </div>
  );
}
