import { Suspense } from "react";
import { LoginPanel } from "@/src/Web/Components/LoginPanel";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPanel />
    </Suspense>
  );
}
