import { PublicHeader } from "@/components/AppShell";

export const metadata = { title: "Privacy" };

const ROWS: [string, string][] = [
  ["Consent first", "Nothing is processed until that partner has consented. Each partner consents separately and can withdraw at any time; withdrawal deletes their data within 5 minutes."],
  ["Your files, deleted fast", "Uploaded exports are deleted as soon as parsing and food detection finish, and never later than 24 hours after upload."],
  ["No full photos kept", "Each photo is looked at once. We keep only a crop of the food, and only when food was found. Image metadata (EXIF, including GPS) is stripped."],
  ["The chef sees only what you approve", "Hidden and unreviewed memories never leave your account. Sensitive moments start hidden. Faces are blurred in every image the chef sees; if face detection fails, the chef gets no image."],
  ["No face recognition", "We never identify people or infer identities. Comments written by other people are never shown to anyone."],
  ["Public web only", "Context.dev reads restaurants' public websites. It receives a venue name and city or a public web address — never your photos, names, locations or dates."],
  ["Automatic deletion", "Everything is deleted 30 days after the wedding date. The caterer can delete a booking at any time."],
  ["Roles", "Your caterer is the data controller. Wedding Food Memory is the processor. Production hosting is in the EU."],
];

export default function Privacy() {
  return (
    <>
      <PublicHeader />
      <main id="main">
        <div className="container narrow stack-lg">
          <div className="page-head">
            <div className="eyebrow">Privacy notice</div>
            <h1>How your data is handled</h1>
            <p className="muted">The short version of what you agree to on the consent screen. The full text is shown to each partner before anything is uploaded.</p>
          </div>
          <div className="card">
            <dl className="stack" style={{ margin: 0 }}>
              {ROWS.map(([k, v]) => (
                <div key={k}>
                  <dt style={{ fontWeight: 700 }}>{k}</dt>
                  <dd style={{ margin: "4px 0 0" }} className="muted">
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </main>
    </>
  );
}
