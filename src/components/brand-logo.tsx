"use client";

import Image from "next/image";
import { useState } from "react";

type BrandLogoProps = { name: string; initials: string; logo?: string | null };

/** Reset image state whenever the configured source changes. */
export function BrandLogo(props: BrandLogoProps) {
  return <LogoImage key={props.logo || "no-logo"} {...props} />;
}

function LogoImage({ name, initials, logo }: BrandLogoProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(logo) && !failed;
  return (
    <span
      className="brand-logo"
      data-logo-state={loaded && !failed ? "loaded" : "placeholder"}
    >
      <span
        className="brand-logo-placeholder"
        role="img"
        aria-label={`Identidad provisional de ${name}`}
        aria-hidden={loaded && !failed ? true : undefined}
      >
        {initials}
      </span>
      {showImage && (
        <Image
          className="brand-logo-image"
          src={logo!}
          alt={`Logo de ${name}`}
          fill
          sizes="(max-width: 600px) 140px, 160px"
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            setFailed(true);
          }}
        />
      )}
    </span>
  );
}
