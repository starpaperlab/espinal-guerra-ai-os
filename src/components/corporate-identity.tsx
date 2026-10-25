"use client";

import Image from "next/image";
import { useState } from "react";
import { corporateIdentity } from "@/config/corporate-identity";

type IdentityProps = { variant?: "light" | "dark" };

/** Original white artwork on dark surfaces; never recolor or reconstruct the logo. */
export function CorporateIdentity({ variant = "light" }: IdentityProps) {
  const src =
    variant === "dark"
      ? corporateIdentity.logoWhite
      : corporateIdentity.logoPrincipal;
  return (
    <IdentityArtwork key={`${variant}:${src}`} src={src} variant={variant} />
  );
}

function IdentityArtwork({
  src,
  variant,
}: {
  src: string | null;
  variant: "light" | "dark";
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const { companyName, tradeName, slogan, display } = corporateIdentity;
  return (
    <div
      className="corporate-identity"
      data-variant={variant}
      data-logo-state={loaded && !failed ? "loaded" : "placeholder"}
    >
      {src && !failed && (
        <span className="corporate-logo-slot">
          <Image
            className="corporate-logo"
            src={src}
            fill
            sizes={`${display.logoWidth}px`}
            alt={companyName}
            onLoad={() => setLoaded(true)}
            onError={() => {
              setLoaded(false);
              setFailed(true);
            }}
          />
        </span>
      )}
      <div
        className="identity-fallback"
        aria-hidden={loaded && !failed ? true : undefined}
      >
        <span className="identity-kicker">GRUPO EMPRESARIAL</span>
        <strong>{tradeName.toLocaleUpperCase("es")}</strong>
        {display.showPendingLabel && (
          <span className="identity-pending">{display.pendingLabel}</span>
        )}
      </div>
      {display.showSlogan && <p className="identity-slogan">{slogan}</p>}
    </div>
  );
}
