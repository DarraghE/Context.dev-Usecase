import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectPlatform, parseExport, UnsupportedExportError } from "@/parsers";
import { findSidecar } from "@/parsers/google_takeout";
import { repairMojibake } from "@/parsers/mojibake";

const fx = (f: string) => path.resolve("fixtures", "exports", f);

describe("parsers (§7.1)", () => {
  it("Instagram (your_instagram_activity/content layout)", async () => {
    const r = await parseExport(fx("aino_instagram.zip"));
    expect(r.platform).toBe("instagram");
    expect(r.stats.videos_skipped).toBe(2);
    expect(r.items.filter((i) => i.kind === "photo").length).toBe(r.stats.photos_queued);
    const proposal = r.items.find((i) => i.sourcePath.endsWith("aino_proposal.jpg"))!;
    expect(proposal.caption).toBe("SHE SAID YES 💍 #arthursseat #edinburgh");
    expect(proposal.lat).toBeCloseTo(55.9441, 4);
    expect(proposal.takenAt).toBe("2024-06-14T17:40:00.000Z"); // 18:40 BST
  });

  it("Instagram legacy layout (content/posts_1.json) with a carousel", async () => {
    const r = await parseExport(fx("instagram_legacy.zip"));
    expect(r.platform).toBe("instagram");
    expect(r.items).toHaveLength(3);
    const car = r.items.filter((i) => i.caption === "Two-photo carousel – Jäätelö!");
    expect(car).toHaveLength(2);
    expect(car[0]!.postRef).toBe(car[1]!.postRef);
  });

  it("Google Takeout with both sidecar namings, duplicates, video, HEIC", async () => {
    const r = await parseExport(fx("sam_google_takeout.zip"));
    expect(r.platform).toBe("google_photos");
    expect(r.stats.videos_skipped).toBe(1);
    expect(r.stats.unsupported_skipped).toBe(1);
    const fd = r.items.find((i) => i.sourcePath.endsWith("IMG_20210903_193012.jpg"))!;
    expect(fd.caption).toMatch(/^First date\./);
    expect(fd.lat).toBeCloseTo(60.15238, 5);
    const tiny = r.items.find((i) => i.sourcePath.endsWith("IMG_20220602_090000.jpg"))!;
    expect(tiny.lat).toBeNull(); // geoData 0,0 means no location
  });

  it("Facebook check-ins, photo posts, text posts and comments", async () => {
    const r = await parseExport(fx("facebook_variant.zip"), { uploaderName: "Sam Carter" });
    expect(r.platform).toBe("facebook");
    const photo = r.items.find((i) => i.kind === "photo")!;
    expect(photo.placeName).toBe("Löyly");
    expect(photo.caption).toBe("First date at Löyly 🧖 the salmon soup!!");
    expect(r.items.find((i) => i.kind === "checkin")?.placeName).toBe("Café Regatta");
    expect(r.items.find((i) => i.kind === "post_text")?.caption).toBe("Sunday walk, no food today");
    expect(r.items.find((i) => i.kind === "comment")?.authoredByOther).toBe(true);
    expect(r.stats.videos_skipped).toBe(1);
  });

  it("rejects an unrecognised zip with a message naming the supported platforms (US-2 AC5)", async () => {
    await expect(parseExport(fx("not_an_export.zip"))).rejects.toBeInstanceOf(UnsupportedExportError);
    await expect(parseExport(fx("not_an_export.zip"))).rejects.toThrow(/Instagram.*Facebook.*Google Photos/);
  });

  it("detects by structure, not file name", () => {
    expect(detectPlatform(["x/your_instagram_activity/posts/posts_1.json"])).toBe("instagram");
    expect(detectPlatform(["Takeout/Google Fotos/Album/a.jpg", "Takeout/Google Fotos/Album/a.jpg.json"])).toBe("google_photos");
    expect(detectPlatform(["instagram-export/notes.txt"])).toBe("unknown");
  });

  it("finds Takeout sidecars across naming variants", () => {
    const names = new Set(["A/IMG_1.jpg.json", "A/IMG_2.jpg.supplemental-metadata.json", "A/IMG_3.jpg.supplemental-metad.json", "A/IMG_4.jpg(1).json"]);
    expect(findSidecar("A/IMG_1.jpg", names)).toBe("A/IMG_1.jpg.json");
    expect(findSidecar("A/IMG_2.jpg", names)).toBe("A/IMG_2.jpg.supplemental-metadata.json");
    expect(findSidecar("A/IMG_3.jpg", names)).toBe("A/IMG_3.jpg.supplemental-metad.json");
    expect(findSidecar("A/IMG_4(1).jpg", names)).toBe("A/IMG_4.jpg(1).json");
  });

  it("repairs mojibake and leaves correct text alone", () => {
    expect(repairMojibake("SHE SAID YES ð\u009f\u0092\u008d")).toBe("SHE SAID YES 💍");
    expect(repairMojibake("LÃ¶yly")).toBe("Löyly");
    expect(repairMojibake("Löyly")).toBe("Löyly");
    expect(repairMojibake("café 💍")).toBe("café 💍");
  });
});
