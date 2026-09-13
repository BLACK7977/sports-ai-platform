import { FC, ReactNode } from "react";

export const PageLoadingShell: FC<{
  width?: string | number;
  minHeight?: string | number;
  height?: string | number;
  className?: string;
  children?: ReactNode;
}> = ({
  width,
  minHeight,
  height,
  className,
  children,
}: {
  width?: string | number;
  minHeight?: string | number;
  height?: string | number;
  className?: string;
  children?: ReactNode;
}) => {
  const baseClasses = "w-full bg-slate-900/60 rounded-lg overflow-hidden";

  const style = {
    ...(width && { width }),
    ...(minHeight && { minHeight }),
    ...(height && { height }),
  };

  return (
    <div
      className={`${baseClasses} ${className ?? ""}`}
      style={style}
      aria-busy="true"
      aria-label="Cargando contenido"
      role="status"
    >
      {children}
    </div>
  );
};