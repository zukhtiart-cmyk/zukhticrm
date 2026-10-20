// Content for heightstones.com. Product lines, varieties, office details and
// figures come from the current site.

export type StoneKind =
  | "marble"
  | "granite"
  | "sandstone"
  | "limestone"
  | "slate"
  | "quartzite"
  | "travertine"
  | "onyx";

export type FinishKey =
  | "polished"
  | "honed"
  | "sandblasted"
  | "brushed"
  | "natural"
  | "sawn";

export type Finish = {
  key: FinishKey;
  name: string;
  note: string;
  gloss: number;
  grain: number;
  brush: number;
  cleft: number;
  saw: number;
};

export const FINISHES: Record<FinishKey, Finish> = {
  polished: { key: "polished", name: "Polished", note: "Mirror face. Deepens colour, throws light.", gloss: 1, grain: 0.04, brush: 0, cleft: 0, saw: 0 },
  honed: { key: "honed", name: "Honed", note: "Satin-matt. Calm, even, easy underfoot.", gloss: 0.38, grain: 0.12, brush: 0, cleft: 0, saw: 0 },
  sandblasted: { key: "sandblasted", name: "Sandblasted", note: "Fine tooth for grip. Softens colour.", gloss: 0.04, grain: 1, brush: 0, cleft: 0, saw: 0 },
  brushed: { key: "brushed", name: "Brushed", note: "Wire-brushed. Aged, tactile, warm.", gloss: 0.22, grain: 0.25, brush: 1, cleft: 0.15, saw: 0 },
  natural: { key: "natural", name: "Natural", note: "Hand-split cleft face, as the bed gave it.", gloss: 0, grain: 0.35, brush: 0, cleft: 1, saw: 0 },
  sawn: { key: "sawn", name: "Sawn", note: "Straight off the gang saw. Crisp and modern.", gloss: 0.08, grain: 0.18, brush: 0, cleft: 0, saw: 1 },
};

export type Stone = {
  slug: string;
  no: string;
  kind: StoneKind;
  name: string;
  plural: string;
  line: string;
  body: string;
  varieties: string[];
  finishes: FinishKey[];
  uses: string[];
  // Albedo palette fed to the shader: base, vein/secondary, accent.
  palette: [string, string, string];
  scale: number;
  // Relative bed thickness for the strata stack.
  bed: number;
};

