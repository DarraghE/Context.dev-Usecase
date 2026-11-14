import { rng, type FoodKind, type SceneKind } from "./paint";

/**
 * The synthetic demo dataset (§12): a fictional couple, Aino & Sam. No real people's data.
 * This manifest is also the test oracle (which photos are food, which moment must rank first).
 */
export type TextNote = {
  food?: { text: string; normalised: string; category: string }[];
  cues?: { type: string; quote: string; confidence: number }[];
  sentiment?: number;
  sensitive?: string[];
  others?: boolean;
};

export type FoodInfo = { dish_name: string; dish_generic: string; category: string; cuisine: string; homemade: boolean; confidence: number };

export type Entry = {
  id: string;
  owner: "aino" | "sam";
  local: string; // local wall time, YYYY-MM-DDTHH:mm
  tz: string;
  lat?: number;
  lng?: number;
  caption?: string;
  text?: TextNote;
  food?: { kind: FoodKind; faceCorner?: boolean };
  scene?: { kind: SceneKind; people?: number };
  couple?: boolean;
  album?: string;
  post?: string; // Instagram carousel id
  beat?: string; // story beat label (oracle)
};

export const COUPLE = {
  name: "Aino & Sam",
  partnerA: { name: "Aino Laine", email: "aino.laine@example.com" },
  partnerB: { name: "Sam Carter", email: "sam.carter@example.com" },
  chef: { name: "Chef Elias Nyström", email: "elias@juhla-catering.example" },
  weddingDate: "2027-06-12",
  relationshipStart: "2021-09-03",
  dietary: { allergies: ["nut allergy"], diets: { vegan: 2 }, notes: "1 guest with a severe nut allergy (tree nuts). 2 vegan guests." },
};

export const HOME = { lat: 60.1841, lng: 24.9497 }; // Kallio, Helsinki
export const COTTAGE = { lat: 61.4013, lng: 25.3021 };

