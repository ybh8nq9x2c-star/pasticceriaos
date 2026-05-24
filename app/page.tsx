import { redirect } from "next/navigation";

// Root → redirect to sign-in
export default function RootPage() {
  redirect("/auth/sign-in");
}