export const STONES: Stone[] = [
  {
    slug: "indian-sandstone",
    no: "01",
    kind: "sandstone",
    name: "Sandstone",
    plural: "Indian Sandstone Tiles & Slabs",
    line: "Rajasthan's warm beds, laid down grain by grain.",
    body: "The stone that built the forts of Rajasthan. Dense, frost-proof Indian sandstone in riven and calibrated formats, for patios, facades and floors that weather beautifully.",
    varieties: ["Kandla Grey", "Raj Green", "Autumn Brown", "Dholpur Beige", "Jaisalmer Yellow", "Modak", "Rainbow"],
    finishes: ["natural", "sawn", "sandblasted", "brushed", "honed"],
    uses: ["Patios & paving", "Facade cladding", "Pool surrounds", "Steps & copings"],
    palette: ["#C99A63", "#9C6A3A", "#E3C79A"],
    scale: 2.2,
    bed: 1.25,
  },
  {
    slug: "indian-marble",
    no: "02",
    kind: "marble",
    name: "Marble",
    plural: "Indian Marble Tiles & Slabs",
    line: "Metamorphic calm, veined by heat and time.",
    body: "From quiet Pista White to the jungle veining of Rainforest Green and Gold. Book-matched slabs and calibrated tiles, cut to exact thickness for floors, walls and countertops.",
    varieties: ["Pista White", "Indian Pink", "Rainforest Green", "Rainforest Gold", "Rainforest Brown", "Toronto Brown"],
    finishes: ["polished", "honed", "brushed", "sawn"],
    uses: ["Floors & walls", "Bathrooms", "Countertops", "Inlay & overlay"],
    palette: ["#EFEBE4", "#6E6A66", "#B9965C"],
    scale: 1.6,
    bed: 1.5,
  },
  {
    slug: "indian-granite",
    no: "03",
    kind: "granite",
    name: "Granite",
    plural: "Indian Granite Tiles & Slabs",
    line: "Cooled magma. The hardest floor you'll ever own.",
    body: "Crystalline Indian granite, gang-saw cut and calibrated on CNC lines. Kitchens, lobbies and exterior paving that shrug off traffic, frost and decades.",
    varieties: ["Kashmir White", "Steel Grey", "Lakha Red", "Tropical Green", "Vizag Blue", "Rosewood", "Sapphire Brown"],
    finishes: ["polished", "honed", "sandblasted", "brushed", "sawn"],
    uses: ["Kitchen tops", "Commercial floors", "Exterior paving", "Kerbs & setts"],
    palette: ["#3A3633", "#B8AFA5", "#7A4B3A"],
    scale: 2.4,
    bed: 1.1,
  },
  {
    slug: "indian-limestone",
    no: "04",
    kind: "limestone",
    name: "Limestone",
    plural: "Indian Limestone Tiles & Slabs",
    line: "Ancient seabed, pressed into quiet blues and buffs.",
    body: "Kota brown, Tandur blue and Tandur yellow: even-toned, hard-wearing limestones with a soft, chalky calm. Calibrated tiles and paving for gardens, terraces and interiors.",
    varieties: ["Kota Brown", "Tandur Blue", "Tandur Yellow", "Lime Black", "Lime Green", "Lime Peacock", "Lime Pink"],
    finishes: ["natural", "honed", "brushed", "sandblasted", "polished"],
    uses: ["Garden paving", "Terraces", "Interior floors", "Stair treads"],
    palette: ["#8E9690", "#6C7671", "#B4AE98"],
    scale: 1.8,
    bed: 0.95,
  },
  {
    slug: "indian-slate",
    no: "05",
    kind: "slate",
    name: "Slate",
    plural: "Indian Slate Tiles & Slabs",
    line: "Split along its grain. Every piece a little landscape.",
    body: "Laminar Indian slate, hand-split to reveal rusts, silvers and charcoals. Natural cleft tiles, roofing and ledgestone panels with a raw, layered depth.",
    varieties: ["Jack Black", "Kund Multi", "Kund Peacock", "Raja Red", "Autumn Rustic", "Multi Color", "Vijay Gold"],
    finishes: ["natural", "honed", "brushed", "sandblasted"],
    uses: ["Feature walls", "Roofing", "Rustic floors", "Ledgestone"],
    palette: ["#3C3E3F", "#5D6061", "#9A6A3F"],
    scale: 2,
    bed: 0.8,
  },
  {
    slug: "indian-quartzite",
    no: "06",
    kind: "quartzite",
    name: "Quartzite",
    plural: "Indian Quartzite Tiles & Slabs",
    line: "Sandstone, pressed until it shimmers.",
    body: "Mica-flecked Himachal quartzites that catch the light at every angle. Extremely hard, slip-resistant and stunning as cladding, paving and pool decks.",
    varieties: ["Himachal White", "Silver Shine", "Copper", "Deoli Green", "Himachal Black", "Indian Golden", "Ocean Green"],
    finishes: ["natural", "honed", "polished", "sawn"],
    uses: ["Wall cladding", "Pool decks", "Paving", "Feature walls"],
    palette: ["#D9D4CB", "#A8A196", "#C9A86A"],
    scale: 2,
    bed: 1,
  },
  {
    slug: "travertine",
    no: "07",
    kind: "travertine",
    name: "Travertine",
    plural: "Travertine Tiles & Slabs",
    line: "Born in hot springs. Pitted, banded, timeless.",
    body: "Beige, silver, noce and walnut travertines, supplied filled or unfilled, in tumbled pavers and calibrated tiles. The Roman stone, for terraces that feel like holidays.",
    varieties: ["Beige", "Noce", "Silver", "Walnut", "Titanium", "River Wave", "Red"],
    finishes: ["honed", "brushed", "polished", "sandblasted"],
    uses: ["Terraces", "Pool coping", "Interior floors", "Facades"],
    palette: ["#DCCBB0", "#B79F7D", "#8C7356"],
    scale: 1.7,
    bed: 1.15,
  },
  {
    slug: "onyx",
    no: "08",
    kind: "onyx",
    name: "Onyx",
    plural: "Onyx Tiles & Slabs",
    line: "Translucent banding. Lit from within.",
    body: "From Mexican Amber to Jade Green and Italia Blue: onyx in book-matched slabs, cut thin for backlighting. Bar fronts, feature walls and statement pieces that glow.",
    varieties: ["Aquarius", "Cristallo Striato", "Mexican Amber", "Jade Green", "Italia Blue", "Tiger", "Crema Delicato"],
    finishes: ["polished", "honed"],
    uses: ["Backlit walls", "Bar fronts", "Vanities", "Feature pieces"],
    palette: ["#D3934A", "#8A4A1C", "#EFCF92"],
    scale: 1.5,
    bed: 0.9,
  },
];

