import { createContext, useContext, type ReactNode } from "react";
import { Handle, Position } from "@xyflow/react";

type Port = { id: string; tex: string };
export const RecipePortsContext = createContext<{
  inputs?: Port[];
  outputs?: Port[];
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
  return matches.map((port, i) => (
    <Handle
      key={port.id}
      id={port.id}
      type={direction === "in" ? "target" : "source"}
      position={
        side === "left"
          ? Position.Left
          : side === "right"
            ? Position.Right
            : direction === "in"
              ? Position.Top
              : Position.Bottom
      }
      style={
        side
          ? { top: `${((i + 1) * 100) / (matches.length + 1)}%` }
          : { left: `${((i + 1) * 100) / (matches.length + 1)}%` }
      }
    />
  ));
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