export const FOOD_INFO: Record<FoodKind, { items: FoodInfo[]; scene: "restaurant" | "home" | "outdoor" | "event" | "other"; setting?: string[] }> = {
  eton_mess: { scene: "restaurant", items: [{ dish_name: "Eton mess", dish_generic: "meringue, cream and strawberry dessert", category: "dessert", cuisine: "British", homemade: false, confidence: 0.93 }] },
  salmon_soup: {
    scene: "restaurant",
    items: [
      { dish_name: "Salmon soup", dish_generic: "creamy salmon soup", category: "main", cuisine: "Finnish", homemade: false, confidence: 0.9 },
      { dish_name: "Rye bread", dish_generic: "dark rye bread", category: "bread", cuisine: "Finnish", homemade: false, confidence: 0.74 },
    ],
  },
  pizza_margherita: { scene: "restaurant", items: [{ dish_name: "Pizza margherita", dish_generic: "neapolitan pizza", category: "main", cuisine: "Italian", homemade: false, confidence: 0.95 }] },
  pizza_marinara: { scene: "restaurant", items: [{ dish_name: "Pizza marinara", dish_generic: "neapolitan pizza", category: "main", cuisine: "Italian", homemade: false, confidence: 0.91 }] },
  pizza_portafoglio: { scene: "outdoor", items: [{ dish_name: "Pizza a portafoglio", dish_generic: "neapolitan pizza", category: "snack", cuisine: "Italian", homemade: false, confidence: 0.84 }] },
  risotto: { scene: "home", items: [{ dish_name: "Mushroom risotto", dish_generic: "mushroom risotto", category: "main", cuisine: "Italian", homemade: true, confidence: 0.88 }] },
  pea_soup_tray: { scene: "other", setting: ["hospital_or_medical"], items: [{ dish_name: "Pea soup", dish_generic: "pea soup", category: "main", cuisine: "Finnish", homemade: false, confidence: 0.81 }] },
  cinnamon_bun: { scene: "restaurant", items: [{ dish_name: "Cinnamon bun", dish_generic: "cinnamon bun", category: "snack", cuisine: "Finnish", homemade: false, confidence: 0.9 }] },
  birthday_cake: { scene: "home", items: [{ dish_name: "Chocolate birthday cake", dish_generic: "chocolate layer cake", category: "cake", cuisine: "International", homemade: true, confidence: 0.9 }] },
  christmas_table: {
    scene: "home",
    items: [
      { dish_name: "Christmas ham", dish_generic: "roast ham", category: "main", cuisine: "Finnish", homemade: true, confidence: 0.85 },
      { dish_name: "Rosolli", dish_generic: "beetroot salad", category: "starter", cuisine: "Finnish", homemade: true, confidence: 0.76 },
    ],
  },
  ramen: { scene: "restaurant", items: [{ dish_name: "Ramen", dish_generic: "japanese noodle soup", category: "main", cuisine: "Japanese", homemade: false, confidence: 0.9 }] },
  ice_cream: { scene: "outdoor", items: [{ dish_name: "Ice cream cone", dish_generic: "ice cream", category: "dessert", cuisine: "International", homemade: false, confidence: 0.88 }] },
  croissant: {
    scene: "restaurant",
    items: [
      { dish_name: "Croissant", dish_generic: "croissant", category: "bread", cuisine: "French", homemade: false, confidence: 0.9 },
      { dish_name: "Café crème", dish_generic: "coffee", category: "drink", cuisine: "French", homemade: false, confidence: 0.7 },
    ],
  },
  latte: { scene: "restaurant", items: [{ dish_name: "Latte", dish_generic: "coffee", category: "drink", cuisine: "International", homemade: false, confidence: 0.85 }] },
  salad: { scene: "restaurant", items: [{ dish_name: "Greek salad", dish_generic: "green salad", category: "starter", cuisine: "Greek", homemade: false, confidence: 0.8 }] },
  pancakes: { scene: "home", items: [{ dish_name: "Pancakes with berries", dish_generic: "pancakes", category: "dessert", cuisine: "Finnish", homemade: true, confidence: 0.86 }] },
  canapes: {
    scene: "event",
    items: [
      { dish_name: "Canapés", dish_generic: "canapés", category: "snack", cuisine: "International", homemade: false, confidence: 0.78 },
      { dish_name: "Champagne", dish_generic: "sparkling wine", category: "drink", cuisine: "French", homemade: false, confidence: 0.7 },
    ],
  },
  sushi: { scene: "restaurant", items: [{ dish_name: "Maki sushi", dish_generic: "sushi", category: "main", cuisine: "Japanese", homemade: false, confidence: 0.9 }] },
  burger: { scene: "restaurant", items: [{ dish_name: "Cheeseburger", dish_generic: "burger", category: "main", cuisine: "American", homemade: false, confidence: 0.92 }] },
  blueberry_pie: { scene: "home", items: [{ dish_name: "Blueberry pie", dish_generic: "blueberry pie", category: "dessert", cuisine: "Finnish", homemade: true, confidence: 0.88 }] },
  vongole: { scene: "restaurant", items: [{ dish_name: "Spaghetti alle vongole", dish_generic: "clam pasta", category: "main", cuisine: "Italian", homemade: false, confidence: 0.86 }] },
  reindeer: { scene: "restaurant", items: [{ dish_name: "Sautéed reindeer", dish_generic: "sauteed reindeer", category: "main", cuisine: "Finnish", homemade: false, confidence: 0.87 }] },
  karelian_pies: { scene: "home", items: [{ dish_name: "Karelian pies", dish_generic: "karelian pie", category: "snack", cuisine: "Finnish", homemade: true, confidence: 0.86 }] },
  sausages: { scene: "outdoor", items: [{ dish_name: "Grilled sausages", dish_generic: "grilled sausage", category: "main", cuisine: "Finnish", homemade: true, confidence: 0.82 }] },
  tacos: { scene: "home", items: [{ dish_name: "Tacos", dish_generic: "tacos", category: "main", cuisine: "Mexican", homemade: true, confidence: 0.85 }] },
  waffles: { scene: "restaurant", items: [{ dish_name: "Waffles", dish_generic: "waffles", category: "dessert", cuisine: "Belgian", homemade: false, confidence: 0.86 }] },
  fish_chips: { scene: "outdoor", items: [{ dish_name: "Fish and chips", dish_generic: "fish and chips", category: "main", cuisine: "British", homemade: false, confidence: 0.9 }] },
  smoothie_bowl: { scene: "home", items: [{ dish_name: "Smoothie bowl", dish_generic: "smoothie bowl", category: "snack", cuisine: "International", homemade: true, confidence: 0.8 }] },
  dumplings: { scene: "home", items: [{ dish_name: "Dumplings", dish_generic: "dumplings", category: "main", cuisine: "Chinese", homemade: true, confidence: 0.85 }] },
  cheese_board: {
    scene: "home",
    items: [
      { dish_name: "Cheese board", dish_generic: "cheese platter", category: "snack", cuisine: "French", homemade: true, confidence: 0.82 },
      { dish_name: "Red wine", dish_generic: "wine", category: "drink", cuisine: "French", homemade: true, confidence: 0.75 },
    ],
  },
};

const m = (text: string, normalised: string, category: string) => ({ text, normalised, category });
const cue = (type: string, quote: string, confidence: number) => ({ type, quote, confidence });

