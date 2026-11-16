"use client";

import { Eye, Keyboard, Layers, LogOut, Map as MapIcon, Volume2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { resetInput, setState, useDrill } from "./drillStore";
import { ToolButton, ghost, panel, primary } from "./ui";

const SEEN = "arunika:controls-seen";

// A native modal dialog: focus stays inside, Esc closes it, the rest of the page is inert.
function Modal({ open, onClose, labelledBy, children }: { open: boolean; onClose: () => void; labelledBy: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      // A movement key held while the dialog opens would otherwise stay pressed.
      resetInput();
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onClose={onClose}
      // The game listens for keys on window; stop them here so the player doesn't move behind the dialog.
      onKeyDown={(e) => e.stopPropagation()}
      // Only the backdrop is the dialog element itself; the content sits in the inner div.
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className={`${panel} pointer-events-auto m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto p-0 text-sm text-pasir backdrop:bg-malam/60`}
    >
      <div className="space-y-4 p-4 sm:p-5">{children}</div>
    </dialog>
  );
}

const K = ({ children }: { children: ReactNode }) => (
  <kbd className="inline-flex min-w-8 items-center justify-center bg-malam-2 px-1.5 py-0.5 text-pasir">{children}</kbd>
);

function Rows({ rows }: { rows: [ReactNode[], string][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
      {rows.map(([keys, what]) => (
        <div key={what} className="contents">
          <dt className="flex flex-wrap gap-1">
            {keys.map((k, i) => (
              <K key={i}>{k}</K>
            ))}
          </dt>
          <dd>{what}</dd>
        </div>
      ))}
    </dl>
  );
}

const KEYBOARD: [string[], string][] = [
  [["W", "A", "S", "D"], "Bergerak maju, kiri, mundur, kanan"],
  [["↑", "←", "↓", "→"], "Bergerak, sama seperti W A S D"],
  [["Shift"], "Tahan untuk berlari"],
  [["C"], "Tahan untuk merunduk dan melindungi kepala"],
  [["E"], "Aksi: berlindung di bawah meja, buka pintu, matikan listrik, lapor ke petugas"],
  [["Spasi"], "Lompati rintangan saat tanda lompat muncul"],
  [["M"], "Buka atau tutup peta evakuasi"],
  [["V"], "Ganti kamera orang pertama atau ketiga"],
  [["Klik layar"], "Kunci mouse, lalu gerakkan untuk melihat ke sekeliling"],
  [["Esc"], "Lepaskan mouse, tutup peta atau jendela yang terbuka"],
];

const TOUCH: [string[], string][] = [
  [["↑", "←", "↓", "→"], "Tahan untuk bergerak"],
  [["Lari"], "Tahan untuk berlari"],
  [["Merunduk"], "Tahan untuk merunduk dan melindungi kepala"],
  [["Aksi"], "Tombol atas; namanya berganti sesuai benda di dekatmu"],
  [["Lompat"], "Muncul saat ada rintangan yang bisa dilompati"],
  [["Seret layar"], "Melihat ke sekeliling"],
];

const icon = "size-4 my-0.5";
const SCREEN: [ReactNode[], string][] = [
  [[<Keyboard key="k" aria-label="Panduan" className={icon} />], "Membuka panduan ini kapan saja"],
  [[<MapIcon key="k" aria-label="Peta" className={icon} />], "Membuka peta evakuasi, sama dengan tombol M"],
  [[<Layers key="k" aria-label="Risiko AI" className={icon} />], "Menampilkan bangunan berisiko"],
  [[<Volume2 key="k" aria-label="Bisukan" className={icon} />], "Mematikan atau menyalakan lagi suara"],
  [[<Eye key="k" aria-label="Orang pertama" className={icon} />], "Ganti kamera orang pertama atau ketiga, sama dengan tombol V"],
  [[<LogOut key="k" aria-label="Keluar" className={`${icon} text-bahaya`} />], "Keluar dari simulasi"],
  [["Jalur AI"], "Menampilkan jalur evakuasi terbaik (−150 poin)"],
  [["Akhiri latihan"], "Menyelesaikan latihan dan melihat skor"],
];

function Guide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const running = useDrill((s) => s.phase === "running");
  return (
    <Modal open={open} onClose={onClose} labelledBy="controls-title">
      <div>
        <h2 id="controls-title" className="text-lg font-bold">
          Panduan kontrol
        </h2>
        {running && <p className="mt-1 text-fajar">Waktu simulasi tetap berjalan selama panduan ini terbuka.</p>}
      </div>
      {/* Same split as the touch pad: buttons on touch screens, keys everywhere else. */}
      <section className="space-y-2 pointer-coarse:hidden">
        <h3 className="font-semibold text-redup">Keyboard dan mouse</h3>
        <Rows rows={KEYBOARD} />
      </section>
      <section className="hidden space-y-2 pointer-coarse:block">
        <h3 className="font-semibold text-redup">Tombol sentuh (kanan bawah)</h3>
        <Rows rows={TOUCH} />
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold text-redup">Tombol di layar</h3>
        <Rows rows={SCREEN} />
      </section>
      <button type="button" autoFocus className={`${primary} w-full`} onClick={onClose}>
        Mengerti
      </button>
    </Modal>
  );
}

function ConfirmExit({ open, onClose }: { open: boolean; onClose: () => void }) {
  const running = useDrill((s) => s.phase === "running");
  const router = useRouter();
  const leave = () => {
    onClose();
    // Mid-drill, leave the drill for the simulation menu, unscored like a drill never finished; otherwise leave the campus.
    if (running) setState({ phase: "idle", showRoute: false, result: null, mapOpen: false, chatOpen: false });
    else router.push("/");
  };
  return (
    <Modal open={open} onClose={onClose} labelledBy="exit-title">
      <div className="space-y-1">
        <h2 id="exit-title" className="text-lg font-bold">
          Keluar dari simulasi?
        </h2>
        <p className="text-redup">
          {running ? "Latihan ini dihentikan dan tidak dinilai. Kamu kembali ke menu simulasi." : "Kamu akan kembali ke halaman utama."}
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" autoFocus className={primary} onClick={onClose}>
          Lanjutkan Simulasi
        </button>
        <button type="button" className={`${ghost} border-bahaya text-bahaya hover:border-bahaya hover:bg-bahaya/10`} onClick={leave}>
          Keluar
        </button>
      </div>
    </Modal>
  );
}

// The HUD toolbar: the guide first, the exit last, the screen's own tools between; the dialogs come with it.
export default function SimControls({ children }: { children: ReactNode }) {
  // The guide opens by itself until the player has closed it once.
  const [guide, setGuide] = useState(() => {
    try {
      return !localStorage.getItem(SEEN);
    } catch {
      return true;
    }
  });
  const [exit, setExit] = useState(false);
  const closeGuide = () => {
    setGuide(false);
    try {
      localStorage.setItem(SEEN, "1");
    } catch {
      // Storage may be blocked; showing the guide again next visit is harmless.
    }
  };

  return (
    <>
      <div role="toolbar" aria-label="Alat simulasi" className="flex gap-0.5 rounded-lg border border-malam-3 bg-malam/90 p-1 shadow-lg">
        <ToolButton label="Panduan" dialog onClick={() => setGuide(true)}>
          <Keyboard aria-hidden="true" />
        </ToolButton>
        {children}
        <ToolButton label="Keluar" dialog onClick={() => setExit(true)}>
          <LogOut aria-hidden="true" className="text-bahaya" />
        </ToolButton>
      </div>
      <Guide open={guide} onClose={closeGuide} />
      <ConfirmExit open={exit} onClose={() => setExit(false)} />
    </>
  );
}
