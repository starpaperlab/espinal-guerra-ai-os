import Image from "next/image";

/** Supply the original official asset via logoSrc; never reconstruct the wings. */
export function CorporateIdentity({ logoSrc }: { logoSrc?: string }) {
  return (
    <div className="corporate-identity">
      {logoSrc ? (
        <Image
          className="corporate-logo"
          src={logoSrc}
          width={240}
          height={90}
          alt="Grupo Empresarial Espinal Guerra"
        />
      ) : (
        <>
          <span className="identity-kicker">GRUPO EMPRESARIAL</span>
          <strong>ESPINAL GUERRA</strong>
          <span className="identity-pending">
            Identidad provisional · logo pendiente
          </span>
        </>
      )}
    </div>
  );
}
