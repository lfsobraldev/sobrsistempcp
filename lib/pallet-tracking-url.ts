export function criarUrlRastreioPallet(origin: string, token: string) {
  const url = new URL("/rastreio/pallet", origin);
  url.hash = new URLSearchParams({ token }).toString();
  return url.toString();
}