export function stoneBySlug(slug: string) {
  return STONES.find((s) => s.slug === slug);
}

export type Collection = {
  slug: string;
  no: string;
  name: string;
  line: string;
  body: string;
  stone: string;
  finish: FinishKey;
  // Keys into PHOTOS (lib/photos.ts).
  photos: string[];
  items: { name: string; note: string }[];
};

export const COLLECTIONS: Collection[] = [
  {
    slug: "paving-landscaping",
    no: "I",
    name: "Paving & Landscaping",
    line: "Outdoors, made permanent.",
    body: "Sandstone and limestone paving, circle kits, setts and cobbles, steps, copings and kerbs, manufactured to your layout and customised per project.",
    stone: "indian-sandstone",
    finish: "natural",
    photos: ["paving"],
    items: [
      { name: "Sandstone Paving Patio", note: "Riven and sawn patio packs in single and mixed sizes." },
      { name: "Limestone Paving Patio", note: "Kota and Tandur calibrated paving for crisp terraces." },
      { name: "Paving Circles", note: "Radial kits from 1.8 m, with square-off options." },
      { name: "Cobblestones & Pave Setts", note: "Cropped, sawn or tumbled setts for drives and edges." },
      { name: "Wall & Pool Coping", note: "Bullnosed, rebated and drip-grooved profiles." },
      { name: "Garden Steps & Solid Steps", note: "Monolithic steps and treads with matching risers." },
      { name: "Walling Stones", note: "Pitched-face and split walling for dry-stone or mortared builds." },
      { name: "Kerbstone & Edging", note: "Straight, radius and drop kerbs in granite and sandstone." },
      { name: "Stepping Stones", note: "Random and sawn stepping pieces for lawns and gravel." },
    ],
  },
  {
    slug: "garden-ornaments",
    no: "II",
    name: "Garden Articles & Ornaments",
    line: "Sculpture you can sit on.",
    body: "Backless benches, fountains and water features, planters and pots, granite balls and marble pebbles, in standard sizes or carved to fit your space.",
    stone: "indian-granite",
    finish: "honed",
    photos: ["benches", "fountains", "planters"],
    items: [
      { name: "Backless Benches", note: "Solid-slab and carved-leg benches in sandstone and granite." },
      { name: "Fountains & Water Features", note: "Tiered fountains, wall spouts and bubbling spheres." },
      { name: "Planters & Pots", note: "Turned, carved and box planters in any size." },
      { name: "Granite Balls", note: "Polished and flamed spheres from 10 cm to 1 m." },
      { name: "Marble Pebbles", note: "Tumbled pebbles and chips for beds, paths and pools." },
    ],
  },
  {
    slug: "wall-panels-mosaics",
    no: "III",
    name: "Wall Panels & Mosaics",
    line: "Walls with a third dimension.",
    body: "Marble and sandstone wall panels, cladding tiles and mosaics, designed in-house and cut on automated machines, including fully custom patterns.",
    stone: "indian-marble",
    finish: "honed",
    photos: [],
    items: [
      { name: "3D Wall Panels", note: "CNC-carved waves, ribs and geometrics in marble and sandstone." },
      { name: "Wall Cladding Tiles", note: "Split-face, ledgestone and sawn cladding systems." },
      { name: "Mosaic Tiles", note: "Herringbone, basket-weave, hexagon and bespoke patterns." },
      { name: "Custom Designs", note: "Send a drawing; our design team turns it into stone." },
    ],
  },
  {
    slug: "interior-articles",
    no: "IV",
    name: "Interior Articles",
    line: "Stone, close enough to touch.",
    body: "Table tops, counter tops, designer pots, backsplashes, marble inlay and overlay, and fireplace surrounds, crafted for the rooms people live in.",
    stone: "onyx",
    finish: "polished",
    photos: [],
    items: [
      { name: "Table Tops", note: "Dining, coffee and side tables in marble, onyx and granite." },
      { name: "Counter Tops", note: "Templated, edged and cut-out to your kitchen plan." },
      { name: "Designer Pots", note: "Turned and carved vessels for interiors." },
      { name: "Backsplash Designs", note: "Slab and mosaic backsplashes with matched veining." },
      { name: "Marble Inlay & Overlay", note: "Pietra dura craft from Rajasthan's artisan workshops." },
      { name: "Fireplace Surrounds", note: "Classical and contemporary mantels, carved to measure." },
    ],
  },
];

