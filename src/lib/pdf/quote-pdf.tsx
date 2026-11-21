import "server-only";
import path from "node:path";
import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { QuoteLine, QuoteMeta } from "@/db/schema";
import {
  amountInWords,
  normaliseNotes,
  sectionLetter,
  type PriceMode,
  type TaxMode,
} from "@/lib/quote-setup";
import type { CompanyProfile } from "@/lib/settings";
import { readStoredFile } from "@/lib/storage";

const FONTS = path.join(process.cwd(), "assets", "fonts");
let registered = false;
function registerFonts() {
  if (registered) return;
  registered = true;
  Font.register({
    family: "Cormorant",
    fonts: [
      {
        src: path.join(FONTS, "cormorant-garamond-latin-500-normal.woff"),
        fontWeight: 500,
      },
      {
        src: path.join(FONTS, "cormorant-garamond-latin-600-normal.woff"),
        fontWeight: 600,
      },
      {
        src: path.join(FONTS, "cormorant-garamond-latin-500-italic.woff"),
        fontWeight: 500,
        fontStyle: "italic",
      },
    ],
  });
  Font.register({
    family: "Manrope",
    fonts: [
      {
        src: path.join(FONTS, "manrope-latin-400-normal.woff"),
        fontWeight: 400,
      },
      {
        src: path.join(FONTS, "manrope-latin-600-normal.woff"),
        fontWeight: 600,
      },
      {
        src: path.join(FONTS, "manrope-latin-700-normal.woff"),
        fontWeight: 700,
      },
    ],
  });
  // Don't break words with hyphens.
  Font.registerHyphenationCallback((w) => [w]);
}

const C = {
  ink: "#1f1c18",
  brass: "#9a7140",
  brassLight: "#d9bb8c",
  soft: "#f6efe3",
  paper: "#fffdf9",
  line: "#e6dccb",
  muted: "#7b7166",
};

