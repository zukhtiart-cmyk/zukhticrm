/**
 * The standard BOQ items (written the way Zukhti quotes them) and how their quantities are worked out
 * from a floor plan. The rate library in the database is seeded from STANDARD_ITEMS; building a BOQ from
 * a plan uses whatever is in the rate library, so edited prices and texts carry through.
 * Shared by the server and the browser.
 */
import type { HomeScene, PlanKind, RoomType, SceneRoom } from "./home-scene";
import { feetInches } from "./quote-setup";

export const ROOM_GROUPS = ["entrance", "living", "kitchen", "bedroom", "bath", "balcony", "passage", "study", "puja", "utility"] as const;
export type RoomGroup = (typeof ROOM_GROUPS)[number];
export const ROOM_GROUP_LABELS: Record<RoomGroup, string> = {
  entrance: "Entrance",
  living: "Living / dining",
  kitchen: "Kitchen",
  bedroom: "Bedrooms",
  bath: "Bathrooms",
  balcony: "Balcony",
  passage: "Passage",
  study: "Study",
  puja: "Puja",
  utility: "Utility / dry area",
};

export function groupOf(t: RoomType): RoomGroup | null {
  switch (t) {
    case "living":
    case "dining":
    case "living_dining":
      return "living";
    case "kitchen":
      return "kitchen";
    case "master_bedroom":
    case "bedroom":
    case "kids_bedroom":
    case "guest_bedroom":
      return "bedroom";
    case "bathroom":
    case "powder":
      return "bath";
    case "foyer":
      return "entrance";
    case "balcony":
    case "passage":
    case "study":
    case "puja":
    case "utility":
      return t;
    default:
      return null;
  }
}

/**
 * Quantity rules:
 * - area: floor area (sq ft) · ceiling: same · paint: walls (perimeter × 9.5 ft) + ceiling (sq ft)
 * - skirting: perimeter (rft) · lumpsum: 1 (L.S.) · one: 1 (nos)
 * - furn:<kind>[:sqft|:rft|:wall] — one line per piece of that kind drawn on the plan, sized from it:
 *   nos (default), sqft = width × 9 ft high, wall = width × 7 ft high, rft = width in feet.
 *   If none is drawn, one line with a typical size is offered, unticked.
 */
export type QtyRule = string;

export type LibraryItem = {
  category: string;
  title: string;
  spec: string;
  unit: string;
  price: number;
  rooms: RoomGroup[];
  rule: QtyRule;
  preselect: boolean;
};

const L = (category: string, title: string, spec: string, unit: string, price: number, rooms: RoomGroup[], rule: QtyRule, preselect = false): LibraryItem => ({ category, title, spec, unit, price, rooms, rule, preselect });

