import LoginPage from "./login-client";

export default function Page() {
  return (
    <LoginPage
      googleEnabled={!!process.env.GOOGLE_CLIENT_ID}
      githubEnabled={!!process.env.GITHUB_CLIENT_ID}
    />
  );
}
