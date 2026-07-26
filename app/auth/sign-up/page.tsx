import { SignUpForm } from "@/components/sign-up-form";
import { DEFAULT_POST_AUTH_PATH } from "@/lib/auth-redirect";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <SignUpForm next={next ?? DEFAULT_POST_AUTH_PATH} />
      </div>
    </div>
  );
}
