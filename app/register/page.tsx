import RegisterPage from "./register-client";

export default function Page() {
  return (
    <RegisterPage
      googleEnabled={!!process.env.GOOGLE_CLIENT_ID}
      githubEnabled={!!process.env.GITHUB_CLIENT_ID}
    />
  );
}
