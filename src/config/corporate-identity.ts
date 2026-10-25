/** Public visual settings only. Do not add credentials or business data here. */
export const corporateIdentity = {
  companyName: "Grupo Empresarial Espinal Guerra",
  tradeName: "Espinal Guerra",
  slogan: "Innovando para un crecimiento sostenible",
  logoPrincipal: "/brand/espinal-guerra-logo.png" as string | null,
  logoWhite: "/brand/espinal-guerra-logo-white.png" as string | null,
  palette: {
    blueDeep: "#0A1F44",
    blueCorporate: "#1E3A6D",
    blueMedium: "#4A6FA5",
    blueLight: "#E6ECF4",
    grayLight: "#F7F9FC",
    grayDark: "#2B2F33",
    surface: "#FFFFFF",
  },
  typography: { headings: "Montserrat", body: "Poppins" },
  display: {
    logoWidth: 240,
    logoHeight: 160,
    showSlogan: false,
    showPendingLabel: true,
    pendingLabel: "Identidad provisional",
  },
} as const;

/** Used by the document and presentation tests: one source of truth for the theme. */
export const corporateTheme = {
  "--blue-deep": corporateIdentity.palette.blueDeep,
  "--blue-corporate": corporateIdentity.palette.blueCorporate,
  "--blue-medium": corporateIdentity.palette.blueMedium,
  "--blue-light": corporateIdentity.palette.blueLight,
  "--gray-light": corporateIdentity.palette.grayLight,
  "--gray-dark": corporateIdentity.palette.grayDark,
  "--surface": corporateIdentity.palette.surface,
  "--font-heading": `"${corporateIdentity.typography.headings}", sans-serif`,
  "--font-body": `"${corporateIdentity.typography.body}", sans-serif`,
  "--identity-logo-width": `${corporateIdentity.display.logoWidth}px`,
  "--identity-logo-height": `${corporateIdentity.display.logoHeight}px`,
};
