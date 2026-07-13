interface LogoProps {
  className?: string;
}

/** HairOriginals wordmark, cropped tight for compact placements (nav, cards). */
export default function Logo({ className }: LogoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo-wordmark.png"
      alt="HairOriginals"
      className={className ?? "h-7 w-auto"}
    />
  );
}
