import type { ReactNode, ComponentProps } from "react";
import { ObjectConnections } from "../components/ObjectConnections";

/** 同一 Head 的取行、计算、写回共用一个可检测的连接作用域。 */
export function HeadBranches({
  sources,
  branches,
  result,
  links,
}: {
  sources: ReactNode;
  branches: { head: string; body: ReactNode }[];
  result: ReactNode;
  links: ComponentProps<typeof ObjectConnections>["links"];
}) {
  return (
    <div data-head-branches>
      <ObjectConnections links={links}>
        <div className="head-branch-layout">
          <div className="head-branch-sources">{sources}</div>
          <div className="head-branch-calculations">
            {branches.map(({ head, body }, i) => (
              <div key={head} data-head-branch={head} data-route-frame>
                {i === branches.length - 1 && i > 1 && (
                  <p className="architecture-caption">⋮</p>
                )}
                <p className="architecture-caption">Head {head}</p>
                {body}
              </div>
            ))}
          </div>
          <div className="head-branch-result">{result}</div>
        </div>
      </ObjectConnections>
    </div>
  );
}