export function collectionBySlug(slug: string) {
  return COLLECTIONS.find((c) => c.slug === slug);
}

// The current site cites a "7 step quality check policy" without listing it.
// These steps describe a typical quarry-to-crate line; confirm before launch.
export const CHECKS = [
  { name: "Bed selection", note: "Blocks chosen at the quarry face for colour, soundness and bed consistency." },
  { name: "Block inspection", note: "Every block checked for cracks, voids and colour drift before cutting." },
  { name: "Gang-saw cut", note: "Slabbed on high-production gang saws to your specified thickness." },
  { name: "Calibration", note: "CNC calibration to exact thickness, so tiles lay flat and level." },
  { name: "Surface finish", note: "Polished, honed, sandblasted, brushed or split, and checked against the approved sample." },
  { name: "Size & edge QC", note: "Dimensions, squareness and edges measured piece by piece." },
  { name: "Crate & dispatch", note: "Fumigated timber crates, strapped and labelled, then loaded for sea, air or door delivery." },
];

export const FACTS = [
  { value: "18", unit: "yrs", label: "exporting natural stone" },
  { value: "5", unit: "units", label: "manufacturing facilities" },
  { value: "85,000", unit: "m²", label: "of production floor" },
  { value: "7", unit: "checks", label: "before anything ships" },
];

export const SERVICES = [
  {
    slug: "in-house-architectural-wing",
    name: "In-house Architectural Wing",
    body: "Architects and designers who draw with stone in mind: layouts, cutting plans and patterns that make the most of every slab.",
  },
  {
    slug: "artisans-and-craftsman-leadership",
    name: "Artisans & Craftsman Leadership",
    body: "Master carvers from Rajasthan's stone tradition lead inlay, carving and hand-finishing, working beside our CNC lines.",
  },
  {
    slug: "project-design-and-implementation",
    name: "Project Design & Implementation",
    body: "From the first sample to the last crate on site: specification, production scheduling and delivery for complete projects.",
  },
];

export const OFFICES = [
  {
    city: "Jaipur",
    country: "India",
    role: "Head office & factories",
    tz: "Asia/Kolkata",
    coords: "26.91° N · 75.79° E",
    address: ["104, Gokulam, CP 45–46, Road No. 1-D", "VKI Area, near HDFC Bank", "Jaipur, India"],
    phone: "+91 88883 44442",
    tel: "+918888344442",
    email: "ramakant@heightstones.com",
  },
  {
    city: "Dubai",
    country: "UAE",
    role: "Middle East desk",
    tz: "Asia/Dubai",
    coords: "25.18° N · 55.27° E",
    address: ["2006-75, 20th Floor, Binary Tower", "Business Bay", "Dubai, UAE"],
    phone: "+971 56 901 3069",
    tel: "+971569013069",
    email: "uae@heightstones.com",
  },
  {
    city: "Brisbane",
    country: "Australia",
    role: "Australia & NZ desk",
    tz: "Australia/Brisbane",
    coords: "27.47° S · 153.03° E",
    address: ["24 Vaucluse Place, Parkinson", "QLD, Brisbane", "Australia"],
    phone: "+61 435 122 325",
    tel: "+61435122325",
    email: "aus@heightstones.com",
  },
];

export const MARKETS = ["USA", "Canada", "Africa", "Europe", "China", "Italy", "New Zealand", "Australia", "Turkey"];

export const PRODUCT_TYPES = ["Natural Stones", "Paving Stones", "Garden Accessories", "Wall Panels"];
export const SHIPMENTS = ["Sea Shipment", "Air Shipment", "Door Delivery"];

export const ENQUIRY_EMAIL = "ramakant@heightstones.com";
