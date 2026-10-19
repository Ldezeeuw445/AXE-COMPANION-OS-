import { redirect } from "next/navigation";

/** Companion signup is the login form in create-account mode. */
export default function SignupPage() {
  redirect("/login?mode=signup");
}
