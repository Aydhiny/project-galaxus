import { Suspense } from "react";
import LoginPage from "./login-client";

export default function Page() {
  return (
    // Suspense: the client reads ?callbackUrl= via useSearchParams.
    <Suspense>
      <LoginPage
        googleEnabled={!!process.env.GOOGLE_CLIENT_ID}
        githubEnabled={!!process.env.GITHUB_CLIENT_ID}
      />
    </Suspense>
  );
}
