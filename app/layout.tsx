import "@fontsource-variable/inter";
import "./globals.css";

export const metadata = {
  title: "Famossul | Sobral PCP Industrial",
  description: "Plataforma industrial da Famossul para planejamento, controle, qualidade e expedição da produção.",
  icons: {
    icon: "/sobral-s.svg",
    shortcut: "/sobral-s.svg",
    apple: "/sobral-s.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
