import type { Metadata } from "next";
import ForgotPasswordForm from "@/components/ForgotPasswordForm";

export const metadata: Metadata = { title: "Reset password", robots: { index: false, follow: false } };

export default function ResetPasswordPage() {
  return <ForgotPasswordForm resetOnly />;
}
