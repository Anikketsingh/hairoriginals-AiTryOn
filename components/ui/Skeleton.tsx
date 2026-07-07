import { cn } from "./cn";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  rounded?: string;
}

export default function Skeleton({ rounded = "rounded-[var(--radius-md)]", className, ...props }: SkeletonProps) {
  return <div className={cn("skeleton", rounded, className)} aria-hidden="true" {...props} />;
}
