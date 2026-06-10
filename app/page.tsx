import { redirect } from "next/navigation";

// Root → il middleware smista gli utenti autenticati al loro workspace;
// chi arriva qui non autenticato va al login (rotta reale: /login).
export default function RootPage() {
  redirect("/login");
}
