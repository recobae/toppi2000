import { BackToProfileLink } from "@/components/profile/back-to-profile-link";
import { OrteSearchPanel } from "@/components/orte/orte-search-panel";

export default function OrtePage() {
  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-6 items-center max-w-5xl p-5">
        <div className="w-full flex flex-col gap-2 pt-8">
          <BackToProfileLink />
          <h1 className="font-medium text-xl">Orte durchsuchen</h1>
        </div>
        <OrteSearchPanel />
      </div>
    </main>
  );
}
