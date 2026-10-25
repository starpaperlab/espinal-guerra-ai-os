import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "Espinal Guerra · AI OS", template: "%s · Espinal Guerra" },
  description: "Centro de control privado del grupo Espinal Guerra",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
