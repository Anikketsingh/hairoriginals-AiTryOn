import { cn } from "./cn";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
  as?: "div" | "section" | "article";
}

export default function Card({
  padded = true,
  as: Tag = "div",
  className,
  children,
  ...props
}: CardProps) {
  return (
    <Tag
      className={cn(
        "rounded-[var(--radius-lg)] bg-surface border border-line shadow-[var(--shadow-card)]",
        padded && "p-5",
        className
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}