/** Starting prices are indicative Mumbai rates (INR) — review them on the Rates page. */
export const STANDARD_ITEMS: LibraryItem[] = [
  // Entrance
  L("Doors", "SAFETY DOOR", "Main entrance safety door with SS grill and Europa lock.", "nos", 28000, ["entrance"], "one", true),
  L("Carpentry", "ENTRANCE PANELLING", "Designer panel in MR ply with laminate, with name plate and light points.", "L.S.", 35000, ["entrance"], "lumpsum", true),
  L("Carpentry", "SHOE RACK / STORAGE", "Shoe rack with shutters and drawers in MR ply, laminate inside and outside, with low seating rack.", "nos", 28000, ["entrance"], "furn:shoe_cabinet"),

  // Living / dining
  L("Carpentry", "ACCENT WALL", "Decorative accent (moon) wall in MR ply panel with highlighter laminate / veneer.", "sq ft", 1100, ["living"], "furn:none:wall"),
  L("Carpentry", "TV UNIT", "Compact storage unit with duco finish, laminate panelling behind TV, provision for electrical and set-top-box connections, spot and strip lights, artefact storage.", "nos", 55000, ["living", "bedroom"], "furn:tv_unit"),
  L("Glass", "GLASS PARTITION", "10 mm toughened glass partition with frame.", "sq ft", 650, ["living", "bedroom", "kitchen"], "furn:none:wall"),
  L("Civil", "CIVIL WORK – WALL BREAKING", "Breaking of existing wall as per design, with debris removal.", "L.S.", 15000, ["living", "kitchen", "bedroom"], "lumpsum"),
  L("Civil", "FLOORING – BREAKING EXISTING", "Breaking of existing flooring and skirting, with debris removal.", "sq ft", 30, ["living", "kitchen", "bedroom", "passage", "entrance"], "area"),
  L("Civil", "FLOORING & SKIRTING – ITALIAN MARBLE", "Italian marble cutting and fitting labour with backing material and polishing, with skirting.", "sq ft", 180, ["living", "passage", "entrance"], "area"),
  L("Civil", "FLOORING – NEW TILES", "New vitrified tile flooring with matching skirting, including laying material.", "sq ft", 150, ["kitchen", "bedroom", "utility", "passage"], "area"),
  L("Civil", "BALCONY FLOOR RAISING & TILING", "Raising balcony floor level to match the house, waterproofing and new tiles.", "sq ft", 260, ["balcony"], "area", true),
  L("Civil", "POWDER ROOM", "New siporex wall with plaster, waterproofing up to 3 ft, wall and floor tiles, sanitary ware fitting.", "L.S.", 95000, ["bath"], "lumpsum"),
  L("Doors", "POWDER ROOM DOOR", "Door with frame, laminate inside and duco outside, with hardware.", "nos", 18000, ["bath"], "one"),
  L("Carpentry", "WALL PANELLING (COFFEE TABLE AREA)", "Wall panelling in MR ply and laminate, with jhula hook provision.", "L.S.", 30000, ["living"], "lumpsum"),
  L("Ceiling", "FALSE CEILING – DESIGNER", "Designer false ceiling with GI channels and gypsum board, with cove for lights.", "sq ft", 140, ["living", "bedroom"], "ceiling", true),
  L("Ceiling", "FALSE CEILING – SIMPLE", "Simple false ceiling with GI channels and gypsum board.", "sq ft", 95, ["kitchen", "passage", "entrance", "bath"], "ceiling", true),
  L("Painting", "PAINTING", "Removing old paint; 2 coats primer, 3 coats putty, 3 coats Asian Paints Royale (Royale Touch).", "sq ft", 32, ["living", "kitchen", "bedroom", "passage", "entrance", "study", "puja"], "paint", true),
  L("Civil", "STAIRCASE", "Dismantling existing staircase and new structure as per design.", "L.S.", 150000, ["living"], "lumpsum"),
  L("Electrical", "ELECTRICAL WORK", "New ISI Polycab wiring (old wires not reused), panel lights, LED strip lights, under-cabinet task lights, fan points.", "sq ft", 150, ["living", "kitchen", "bedroom", "passage", "entrance", "study", "bath", "balcony", "puja", "utility"], "area", true),
  L("Carpentry", "CROCKERY UNIT", "Crockery unit in marine ply with open and closed storage, glass shutters and light effects.", "sq ft", 1600, ["living", "kitchen"], "furn:sideboard:sqft"),

  // Kitchen
  L("Civil", "KITCHEN – BREAKING PLATFORM & BACKSPLASH", "Breaking existing kitchen platform and backsplash tiles, with debris removal.", "L.S.", 8000, ["kitchen"], "lumpsum"),
  L("Civil", "QUARTZ PLATFORM", "Quartz kitchen platform with 2 ft backsplash tiles.", "rft", 1800, ["kitchen"], "furn:counter:rft", true),
  L("Plumbing", "SINK WITH TAP", "Stainless steel sink with tap, fitted.", "nos", 12000, ["kitchen"], "one", true),
  L("Civil", "SIPOREX WALL", "Siporex block wall with plaster and POP, with door packing.", "sq ft", 220, ["kitchen", "bath", "bedroom"], "furn:none:wall"),
  L("Carpentry", "KITCHEN FURNITURE", "Base cabinets and overhead loft with soft-close hardware, marine ply, laminate inside, acrylic outside, profile glass shutters, slim / tandem boxes.", "rft", 4500, ["kitchen"], "furn:counter:rft", true),
  L("Carpentry", "TALL UNIT", "Tall unit for microwave / OTG / mixer in marine ply with acrylic finish.", "sq ft", 1800, ["kitchen"], "furn:fridge:sqft"),
  L("Glass", "GLASS SLIDING PARTITION DOOR", "Glass sliding partition door with aluminium profile.", "nos", 45000, ["kitchen"], "one"),

  // Bedrooms
  L("Carpentry", "WARDROBE", "Wardrobe in MR ply with 4 small drawers and locker, laminate inside and outside.", "sq ft", 1350, ["bedroom"], "furn:wardrobe:sqft", true),
  L("Carpentry", "BED", "Bed in MR ply with hydraulic lift storage, laminate finish, cushioned headboard (foam and fabric).", "nos", 48000, ["bedroom"], "furn:bed", true),
  L("Carpentry", "SIDE TABLE", "Side table with 2 drawers and electrical switch provision.", "nos", 9500, ["bedroom"], "furn:side_table", true),
  L("Carpentry", "DRESSING PANEL", "Dressing panel with full mirror and thin storage.", "nos", 18000, ["bedroom"], "furn:dresser"),
  L("Carpentry", "STUDY TABLE", "Study table in MR ply and laminate with 2 ft magnetic board and electrical provision.", "nos", 22000, ["bedroom", "study"], "furn:desk"),
  L("Carpentry", "FOLDING STUDY TABLE", "Wall-mounted folding study table in MR ply and laminate.", "nos", 15000, ["bedroom", "study"], "one"),
  L("Doors", "BEDROOM DOOR", "Bedroom door with laminate inside, veneer and lamination outside, with hardware.", "nos", 22000, ["bedroom"], "one", true),
  L("Carpentry", "PASSAGE STORAGE", "Passage storage in MR ply with laminate inside and outside.", "sq ft", 1350, ["passage"], "furn:bookshelf:sqft"),

  // Bathrooms
  L("Civil", "BATHROOM WORK", "Breaking old tiles, new wall and floor tiles, waterproofing of floor and walls up to 3 ft, CPVC / PVC plumbing with inlet and outlet, sanitary ware fitting.", "L.S.", 140000, ["bath"], "lumpsum", true),
  L("Doors", "BATHROOM DOOR", "Bathroom door laminates on both sides, with hardware.", "nos", 9000, ["bath"], "one", true),
  L("Carpentry", "WC LEDGE STORAGE", "Ledge storage above WC in marine ply.", "nos", 9000, ["bath"], "furn:wc"),
  L("Glass", "BATHROOM GLASS PARTITION", "10 mm toughened glass partition with door, 7 ft height.", "nos", 28000, ["bath"], "furn:shower"),
  L("Carpentry", "BATHROOM STORAGE", "Vanity storage, niche, mirror cabinet in marine ply.", "nos", 18000, ["bath"], "furn:vanity"),

  // Others
  L("Carpentry", "PUJA UNIT", "Puja unit in MR ply with laminate / veneer, back-lit panel and storage.", "nos", 35000, ["puja", "living"], "furn:puja"),
  L("Doors", "DOOR LAMINATES", "Laminates on both sides for existing doors (excluding handles and locks).", "nos", 9000, ["passage", "utility", "study"], "one"),
];

