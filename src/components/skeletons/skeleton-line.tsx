import { FC, CSSProperties } from "react";

export type SkeletonLineProps = {
  width?: number | string;
  height?: number | 1.5;
  className?: string;
};

export const SkeletonLine: FC<SkeletonLineProps> = ({
  width,
  height = 1.5,
  className,
}: SkeletonLineProps) => {
  const style: CSSProperties = {
    ...(width && { width }),
    height,
  };

  return <div className={`bg-slate-700/70 rounded-md ${className ?? ""}`} style={style} aria-hidden="true" />;
};