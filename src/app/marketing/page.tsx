import { redirect } from "next/navigation";

/**
 * Public marketing lives at `/` only. This route used to host an internal hub;
 * keep dev screenshot routes under `/marketing/*` — the index redirects away
 * so there is no competing consumer landing.
 */
export default function MarketingIndexRedirect() {
  redirect("/");
}
