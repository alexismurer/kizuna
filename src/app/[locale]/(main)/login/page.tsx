import { AuthFeatures } from "@/components/auth/AuthFeatures";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginPanel } from "@/components/auth/LoginPanel";

export default function LoginPage() {
  return (
    <AuthShell below={<AuthFeatures />}>
      <LoginPanel devLogin={process.env.NEXT_PUBLIC_DEV_LOGIN === "true"} />
    </AuthShell>
  );
}
