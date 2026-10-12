import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { PageHeader, Section } from "@/components/ui";
import { Installer } from "./installer";

export const metadata = { title: "Install Zuki on a board" };

export default async function DeviceInstallPage() {
  await requireUser("admin");
  return (
    <>
      <PageHeader
        title="Install Zuki on a board"
        subtitle="For the Waveshare ESP32-S3 2.16″ AMOLED board. Takes about two minutes."
        back={{ href: "/admin", label: "Team" }}
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Section title="Install">
          <ol className="grid gap-4 text-sm">
            <li>
              <p className="font-semibold">
                1. Use Chrome or Edge on a computer
              </p>
              <p className="text-muted">
                Installing over USB needs Chrome or Edge on Windows, Mac or
                Linux. Phones and Safari can&apos;t do it.
              </p>
            </li>
            <li>
              <p className="font-semibold">
                2. Plug the board in with a USB-C data cable
              </p>
              <p className="text-muted">
                If no port shows up, try another cable — some only charge.
              </p>
            </li>
            <li>
              <p className="font-semibold">
                3. Click Install, pick the port, and wait
              </p>
              <p className="text-muted">
                When it finishes it asks for your Wi-Fi name and password —
                that&apos;s sent straight to the board.
              </p>
              <div className="mt-3">
                <Installer />
              </div>
            </li>
            <li>
              <p className="font-semibold">4. Pair it</p>
              <p className="text-muted">
                On the{" "}
                <Link href="/admin" className="font-semibold text-brass">
                  Team page
                </Link>
                , under Zuki desk devices, add a device for the person
                who&apos;ll use it. Type the 6-digit code on the board&apos;s
                keypad. Done — tap Zuki and talk.
              </p>
            </li>
          </ol>
        </Section>
        <Section title="Good to know">
          <ul className="grid gap-2 text-sm text-muted">
            <li>
              Zuki needs the voice key (ELEVENLABS_API_KEY, or OPENAI_API_KEY
              with credit) to hear and to speak. Without it the board shows text
              only.
            </li>
            <li>
              Tap Zuki, or press the side button, to talk. It stops listening by
              itself when you pause.
            </li>
            <li>
              To change Wi-Fi, plug it in and click Install again — choose
              &ldquo;Change Wi-Fi&rdquo;.
            </li>
            <li>
              Hold the side button for 8 seconds to forget Wi-Fi and pairing.
            </li>
            <li>
              Running the installer again updates Zuki to the latest version;
              pairing is kept unless you erase.
            </li>
          </ul>
        </Section>
      </div>
    </>
  );
}
