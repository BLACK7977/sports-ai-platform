import { FC, CSSProperties } from "react";

export type SkeletonBlockProps = {
  width?: number | string;
  height?: number | string;
  className?: string;
};

export const SkeletonBlock: FC<SkeletonBlockProps> = ({
  width,
  height,
  className,
}: SkeletonBlockProps) => {
  const style: CSSProperties = {
    ...(width && { width }),
    ...(height && { height }),
  };

  return <div
    className={`bg-slate-800/70 rounded ${className ?? ""}`}
    style={style}
    aria-hidden="true"
  />;
};