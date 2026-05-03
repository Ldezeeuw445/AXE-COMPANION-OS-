import { redirect } from "next/navigation";

/** `/` wordt in middleware naar `/welcome` of `/chat` gestuurd; dit is fallback. */
export default function Home() {
  redirect("/welcome");
}
