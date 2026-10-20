import "@fontsource-variable/inter";
import "./globals.css";
import "./styles/carteira.css";

export const metadata = {
  title: "Sobral PCP | Gestão Industrial",
  description: "Planejamento, controle e execução da produção industrial",
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
