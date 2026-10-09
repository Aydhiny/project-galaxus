import { Suspense } from "react";
import RegisterPage from "./register-client";

export default function Page() {
  return (
    // Suspense: OAuthButtons reads ?callbackUrl= via useSearchParams.
    <Suspense>
      <RegisterPage
        googleEnabled={!!process.env.GOOGLE_CLIENT_ID}
        githubEnabled={!!process.env.GITHUB_CLIENT_ID}
      />
    </Suspense>
  );
}