const s = StyleSheet.create({
  page: {
    fontFamily: "Manrope",
    fontSize: 8.6,
    color: C.ink,
    paddingTop: 34,
    paddingBottom: 58,
    paddingHorizontal: 38,
    backgroundColor: "#ffffff",
  },
  body: {},
  para: { flex: 1, lineHeight: "12.4pt" },
  band: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: C.brass,
  },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  brandRow: { flexDirection: "row", alignItems: "center" },
  mono: {
    width: 34,
    height: 34,
    borderRadius: 7,
    backgroundColor: C.ink,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 9,
  },
  monoText: {
    fontFamily: "Cormorant",
    fontWeight: 600,
    fontSize: 24,
    color: C.brassLight,
    marginTop: -3,
  },
  word: {
    fontFamily: "Cormorant",
    fontWeight: 600,
    fontSize: 20,
    letterSpacing: 2.2,
  },
  tag: {
    fontSize: 7,
    letterSpacing: 1.6,
    color: C.muted,
    textTransform: "uppercase",
  },
  docTitle: {
    fontFamily: "Cormorant",
    fontWeight: 600,
    fontSize: 24,
    letterSpacing: 4,
    textAlign: "right",
  },
  docMeta: { fontSize: 7.6, color: C.muted, textAlign: "right" },
  rule: { height: 1.2, backgroundColor: C.ink, marginBottom: 1.5 },
  rule2: { height: 0.5, backgroundColor: C.brass, marginBottom: 12 },
  info: { flexDirection: "row", marginBottom: 14 },
  infoCol: { flex: 1, paddingRight: 10 },
  label: {
    fontSize: 6.4,
    letterSpacing: 1.4,
    color: C.brass,
    fontWeight: 700,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  strong: { fontWeight: 700, lineHeight: "12.4pt" },
  muted: { color: C.muted, lineHeight: "12.4pt" },
  title: {
    fontFamily: "Cormorant",
    fontWeight: 600,
    fontSize: 17,
    textAlign: "center",
    marginBottom: 2,
  },
  titleUnder: {
    fontSize: 7,
    letterSpacing: 1.4,
    color: C.muted,
    textAlign: "center",
    marginBottom: 14,
    textTransform: "uppercase",
  },
  secHead: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.soft,
    borderRadius: 4,
    paddingVertical: 5,
    paddingHorizontal: 6,
    marginTop: 8,
  },
  letter: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: C.ink,
    color: C.brassLight,
    fontSize: 8,
    fontWeight: 700,
    textAlign: "center",
    paddingTop: 2.2,
    marginRight: 7,
  },
  secName: {
    fontWeight: 700,
    fontSize: 8.6,
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  secSize: { color: C.muted, fontSize: 8, marginLeft: 5 },
  secTotal: { marginLeft: "auto", fontWeight: 700, fontSize: 9 },
  thead: {
    flexDirection: "row",
    borderBottomWidth: 0.6,
    borderBottomColor: C.ink,
    paddingVertical: 3.5,
    paddingHorizontal: 6,
    marginTop: 2,
  },
  th: {
    fontSize: 6.4,
    letterSpacing: 1,
    fontWeight: 700,
    color: C.muted,
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: C.line,
    paddingVertical: 4.5,
    paddingHorizontal: 6,
  },
  sr: { width: 22, color: C.muted },
  desc: { flex: 1, paddingRight: 8, lineHeight: "12.4pt" },
  num: { width: 52, textAlign: "right" },
  amt: { width: 74, textAlign: "right", fontWeight: 600 },
  itemTitle: { fontWeight: 700, letterSpacing: 0.3 },
  totalBox: {
    backgroundColor: C.ink,
    borderRadius: 6,
    padding: 14,
    marginTop: 14,
    color: "#ffffff",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: { fontSize: 9, color: "#e9e2d6", flex: 1, paddingRight: 12 },
  totalAmt: {
    fontFamily: "Cormorant",
    fontWeight: 600,
    fontSize: 22,
    color: C.brassLight,
  },
  totalSmall: {
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8.4,
    color: "#d8d0c3",
    marginTop: 4,
  },
  wordsBox: {
    marginTop: 8,
    paddingTop: 7,
    borderTopWidth: 0.5,
    borderTopColor: "#4a443c",
  },
  words: {
    fontFamily: "Cormorant",
    fontStyle: "italic",
    fontWeight: 500,
    fontSize: 12,
    lineHeight: "16pt",
    color: "#f3ecdf",
  },
  h3: {
    fontWeight: 700,
    fontSize: 8,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 5,
    color: C.ink,
  },
  block: { marginTop: 16 },
  rateRow: {
    flexDirection: "row",
    paddingVertical: 3.5,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: C.line,
  },
  rateKey: { width: 150, fontWeight: 600 },
  callout: {
    marginTop: 10,
    borderLeftWidth: 2.5,
    borderLeftColor: C.brass,
    backgroundColor: C.soft,
    paddingVertical: 6,
    paddingHorizontal: 9,
  },
  li: { flexDirection: "row", marginBottom: 2.5 },
  liMark: { width: 16, color: C.brass, fontWeight: 700 },
  sign: { flexDirection: "row", marginTop: 34 },
  signCol: { flex: 1, marginRight: 30 },
  signLine: {
    borderTopWidth: 0.7,
    borderTopColor: C.ink,
    paddingTop: 4,
    marginTop: 30,
  },
  thanks: {
    fontFamily: "Cormorant",
    fontStyle: "italic",
    fontWeight: 500,
    fontSize: 16,
    textAlign: "center",
    marginTop: 22,
    color: C.brass,
  },
  footLine: {
    position: "absolute",
    left: 38,
    right: 38,
    bottom: 38,
    height: 0.5,
    backgroundColor: C.line,
  },
  footLeft: {
    position: "absolute",
    left: 38,
    bottom: 24,
    fontSize: 6.8,
    color: C.muted,
  },
  // Footer text sits outside the body view: a line height inherited from the page stops react-pdf drawing page numbers.
  footRight: {
    textAlign: "right",
    position: "absolute",
    left: 300,
    right: 38,
    bottom: 24,
    fontSize: 6.8,
    color: C.muted,
  },
});

export type PdfQuote = {
  version: number;
  createdAt: Date;
  currency: string;
  taxLabel: string;
  taxRate: number;
  subtotal: number;
  tax: number;
  total: number;
  lines: QuoteLine[];
  mode?: string | null;
  meta?: QuoteMeta | null;
};
export type PdfProject = {
  code: string;
  name: string;
  siteAddress: string | null;
  client: { name: string; phone: string; email: string | null };
  office: {
    name: string;
    city: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    taxId?: string | null;
    taxLabel: string;
  };
};