/** Seeded story beats and everyday food photos. */
const FOOD_ENTRIES: Entry[] = [
  // --- Aino (Instagram) ---
  { id: "aino_proposal", owner: "aino", local: "2024-06-14T18:40", tz: "Europe/London", lat: 55.9441, lng: -3.1618, couple: true, beat: "proposal", caption: "SHE SAID YES 💍 #arthursseat #edinburgh", text: { cues: [cue("proposal", "SHE SAID YES", 0.97)], sentiment: 0.98 } },
  { id: "aino_eton_mess", owner: "aino", local: "2024-06-14T20:50", tz: "Europe/London", lat: 55.9418, lng: -3.1451, food: { kind: "eton_mess", faceCorner: true }, beat: "proposal", caption: "Celebration Eton mess at the Sheep Heid 🍓 still shaking", text: { food: [m("Eton mess", "Eton mess", "dessert")], cues: [cue("engagement_celebration", "Celebration", 0.6)], sentiment: 0.95 } },
  { id: "aino_risotto", owner: "aino", local: "2025-06-14T19:10", tz: "Europe/Helsinki", lat: HOME.lat, lng: HOME.lng, food: { kind: "risotto" }, beat: "anniversary", caption: "One year since you said yes ❤️ homemade mushroom risotto, quiet night in", text: { food: [m("mushroom risotto", "Mushroom risotto", "main")], cues: [cue("anniversary", "One year since you said yes", 0.9)], sentiment: 0.9 } },
  { id: "aino_bun", owner: "aino", local: "2022-03-06T11:20", tz: "Europe/Helsinki", lat: 60.1786, lng: 24.9095, food: { kind: "cinnamon_bun" }, caption: "Sunday korvapuusti by the sea ☕", text: { food: [m("korvapuusti", "Cinnamon bun", "snack")], sentiment: 0.7 } },
  { id: "aino_cake", owner: "aino", local: "2023-02-10T20:00", tz: "Europe/Helsinki", lat: HOME.lat, lng: HOME.lng, food: { kind: "birthday_cake" }, caption: "Sam's 30th 🎂 chocolate cake, three layers, zero regrets", text: { food: [m("chocolate cake", "Chocolate birthday cake", "cake")], cues: [cue("birthday", "30th", 0.85)], sentiment: 0.9 } },
  { id: "aino_christmas", owner: "aino", local: "2022-12-24T17:30", tz: "Europe/Helsinki", lat: 60.2055, lng: 24.6559, food: { kind: "christmas_table" }, caption: "Christmas Eve at mum's: ham, rosolli and far too many casseroles 🎄", text: { food: [m("ham", "Christmas ham", "main"), m("rosolli", "Rosolli", "starter")], cues: [cue("holiday_celebration", "Christmas Eve", 0.9), cue("family_gathering", "at mum's", 0.6)], sentiment: 0.8, others: true } },
  { id: "aino_ramen", owner: "aino", local: "2023-10-20T18:00", tz: "Europe/Helsinki", lat: 60.165, lng: 24.9401, food: { kind: "ramen" }, caption: "Rainy day ramen 🍜", text: { food: [m("ramen", "Ramen", "main")], sentiment: 0.6 } },
  { id: "aino_icecream", owner: "aino", local: "2022-07-15T15:00", tz: "Europe/Helsinki", lat: 60.1675, lng: 24.9531, food: { kind: "ice_cream" }, caption: "First ice cream of the summer", text: { food: [m("ice cream", "Ice cream cone", "dessert")], sentiment: 0.7 } },
  { id: "aino_croissant", owner: "aino", local: "2022-04-16T09:00", tz: "Europe/Paris", lat: 48.853, lng: 2.3499, food: { kind: "croissant" }, caption: "Breakfast in Paris 🥐 #weekendaway", text: { food: [m("croissant", "Croissant", "bread")], cues: [cue("trip", "weekendaway", 0.8)], sentiment: 0.85 } },
  { id: "aino_canapes", owner: "aino", local: "2024-06-22T19:00", tz: "Europe/Helsinki", lat: HOME.lat, lng: HOME.lng, food: { kind: "canapes" }, caption: "Engagement party with all our favourite people 🥂", text: { food: [m("canapés", "Canapés", "snack")], cues: [cue("engagement_celebration", "Engagement party", 0.92)], sentiment: 0.92, others: true } },
  { id: "aino_pancakes", owner: "aino", local: "2024-02-13T18:00", tz: "Europe/Helsinki", lat: HOME.lat, lng: HOME.lng, food: { kind: "pancakes" }, caption: "Laskiainen pancakes, as tradition demands", text: { food: [m("pancakes", "Pancakes with berries", "dessert")], cues: [cue("holiday_celebration", "Laskiainen", 0.6)], sentiment: 0.7 } },
  { id: "aino_sushi", owner: "aino", local: "2023-03-18T19:30", tz: "Europe/Helsinki", lat: 60.163, lng: 24.9331, food: { kind: "sushi" }, caption: "Sushi date night", text: { food: [m("sushi", "Maki sushi", "main")], sentiment: 0.75 } },
  { id: "aino_pie", owner: "aino", local: "2023-08-20T16:00", tz: "Europe/Helsinki", lat: COTTAGE.lat, lng: COTTAGE.lng, food: { kind: "blueberry_pie" }, caption: "Mökki blueberry pie, berries picked this morning", text: { food: [m("blueberry pie", "Blueberry pie", "dessert")], sentiment: 0.85 } },
  { id: "aino_cheese", owner: "aino", local: "2024-09-14T21:00", tz: "Europe/Helsinki", lat: HOME.lat, lng: HOME.lng, food: { kind: "cheese_board" }, caption: "Wine & cheese night… maybe too much wine 🍷", text: { food: [m("cheese", "Cheese board", "snack"), m("wine", "Red wine", "drink")], sensitive: ["alcohol_heavy"], sentiment: 0.6 } },
  { id: "aino_smoothie", owner: "aino", local: "2024-08-10T09:00", tz: "Europe/Helsinki", lat: HOME.lat, lng: HOME.lng, food: { kind: "smoothie_bowl" }, caption: "Post-run smoothie bowl", text: { food: [m("smoothie bowl", "Smoothie bowl", "snack")], sentiment: 0.5 } },

  // --- Sam (Google Takeout) ---
  { id: "IMG_20210903_193012", owner: "sam", local: "2021-09-03T19:30", tz: "Europe/Helsinki", lat: 60.15238, lng: 24.93731, food: { kind: "salmon_soup" }, album: "Photos from 2021", beat: "first_date", caption: "First date. She ordered the salmon soup and stole half my rye bread 🙈 #löyly", text: { food: [m("salmon soup", "Salmon soup", "main"), m("rye bread", "Rye bread", "bread")], cues: [cue("first_date", "First date", 0.95)], sentiment: 0.85 } },
  { id: "IMG_20230511_210402", owner: "sam", local: "2023-05-11T21:04", tz: "Europe/Rome", lat: 40.8381, lng: 14.2502, food: { kind: "vongole" }, album: "Naples 2023", caption: "Arrived! Spaghetti alle vongole by the harbour", text: { food: [m("spaghetti alle vongole", "Spaghetti alle vongole", "main")], cues: [cue("trip", "Arrived!", 0.85)], sentiment: 0.85 } },
  { id: "IMG_20230512_201533", owner: "sam", local: "2023-05-12T20:15", tz: "Europe/Rome", lat: 40.84972, lng: 14.26331, food: { kind: "pizza_margherita" }, album: "Naples 2023", beat: "pizza_trip", caption: "Naples day 1: the original margherita at Da Michele 🍕", text: { food: [m("margherita", "Pizza margherita", "main")], cues: [cue("trip", "Naples day 1", 0.9)], sentiment: 0.9 } },
  { id: "IMG_20230513_133011", owner: "sam", local: "2023-05-13T13:30", tz: "Europe/Rome", lat: 40.85593, lng: 14.24702, food: { kind: "pizza_marinara" }, album: "Naples 2023", beat: "pizza_trip", caption: "Day 2: Starita's marinara. Even better than yesterday?!", text: { food: [m("marinara", "Pizza marinara", "main")], cues: [cue("trip", "Day 2", 0.85)], sentiment: 0.9 } },
  { id: "IMG_20230514_211047", owner: "sam", local: "2023-05-14T21:10", tz: "Europe/Rome", lat: 40.85102, lng: 14.25498, food: { kind: "pizza_portafoglio" }, album: "Naples 2023", beat: "pizza_trip", caption: "Last night in Napoli: pizza a portafoglio on the street", text: { food: [m("pizza a portafoglio", "Pizza a portafoglio", "snack")], cues: [cue("trip", "Last night in Napoli", 0.85)], sentiment: 0.8 } },
  { id: "IMG_20221108_123015", owner: "sam", local: "2022-11-08T12:30", tz: "Europe/Helsinki", lat: 60.19061, lng: 24.90642, food: { kind: "pea_soup_tray" }, album: "Photos from 2022", beat: "sensitive", caption: "Hospital cafeteria lunch while Grandma recovers. Pea soup, as always.", text: { food: [m("pea soup", "Pea soup", "main")], cues: [cue("family_gathering", "while Grandma recovers", 0.4)], sentiment: -0.2, sensitive: ["hospital_or_medical", "other_people_private"], others: true } },
  { id: "IMG_20220219_190244", owner: "sam", local: "2022-02-19T19:02", tz: "Europe/Helsinki", lat: 66.5039, lng: 25.7294, food: { kind: "reindeer" }, album: "Lapland 2022", caption: "Sautéed reindeer after a day with the huskies ❄️", text: { food: [m("reindeer", "Sautéed reindeer", "main")], cues: [cue("trip", "a day with the huskies", 0.8)], sentiment: 0.85 } },
  { id: "IMG_20230624_100512", owner: "sam", local: "2023-06-24T10:05", tz: "Europe/Helsinki", lat: COTTAGE.lat, lng: COTTAGE.lng, food: { kind: "karelian_pies" }, album: "Photos from 2023", caption: "Juhannus breakfast: karelian pies with egg butter", text: { food: [m("karelian pies", "Karelian pies", "snack")], cues: [cue("holiday_celebration", "Juhannus", 0.85)], sentiment: 0.8 } },
  { id: "IMG_20230623_210933", owner: "sam", local: "2023-06-23T21:09", tz: "Europe/Helsinki", lat: 61.4022, lng: 25.3009, food: { kind: "sausages" }, album: "Photos from 2023", caption: "Midsummer eve sausages on the grill 🔥", text: { food: [m("sausages", "Grilled sausages", "main")], cues: [cue("holiday_celebration", "Midsummer eve", 0.85)], sentiment: 0.8 } },
  { id: "IMG_20240505_190122", owner: "sam", local: "2024-05-05T19:01", tz: "Europe/Helsinki", lat: HOME.lat, lng: HOME.lng, food: { kind: "tacos" }, album: "Photos from 2024", caption: "Taco Sunday", text: { food: [m("tacos", "Tacos", "main")], sentiment: 0.6 } },
  { id: "IMG_20221002_140511", owner: "sam", local: "2022-10-02T14:05", tz: "Europe/Helsinki", lat: 60.17, lng: 24.9451, food: { kind: "waffles" }, album: "Photos from 2022", caption: "Waffles at the market hall", text: { food: [m("waffles", "Waffles", "dessert")], sentiment: 0.6 } },
  { id: "IMG_20240615_130144", owner: "sam", local: "2024-06-15T13:01", tz: "Europe/London", lat: 55.953, lng: -3.1101, food: { kind: "fish_chips" }, album: "Edinburgh 2024", caption: "Day after: recovery fish & chips by the sea in Portobello 🌊", text: { food: [m("fish & chips", "Fish and chips", "main")], cues: [cue("trip", "by the sea in Portobello", 0.7)], sentiment: 0.85 } },
  { id: "IMG_20230122_183020", owner: "sam", local: "2023-01-22T18:30", tz: "Europe/Helsinki", lat: HOME.lat, lng: HOME.lng, food: { kind: "dumplings" }, album: "Photos from 2023", caption: "Dumpling-folding night for Lunar New Year 🥟", text: { food: [m("dumplings", "Dumplings", "main")], cues: [cue("holiday_celebration", "Lunar New Year", 0.7)], sentiment: 0.8 } },
  { id: "IMG_20220910_190311", owner: "sam", local: "2022-09-10T19:03", tz: "Europe/Helsinki", lat: 60.16, lng: 24.9201, food: { kind: "burger" }, album: "Photos from 2022", caption: "Burger night", text: { food: [m("burger", "Cheeseburger", "main")], sentiment: 0.6 } },
  { id: "IMG_20230803_120233", owner: "sam", local: "2023-08-03T12:02", tz: "Europe/Helsinki", lat: 60.169, lng: 24.9381, food: { kind: "salad" }, album: "Photos from 2023", caption: "Desk lunch salad", text: { food: [m("salad", "Greek salad", "starter")], sentiment: 0.2 } },
  { id: "IMG_20240112_083012", owner: "sam", local: "2024-01-12T08:30", tz: "Europe/Helsinki", lat: 60.168, lng: 24.9411, food: { kind: "latte" }, album: "Photos from 2024", caption: "Monday fuel ☕", text: { food: [m("coffee", "Latte", "drink")], sentiment: 0.4 } },
];

