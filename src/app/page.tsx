import { redirect } from "next/navigation";

/**
 * The real application is the static Vanilla-JS site in `public/`.
 * The `/` route is rewritten to `/index.html` (see next.config.ts beforeFiles);
 * this component is only a safety net if rewrites are bypassed.
 */
export default function Home() {
  redirect("/index.html");
}