/** Cormorant's metrics make react-pdf under-measure its line height, so serif lines sit in a fixed-height box. */
function Serif({
  h,
  style,
  children,
}: {
  h: number;
  style: object | object[];
  children: React.ReactNode;
}) {
  return (
    <View style={{ height: h, justifyContent: "center" }}>
      <Text
        style={[...(Array.isArray(style) ? style : [style]), { lineHeight: 1 }]}
      >
        {children}
      </Text>
    </View>
  );
}

function fmtMoney(n: number, cur: string) {
  if (cur === "INR")
    return `Rs. ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n))}/-`;
  return `${cur} ${new Intl.NumberFormat("en-AE", { maximumFractionDigits: 0 }).format(Math.round(n))}`;
}

function QuotePdf({
  project,
  quote,
  schedule,
  company,
  logo,
}: {
  project: PdfProject;
  quote: PdfQuote;
  schedule: { label: string; percent: number }[];
  company: CompanyProfile;
  logo: { data: Buffer; format: "png" | "jpg" } | null;
}) {
  const meta = quote.meta ?? null;
  const mode = (quote.mode ?? "itemised") as PriceMode;
  const taxMode = (meta?.taxMode ?? "add") as TaxMode;
  const cur = quote.currency;
  const m = (n: number) => fmtMoney(n, cur);
  const rooms = [...new Set(quote.lines.map((l) => l.room))];
  const letters = rooms.map((_, i) => sectionLetter(i));
  const lettersText =
    letters.length > 3
      ? `${letters.slice(0, 3).join("+")}+Etc`
      : letters.join("+");
  const notes = meta?.notes ? normaliseNotes(meta.notes) : null;
  const amount =
    meta?.amount ?? (taxMode === "included" ? quote.total : quote.subtotal);
  const itemised = mode === "itemised";
  const anyShown = !itemised && quote.lines.some((l) => l.showPrice);
  const quoteNo = `${project.code}/Q${quote.version}`;
  const date = new Date(quote.createdAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const office = project.office;
  const footerBits = [
    company.name,
    company.website,
    company.email || office.email,
    office.phone,
  ]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <Document
      title={`${company.name} — Quotation ${quoteNo}`}
      author={company.name}
      subject={meta?.title || project.name}
    >
      <Page size="A4" style={s.page}>
        <View style={s.band} fixed />
        <View style={s.body}>
          <View style={s.head}>
            {logo ? (
              <View>
                {/* eslint-disable-next-line jsx-a11y/alt-text */}
                <Image
                  src={logo}
                  style={{ maxHeight: 46, maxWidth: 190, objectFit: "contain" }}
                />
                {company.tagline ? (
                  <Text style={[s.tag, { marginTop: 4 }]}>
                    {company.tagline}
                  </Text>
                ) : null}
              </View>
            ) : (
              <View style={s.brandRow}>
                <View style={s.mono}>
                  <Text style={[s.monoText, { lineHeight: 1 }]}>
                    {company.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View>
                  <Serif h={22} style={s.word}>
                    {company.name.toUpperCase()}
                  </Serif>
                  {company.tagline ? (
                    <Text style={s.tag}>{company.tagline}</Text>
                  ) : null}
                </View>
              </View>
            )}
            <View>
              <Serif h={28} style={s.docTitle}>
                QUOTATION
              </Serif>
              <Text style={s.docMeta}>No. {quoteNo}</Text>
              <Text style={s.docMeta}>{date}</Text>
            </View>
          </View>
          <View style={s.rule} />
          <View style={s.rule2} />

          <View style={s.info}>
            <View style={s.infoCol}>
              <Text style={s.label}>Prepared for</Text>
              <Text style={s.strong}>{project.client.name}</Text>
              {project.client.phone ? (
                <Text style={s.muted}>{project.client.phone}</Text>
              ) : null}
              {project.client.email ? (
                <Text style={s.muted}>{project.client.email}</Text>
              ) : null}
            </View>
            <View style={s.infoCol}>
              <Text style={s.label}>Site</Text>
              <Text style={s.strong}>{project.name}</Text>
              {project.siteAddress ? (
                <Text style={s.muted}>{project.siteAddress}</Text>
              ) : null}
            </View>
            <View style={[s.infoCol, { paddingRight: 0 }]}>
              <Text style={s.label}>From</Text>
              <Text style={s.strong}>
                {company.name} · {office.name}
              </Text>
              {office.address ? (
                <Text style={s.muted}>{office.address}</Text>
              ) : null}
              {office.phone ? (
                <Text style={s.muted}>{office.phone}</Text>
              ) : null}
              {office.taxId ? (
                <Text style={s.muted}>
                  {office.taxLabel === "GST"
                    ? "GSTIN"
                    : `${office.taxLabel} no.`}{" "}
                  {office.taxId}
                </Text>
              ) : null}
            </View>
          </View>

          {meta?.title ? (
            <Serif h={24} style={s.title}>
              {meta.title}
            </Serif>
          ) : null}
          <Text style={s.titleUnder}>
            Description of items &amp; work offered
          </Text>

          {rooms.map((room, ri) => {
            const lines = quote.lines.filter((l) => l.room === room);
            const size = meta?.roomSizes?.[room];
            const roomTotal =
              meta?.roomTotals?.[room] ??
              lines.reduce((a, l) => a + l.amount, 0);
            return (
              <View key={room}>
                <View wrap={false} minPresenceAhead={40}>
                  <View style={s.secHead}>
                    <Text style={s.letter}>{letters[ri]}</Text>
                    <Text style={s.secName}>{room}</Text>
                    {size ? <Text style={s.secSize}>({size})</Text> : null}
                    {mode === "rooms" ? (
                      <Text style={s.secTotal}>{m(roomTotal)}</Text>
                    ) : null}
                  </View>
                  <View style={s.thead}>
                    <Text style={[s.th, s.sr]}>Sr.</Text>
                    <Text style={[s.th, s.desc]}>Description</Text>
                    {itemised ? (
                      <>
                        <Text style={[s.th, s.num]}>Qty</Text>
                        <Text style={[s.th, s.num]}>Rate</Text>
                        <Text style={[s.th, s.amt]}>Amount</Text>
                      </>
                    ) : anyShown ? (
                      <Text style={[s.th, s.amt]}>Price</Text>
                    ) : null}
                  </View>
                </View>
                {lines.map((l, i) => (
                  <View key={i} style={s.row} wrap={false}>
                    <Text style={s.sr}>{i + 1}</Text>
                    <Text style={s.desc}>
                      {l.title ? (
                        <Text style={s.itemTitle}>{l.title.toUpperCase()}</Text>
                      ) : null}
                      {l.title && l.description && l.description !== l.title
                        ? " – "
                        : ""}
                      {l.description !== l.title ? l.description : ""}
                      {l.size ? (
                        <Text style={s.muted}>{`  (${l.size})`}</Text>
                      ) : null}
                    </Text>
                    {itemised ? (
                      <>
                        <Text style={s.num}>
                          {l.qty} {l.unit}
                        </Text>
                        <Text style={s.num}>
                          {new Intl.NumberFormat(
                            cur === "INR" ? "en-IN" : "en-AE",
                            { maximumFractionDigits: 0 },
                          ).format(l.unitPrice)}
                        </Text>
                        <Text style={s.amt}>{m(l.amount)}</Text>
                      </>
                    ) : anyShown ? (
                      <Text style={s.amt}>
                        {l.showPrice ? m(l.amount) : ""}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            );
          })}

          <View style={s.totalBox} wrap={false}>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>
                Total amount of above interior work ({lettersText})
                {taxMode === "included"
                  ? `, inclusive of ${quote.taxLabel} ${quote.taxRate}%`
                  : ""}
              </Text>
              <Serif h={28} style={s.totalAmt}>
                {m(amount)}
              </Serif>
            </View>
            {taxMode === "add" && quote.tax > 0 ? (
              <>
                <View style={s.totalSmall}>
                  <Text>
                    {quote.taxLabel} @ {quote.taxRate}%
                  </Text>
                  <Text>{m(quote.tax)}</Text>
                </View>
                <View
                  style={[
                    s.totalSmall,
                    { color: "#ffffff", fontWeight: 700, fontSize: 10 },
                  ]}
                >
                  <Text>Grand total</Text>
                  <Text>{m(quote.total)}</Text>
                </View>
              </>
            ) : null}
            <View style={s.wordsBox}>
              <Text style={s.words}>
                {cur === "INR" ? "Rupees" : cur}{" "}
                {amountInWords(quote.total, cur)} only
              </Text>
            </View>
          </View>

          {notes && notes.rates.length > 0 ? (
            <View style={s.block} wrap={false}>
              <Text style={s.h3}>Note · material rates</Text>
              {notes.rates.map((r, i) => {
                const mm = r.match(/^([^:]{2,60}):\s*(.+)$/);
                return (
                  <View
                    key={i}
                    style={[
                      s.rateRow,
                      i % 2 ? {} : { backgroundColor: "#faf6ef" },
                    ]}
                  >
                    {mm ? (
                      <>
                        <Text style={s.rateKey}>{mm[1]}</Text>
                        <Text style={s.para}>{mm[2]}</Text>
                      </>
                    ) : (
                      <Text style={s.para}>{r}</Text>
                    )}
                  </View>
                );
              })}
            </View>
          ) : null}
          {notes?.budgetNote ? (
            <View style={s.callout} wrap={false}>
              <Text style={{ lineHeight: "12.4pt" }}>
                <Text style={s.strong}>NOTE: </Text>
                {notes.budgetNote}
              </Text>
            </View>
          ) : null}
          {notes && notes.brands.length + notes.exclusions.length > 0 ? (
            <View style={s.block}>
              <Text style={s.h3} minPresenceAhead={30}>
                Brand or quality materials
              </Text>
              {[...notes.brands, ...notes.exclusions].map((b, i) => (
                <View key={i} style={s.li} wrap={false}>
                  <Text style={s.liMark}>{i + 1}.</Text>
                  <Text style={s.para}>{b}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {notes && notes.packages.length > 0 ? (
            <View style={s.block}>
              <Text style={s.h3} minPresenceAhead={30}>
                Other suggested packages
              </Text>
              {notes.packages.map((b, i) => (
                <View key={i} style={s.li} wrap={false}>
                  <Text style={s.liMark}>{String.fromCharCode(65 + i)})</Text>
                  <Text style={s.para}>{b}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {schedule.length > 0 ? (
            <View style={s.block} wrap={false}>
              <Text style={s.h3}>Payment schedule</Text>
              {schedule.map((ms, i) => (
                <View
                  key={i}
                  style={[
                    s.rateRow,
                    i % 2 ? {} : { backgroundColor: "#faf6ef" },
                  ]}
                >
                  <Text style={s.para}>{ms.label}</Text>
                  <Text style={{ width: 50, textAlign: "right" }}>
                    {ms.percent}%
                  </Text>
                  <Text
                    style={{ width: 100, textAlign: "right", fontWeight: 600 }}
                  >
                    {m((quote.total * ms.percent) / 100)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <View wrap={false}>
            {notes?.terms ? (
              <Text style={[s.muted, { marginTop: 14, fontSize: 7.6 }]}>
                {notes.terms}
              </Text>
            ) : null}
            <View style={s.sign}>
              <View style={s.signCol}>
                <Text style={s.signLine}>For {company.name}</Text>
                <Text style={s.muted}>Authorised signatory</Text>
              </View>
              <View style={[s.signCol, { marginRight: 0 }]}>
                <Text style={s.signLine}>
                  Accepted by {project.client.name}
                </Text>
                <Text style={s.muted}>Signature &amp; date</Text>
              </View>
            </View>
            <View style={{ marginTop: 22 }}>
              <Serif h={20} style={[s.thanks, { marginTop: 0 }]}>
                Thank you
              </Serif>
            </View>
          </View>
        </View>
        <View style={s.footLine} fixed />
        <Text style={s.footLeft} fixed>
          {footerBits}
        </Text>
        <Text
          style={s.footRight}
          fixed
          render={({ pageNumber, totalPages }) =>
            `${quoteNo}  ·  Page ${pageNumber} of ${totalPages}`
          }
        />
      </Page>
    </Document>
  );
}

export async function quotePdf(input: {
  project: PdfProject;
  quote: PdfQuote;
  schedule: { label: string; percent: number }[];
  company: CompanyProfile;
}) {
  registerFonts();
  let logo: { data: Buffer; format: "png" | "jpg" } | null = null;
  if (input.company.logoUrl) {
    try {
      const f = await readStoredFile(input.company.logoUrl);
      logo = { data: f.bytes, format: f.type === "image/jpeg" ? "jpg" : "png" };
    } catch {
      logo = null;
    }
  }
  return renderToBuffer(<QuotePdf {...input} logo={logo} />);
}
