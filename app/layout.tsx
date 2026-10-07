import "./globals.css";
import "./erp-modern.css";

export const metadata = {
  title: "Sobral PCP | Gestão Industrial",
  description: "Planejamento, controle e execução da produção industrial",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
