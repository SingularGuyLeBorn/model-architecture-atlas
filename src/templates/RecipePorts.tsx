import { createContext, useContext, type ReactNode } from "react";
import { Handle, Position } from "@xyflow/react";

type Port = { id: string; tex: string };
export const RecipePortsContext = createContext<{
  inputs?: Port[];
  outputs?: Port[];
}>({});

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
  const ports = useContext(RecipePortsContext);
  const matches =
    (direction === "in" ? ports.inputs : ports.outputs)?.filter(
      (p) => p.tex === tex,
    ) ?? [];
  return (
    <div
      className="recipe-object-port"
      data-variable={tex}
      data-direction={direction}
    >
      {children}
      {matches.map((port, i) => (
        <Handle
          key={port.id}
          id={port.id}
          type={direction === "in" ? "target" : "source"}
          position={direction === "in" ? Position.Top : Position.Bottom}
          style={{ left: `${((i + 1) * 100) / (matches.length + 1)}%` }}
        />
      ))}
    </div>
  );
}