const NONFOOD_CAPTIONS = [
  "Sunset over Suomenlinna",
  "Morning run along the shore",
  "Sunday walk",
  "New plant for the balcony",
  "Book club pick for this month",
  "Rainy Helsinki",
  "Weekend hike in Nuuksio",
  "Snow day!",
  "Concert night",
  "New bike, who dis",
  "View from the office",
  "Sauna and sea, the only way",
  "Autumn colours",
  "First snow of the year",
  "Finally fixed the shelf",
  "Golden hour",
];
const PEOPLE_CAPTIONS = ["Friends!", "Reunion with the old crew", "Team day out", "Cousins", "Wedding of the year (not ours, yet)"];

const TRIP_DAYS = [
  { day: "2023-05-12", tz: "Europe/Rome", lat: 40.8518, lng: 14.2681, caption: "Vesuvius from the waterfront", owner: "sam" as const, album: "Naples 2023" },
  { day: "2023-05-13", tz: "Europe/Rome", lat: 40.8359, lng: 14.2488, caption: "Castel dell'Ovo", owner: "sam" as const, album: "Naples 2023" },
  { day: "2024-06-14", tz: "Europe/London", lat: 55.9486, lng: -3.1999, caption: "Castle views before the big climb", owner: "aino" as const },
  { day: "2022-04-16", tz: "Europe/Paris", lat: 48.8584, lng: 2.2945, caption: "Obligatory tower photo", owner: "aino" as const },
  { day: "2022-02-19", tz: "Europe/Helsinki", lat: 66.54, lng: 25.85, caption: "Husky safari!", owner: "sam" as const, album: "Lapland 2022" },
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** ~170 non-food photos with captions, dates and coordinates spread over five years. */
function nonFood(): Entry[] {
  const out: Entry[] = [];
  const r = rng(20261114);
  const scenes: SceneKind[] = ["landscape", "lake", "city", "object", "people", "snow", "landscape", "lake", "city", "object"];
  for (let i = 0; i < 166; i++) {
    const owner = i % 2 === 0 ? "aino" : "sam";
    const year = 2021 + Math.floor(r() * 5);
    const month = 1 + Math.floor(r() * 12);
    const day = 1 + Math.floor(r() * 28);
    const hour = 8 + Math.floor(r() * 13);
    const kind = scenes[Math.floor(r() * scenes.length)]!;
    const hasCaption = r() > 0.35;
    const caption = hasCaption ? (kind === "people" ? PEOPLE_CAPTIONS[Math.floor(r() * PEOPLE_CAPTIONS.length)]! : NONFOOD_CAPTIONS[Math.floor(r() * NONFOOD_CAPTIONS.length)]!) : undefined;
    const date = `${year}-${pad(month)}-${pad(day)}`;
    const id = owner === "aino" ? `aino_${pad(Math.floor(i / 2) + 1)}x` : `IMG_${date.replace(/-/g, "")}_${pad(hour)}${pad(Math.floor(r() * 60))}${pad(i % 60)}`;
    out.push({
      id,
      owner,
      local: `${date}T${pad(hour)}:${pad(Math.floor(r() * 60))}`,
      tz: "Europe/Helsinki",
      lat: 60.15 + r() * 0.08,
      lng: 24.85 + r() * 0.18,
      scene: { kind, people: kind === "people" ? 1 + Math.floor(r() * 3) : undefined },
      caption,
      text: caption ? { sentiment: 0.5, others: kind === "people" } : undefined,
      album: owner === "sam" ? `Photos from ${year}` : undefined,
      post: owner === "aino" && i % 11 === 0 ? `carousel_${i}` : undefined,
    });
  }
  for (const [i, t] of TRIP_DAYS.entries()) {
    out.push({
      id: t.owner === "aino" ? `aino_trip_${i}` : `IMG_${t.day.replace(/-/g, "")}_1100${pad(i)}`,
      owner: t.owner,
      local: `${t.day}T11:00`,
      tz: t.tz,
      lat: t.lat,
      lng: t.lng,
      scene: { kind: "landscape" },
      caption: t.caption,
      text: { sentiment: 0.8 },
      album: t.album,
    });
  }
  // Tricky non-food: food on an advert, on a screen, and a menu board (must not count as food).
  out.push({ id: "aino_billboard", owner: "aino", local: "2023-04-02T13:00", tz: "Europe/Helsinki", lat: 60.1699, lng: 24.9384, scene: { kind: "advert" }, caption: "This billboard follows me everywhere", text: { sentiment: 0.1 } });
  out.push({ id: "IMG_20240302_210000", owner: "sam", local: "2024-03-02T21:00", tz: "Europe/Helsinki", lat: HOME.lat, lng: HOME.lng, scene: { kind: "screen" }, caption: "Bake-off finale", album: "Photos from 2024", text: { sentiment: 0.5 } });
  out.push({ id: "aino_menuboard", owner: "aino", local: "2023-09-09T12:00", tz: "Europe/Helsinki", lat: 60.1711, lng: 24.9442, scene: { kind: "menu_board" }, text: undefined });
  return out;
}

export function manifest(): Entry[] {
  return [...FOOD_ENTRIES, ...nonFood()];
}

/* -------------------------- authored replay outputs ------------------------- */

/** Place resolution (Claude + web search) for the seeded venues. Everything else: not found. */
export const PLACE_RESOLUTIONS: Record<string, { venue_name: string | null; address: string | null; city: string | null; website_url: string | null; confidence: number; evidence: string }> = {
  aino_eton_mess: { venue_name: "The Sheep Heid Inn", address: "43-45 The Causeway, Edinburgh EH15 3QA", city: "Edinburgh", website_url: "https://www.thesheepheidedinburgh.co.uk/", confidence: 0.86, evidence: "Historic pub in Duddingston village at the foot of Arthur's Seat, about 40 m from the coordinates; serves puddings including Eton mess." },
  IMG_20210903_193012: { venue_name: "Löyly", address: "Hernesaarenranta 4, 00150 Helsinki", city: "Helsinki", website_url: "https://www.loylyhelsinki.fi/", confidence: 0.93, evidence: "Sauna restaurant on the Hernesaari shore at these coordinates; its menu lists a salmon soup." },
  IMG_20230512_201533: { venue_name: "L'Antica Pizzeria da Michele", address: "Via Cesare Sersale 1, 80139 Napoli", city: "Naples", website_url: "https://www.damichele.net/", confidence: 0.94, evidence: "The historic pizzeria at Via Cesare Sersale, known for margherita and marinara only." },
  IMG_20230513_133011: { venue_name: "Pizzeria Starita", address: "Via Materdei 27/28, 80136 Napoli", city: "Naples", website_url: "https://pizzeriestarita.it/", confidence: 0.9, evidence: "Pizzeria Starita in Materdei, about 30 m from the coordinates; famous for its marinara and montanara." },
  IMG_20230514_211047: { venue_name: null, address: null, city: "Naples", website_url: null, confidence: 0.35, evidence: "Busy street near Via dei Tribunali with several pizza stalls; no single venue." },
};

export const DISH_MATCHES: Record<string, { item_name: string | null; match_confidence: number; reason: string }> = {
  "salmon soup|https://www.loylyhelsinki.fi/en/menu/a-la-carte": { item_name: "JASPER´S SALMON SOUP", match_confidence: 0.91, reason: "Same dish: Löyly's house salmon soup (rainbow trout)." },
  "rye bread|https://www.loylyhelsinki.fi/en/menu/a-la-carte": { item_name: null, match_confidence: 0.15, reason: "Bread is served on the side; no rye bread item on the menu." },
  "pizza marinara|https://pizzeriestarita.it/en/menu": { item_name: "Marinara Starita", match_confidence: 0.93, reason: "The marinara is Starita's signature; the house version is 'Marinara Starita'." },
};

/** Menu draft recorded for replay. memory_ids hold dish keys and are mapped at replay time. */
export const MENU_DRAFT = {
  courses: [
    {
      position: 1,
      course: "amuse",
      title: "Rye, roe & dill",
      description: "A thin crisp of dark rye, whipped smoked-trout crème fraîche, rainbow trout roe and dill flowers — two bites that nod to the rye bread stolen on the first date.",
      story_for_menu_card: "Half of his rye bread, finally returned.",
      memory_ids: ["rye bread"],
      structural: false,
      allergens: ["gluten", "fish", "milk"],
      dietary_variants: [{ for: "vegan", change: "Rye crisp with smoked beetroot tartare, oat crème fraîche and dill." }],
      seasonality_note: "June brings the first dill and new-season trout roe.",
      suggested_ingredients: ["dark rye flour", "rainbow trout roe", "crème fraîche", "fresh dill"],
    },
    {
      position: 2,
      course: "starter",
      title: "First-date salmon soup, clarified",
      description: "A clear salmon and trout broth poured at the table over cold-smoked trout, potato pearls, leek ash and dill oil; finished with a spoon of cream on the side, as at Löyly.",
      story_for_menu_card: "The soup she ordered at Löyly on our very first date.",
      memory_ids: ["salmon soup"],
      structural: false,
      allergens: ["fish", "milk", "celery"],
      dietary_variants: [{ for: "vegan", change: "Smoked carrot and kombu broth with charred leek, potato pearls and dill oil." }],
      seasonality_note: "New potatoes and early-summer leeks are at their sweetest.",
      suggested_ingredients: ["salmon frames", "cold-smoked rainbow trout", "new potatoes", "leeks", "dill"],
    },
    {
      position: 3,
      course: "main",
      title: "Three nights in Naples",
      description: "Chicken thigh braised in a Starita-style marinara of datterini tomatoes, garlic and oregano, with pecorino polenta, wood-roasted courgette and crisp fried-dough 'angioletti'.",
      story_for_menu_card: "Margherita, marinara and one last pizza on the street.",
      memory_ids: ["pizza marinara", "pizza margherita", "pizza a portafoglio"],
      structural: false,
      allergens: ["gluten", "milk"],
      dietary_variants: [{ for: "vegan", change: "Braised giant beans and roasted aubergine in the same marinara, with olive-oil polenta." }],
      seasonality_note: "Early datterini and courgettes arrive in June.",
      suggested_ingredients: ["datterini tomatoes", "chicken thighs", "pecorino romano", "polenta", "oregano"],
    },
    {
      position: 4,
      course: "pre-dessert",
      title: "Mökki blueberries",
      description: "Wild blueberry granita over vanilla buttermilk mousse with a pistachio and rye crumb.",
      story_for_menu_card: "Berries picked at the cottage that morning.",
      memory_ids: ["blueberry pie"],
      structural: false,
      allergens: ["milk", "gluten", "nuts"],
      dietary_variants: [{ for: "vegan", change: "Coconut-yoghurt mousse instead of buttermilk." }],
      seasonality_note: "Bilberries are still early in June; use last summer's frozen wild berries.",
      suggested_ingredients: ["wild blueberries", "buttermilk", "rye crumb"],
    },
    {
      position: 5,
      course: "dessert",
      title: "Proposal-night Eton mess, reimagined",
      description: "Scottish strawberries macerated in elderflower, crisp vanilla meringue shards, Chantilly cream and a strawberry-rhubarb sorbet, built at the table in a cut-glass coupe.",
      story_for_menu_card: "The pudding we shared at the Sheep Heid on the night she said yes.",
      memory_ids: ["eton mess"],
      structural: false,
      allergens: ["eggs", "milk"],
      dietary_variants: [{ for: "vegan", change: "Aquafaba meringue, whipped oat cream and the same strawberries and sorbet." }],
      seasonality_note: "Peak strawberry season in Scotland and Finland alike.",
      suggested_ingredients: ["strawberries", "egg whites", "double cream", "elderflower cordial", "rhubarb"],
    },
  ],
  unused_memories_worth_considering: ["mushroom risotto", "fish and chips", "canapes"],
};

/** Replacement pre-dessert, returned when code validation sends course 4 back (nut allergy). */
export const COURSE_FIXES: Record<string, unknown> = {
  "pre-dessert": {
    position: 4,
    course: "pre-dessert",
    title: "Mökki blueberries",
    description: "Wild blueberry granita over vanilla buttermilk mousse with a toasted rye and brown-butter crumb.",
    story_for_menu_card: "Berries picked at the cottage that morning.",
    memory_ids: ["blueberry pie"],
    structural: false,
    allergens: ["milk", "gluten"],
    dietary_variants: [
      { for: "vegan", change: "Coconut-yoghurt mousse and an olive-oil rye crumb." },
      { for: "nut allergy", change: "Nut-free as written (toasted rye crumb); plate on a nut-free station." },
    ],
    seasonality_note: "Bilberries are still early in June; use last summer's frozen wild berries.",
    suggested_ingredients: ["wild blueberries", "buttermilk", "rye flour", "butter"],
  },
  dessert: {
    position: 5,
    course: "dessert",
    title: "Strawberries & meringue, the night she said yes",
    description: "Elderflower-macerated Scottish strawberries, torched Swiss meringue, vanilla cream and a fine strawberry consommé poured at the table.",
    story_for_menu_card: "Our proposal pudding at the Sheep Heid, dressed for a wedding.",
    memory_ids: ["eton mess"],
    structural: false,
    allergens: ["eggs", "milk"],
    dietary_variants: [{ for: "vegan", change: "Aquafaba meringue and oat-vanilla cream." }],
    seasonality_note: "Peak strawberry season.",
    suggested_ingredients: ["strawberries", "egg whites", "cream", "elderflower"],
  },
  amuse: {
    position: 1,
    course: "amuse",
    title: "Karelian pie, wedding size",
    description: "A one-bite rye-crust Karelian pie with barley porridge, warm egg butter and a few grains of smoked salt.",
    story_for_menu_card: "Juhannus breakfast at the cottage, shrunk to one bite.",
    memory_ids: ["karelian pies"],
    structural: false,
    allergens: ["gluten", "milk", "eggs"],
    dietary_variants: [{ for: "vegan", change: "Oat-cream barley filling with a chive and olive-oil 'egg butter'." }],
    seasonality_note: "Year-round; new-season chives in June.",
    suggested_ingredients: ["rye flour", "pearl barley", "eggs", "butter"],
  },
  starter: {
    position: 2,
    course: "starter",
    title: "Löyly salmon soup, as a velouté",
    description: "A silky salmon and trout velouté with cold-smoked trout, dill oil and crisp rye croutons, poured at the table.",
    story_for_menu_card: "Our first-date soup, dressed up.",
    memory_ids: ["salmon soup", "rye bread"],
    structural: false,
    allergens: ["fish", "milk", "gluten", "celery"],
    dietary_variants: [{ for: "vegan", change: "Smoked carrot velouté with kombu, dill oil and rye croutons." }],
    seasonality_note: "June dill and new potatoes.",
    suggested_ingredients: ["salmon", "rainbow trout", "cream", "dill", "rye bread"],
  },
  main: {
    position: 3,
    course: "main",
    title: "Naples, slow-cooked",
    description: "Slow-roasted lamb shoulder with a marinara glaze, crushed new potatoes with oregano and a burrata-stuffed fried-dough angioletto.",
    story_for_menu_card: "Three nights of pizza in Naples, as a wedding main.",
    memory_ids: ["pizza marinara", "pizza margherita"],
    structural: false,
    allergens: ["gluten", "milk"],
    dietary_variants: [{ for: "vegan", change: "Marinara-glazed roast celeriac with crushed potatoes and an olive-oil angioletto." }],
    seasonality_note: "New potatoes and early tomatoes.",
    suggested_ingredients: ["lamb shoulder", "datterini tomatoes", "new potatoes", "burrata", "oregano"],
  },
  default: {
    position: 1,
    course: "amuse",
    title: "Korvapuusti in miniature",
    description: "A warm cardamom-and-cinnamon brioche bite with brown-butter glaze, served with a shot of cold-brew.",
    story_for_menu_card: "Sunday buns by the sea.",
    memory_ids: ["cinnamon bun"],
    structural: false,
    allergens: ["gluten", "milk", "eggs"],
    dietary_variants: [{ for: "vegan", change: "Oat-milk brioche dough and vegan butter glaze." }],
    seasonality_note: "Year-round.",
    suggested_ingredients: ["cardamom", "cinnamon", "brioche dough", "butter"],
  },
};