export const sqft = (m2: number) => m2 * 10.7639;
export const ft = (m: number) => m * 3.28084;
const r1 = (n: number) => Math.round(n * 10) / 10;
const sizeOf = (w: number, d: number) => `${feetInches(w)} x ${feetInches(d)}`;

export function roomSize(r: Pick<SceneRoom, "w" | "d">) {
  return sizeOf(r.w, r.d);
}

export type Candidate = { qty: number; size: string; ticked: boolean };

type ItemLike = { unit: string; qtyRule: string | null; preselect: boolean };

/** Works out the lines a library item would add to one room. */
export function candidatesFor(item: ItemLike, room: SceneRoom, pieces: { kind: PlanKind; w: number; d: number }[]): Candidate[] {
  const rule = item.qtyRule ?? "one";
  const area = sqft(room.w * room.d);
  const perim = ft(2 * (room.w + room.d));
  if (rule === "area" || rule === "ceiling") return [{ qty: r1(area), size: "", ticked: item.preselect }];
  if (rule === "paint") return [{ qty: Math.round(perim * 9.5 + area), size: "", ticked: item.preselect }];
  if (rule === "skirting") return [{ qty: r1(perim), size: "", ticked: item.preselect }];
  if (rule === "lumpsum" || rule === "one") return [{ qty: 1, size: "", ticked: item.preselect }];
  if (rule.startsWith("furn:")) {
    const [, kind, how = "nos"] = rule.split(":");
    const found = kind === "none" ? [] : pieces.filter((p) => p.kind === kind);
    const sized = (w: number, d: number): Candidate => {
      if (how === "sqft") return { qty: r1(ft(w) * 9), size: `${feetInches(w)} x 9'`, ticked: true };
      if (how === "wall") return { qty: r1(ft(w) * 7), size: `${feetInches(w)} x 7'`, ticked: true };
      if (how === "rft") return { qty: r1(ft(w)), size: `${r1(ft(w))} rft`, ticked: true };
      return { qty: 1, size: sizeOf(w, d), ticked: true };
    };
    // Pieces we make (carpentry) are ticked when drawn; fixtures (WC, shower, fridge…) only suggest an item.
    const made = MADE.has(kind) || item.preselect;
    if (found.length) {
      if (how === "rft") {
        // One line for the whole run (e.g. an L-shaped counter).
        const total = found.reduce((a, p) => a + p.w, 0);
        return [{ ...sized(total, 0), ticked: made }];
      }
      return found.map((p) => ({ ...sized(p.w, p.d), ticked: made }));
    }
    // Nothing drawn: offer one typical piece, unticked (ticked if the item is a standard pick and needs no drawing).
    const typical: Record<string, [number, number]> = { wardrobe: [2.1, 0.6], bed: [1.8, 2.0], counter: [3.0, 0.6], tv_unit: [1.8, 0.4], sideboard: [0.8, 0.45], fridge: [0.9, 0.6], bookshelf: [1.5, 0.35], none: [1.7, 0] };
    const [w, d] = typical[kind] ?? [0.9, 0.45];
    const c = sized(w, d);
    return [{ ...c, ticked: false }];
  }
  return [{ qty: 1, size: "", ticked: false }];
}

