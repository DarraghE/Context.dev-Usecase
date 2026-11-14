import { PublicHeader } from "@/components/AppShell";
import { InviteExchange } from "@/components/InviteExchange";

export const metadata = { title: "Signing you in" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <>
      <PublicHeader />
      <main id="main">
        <div className="container narrow">
          <InviteExchange token={token} />
        </div>
      </main>
    </>
  );
}