const MADE = new Set(["wardrobe", "bed", "side_table", "dresser", "desk", "tv_unit", "counter", "shoe_cabinet", "sideboard", "puja", "bookshelf", "console"]);
const MEASURED = new Set(["area", "ceiling", "paint", "skirting"]);

export type PlanSection = {
  room: string;
  size: string;
  group: RoomGroup;
  lines: { rateItemId: string; title: string; spec: string; unit: string; price: number; qty: number; size: string; ticked: boolean }[];
};

type RateLike = ItemLike & { id: string; title: string | null; name: string; spec: string | null; price: number; roomTypes: string[] | null; sortOrder: number };

const centreIn = (r: SceneRoom, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.d;

/** The BOQ a floor plan suggests: one section per room (plus Entrance), each with library items and quantities. */
export function sectionsFromPlan(scene: HomeScene, items: RateLike[]): PlanSection[] {
  const usable = items.filter((i) => i.roomTypes?.length);
  const linesFor = (group: RoomGroup, room: SceneRoom | null, pieces: { kind: PlanKind; w: number; d: number }[]) =>
    usable
      .filter((i) => i.roomTypes!.includes(group) && (room || !MEASURED.has(i.qtyRule ?? "")))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .flatMap((i) => {
        // No foyer drawn: the Entrance section only gets items that don't measure a room.
        const fake: SceneRoom = room ?? { id: "entrance", name: "Entrance", type: "foyer", x: 0, y: 0, w: 1.5, d: 1.5 };
        return candidatesFor(i, fake, pieces).map((c) => ({ rateItemId: i.id, title: i.title || i.name, spec: i.spec ?? "", unit: i.unit, price: i.price, ...c }));
      });

  const rooms = [...scene.rooms].filter((r) => groupOf(r.type)).sort((a, b) => order(a.type) - order(b.type) || a.y - b.y || a.x - b.x);
  const out: PlanSection[] = [];
  if (!rooms.some((r) => r.type === "foyer")) out.push({ room: "Entrance", size: "", group: "entrance", lines: linesFor("entrance", null, []) });
  const names = new Map<string, number>();
  for (const r of rooms) {
    const group = groupOf(r.type)!;
    const pieces = (scene.furniture ?? []).filter((f) => centreIn(r, f.x, f.y));
    let name = r.name.trim() || r.type;
    const n = (names.get(name) ?? 0) + 1;
    names.set(name, n);
    if (n > 1) name = `${name} ${n}`;
    out.push({ room: name, size: roomSize(r), group, lines: linesFor(group, r, pieces) });
  }
  return out.filter((s) => s.lines.length);
}

const ORDER: RoomType[] = ["foyer", "living_dining", "living", "dining", "kitchen", "utility", "master_bedroom", "bedroom", "kids_bedroom", "guest_bedroom", "study", "puja", "passage", "bathroom", "powder", "balcony"];
const order = (t: RoomType) => {
  const i = ORDER.indexOf(t);
  return i < 0 ? 99 : i;
};
