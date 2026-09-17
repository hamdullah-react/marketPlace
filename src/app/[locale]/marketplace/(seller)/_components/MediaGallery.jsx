"use client";

/**
 * The seller's media library.
 *
 * Two modes from one component, and the ONLY difference between them is what a
 * click on a thumbnail means:
 *   mode="manage"  standalone gallery page — a click opens the picture
 *   mode="pick"    inside a dialog — a click chooses it, and there is a counter
 *
 * Everything else — uploading, folders, filing, deleting — is the same library
 * in both. A picker that could only look was the wrong shape: a seller choosing
 * a logo and finding the file in the wrong folder, or an old one they want gone,
 * had to shut the dialog, go to the library page, fix it, come back and start
 * the job again. It is their library either way, so it behaves like it.
 *
 * Uploads go straight to /api/marketplace/upload, which writes into the
 * showroom's OWN storage bucket (vendor-<vendorId>) and records a row in
 * media_assets. Photos are uploaded once and reused across listings and colour
 * variants rather than re-uploaded each time.
 */

import { useState, useRef, useCallback, useEffect, useSyncExternalStore } from "react";
import {
  Upload, Trash2, Check, Loader2, ImageIcon, AlertCircle, X,
  FolderPlus, Folder, Pencil, Eye, FolderInput, ExternalLink,
  MoreVertical, Scissors, Copy,
} from "lucide-react";
import { uploadMedia, deleteMedia } from "../_apicalls/catalogApi";
import {
  mediaChanged, createMediaFolder, renameMediaFolder, deleteMediaFolder,
  moveMediaToFolder, copyMediaToFolder, listMediaFolders,
} from "../_actions/media";
import { subscribeMedia, getMediaVersion, getServerMediaVersion } from "./mediaStore";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
/**
 * Both little menus are shadcn dropdowns, and that is a FIX rather than a
 * tidy-up.
 *
 * They were absolutely-positioned divs inside the tile. On the library page
 * that worked; inside the picker dialog it could not — the dialog's body is an
 * `overflow-y-auto` scroller, and an overflow container CLIPS anything
 * positioned inside it. So the cut/copy menu opened, and the seller saw
 * nothing.
 *
 * Radix renders its content in a portal at the end of the document, so the
 * scroller has nothing to clip. It also brings what hand-rolled markup was
 * missing anyway: outside-click to dismiss, arrow-key navigation, and an
 * Escape that closes the MENU and leaves the dialog open, because the topmost
 * dismissable layer is the one that answers.
 */
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { thumbUrl, THUMB } from "@/marketplace/lib/image";

const KINDS = [
  { value: "photo", ar: "الصور", en: "Photos" },
  { value: "icon", ar: "الأيقونات", en: "Icons" },
  // Brand marks. Their own tab rather than a corner of Icons: a library with
  // 26 brand logos mixed into the spec icons is a library you scroll, and the
  // two are picked in completely different places.
  { value: "logo", ar: "الشعارات", en: "Logos" },
];

/**
 * Every file in the library, from the API a page at a time — null on failure.
 *
 * The route answers at most 200 per request, and one request is what this used
 * to make: after a Car images install the gallery reloaded 200 of 400-odd
 * photos. Shared template artwork comes back on every page, hence the Map.
 */
async function fetchAllMedia(vendorId) {
  const PAGE = 200;
  const byId = new Map();

  for (let offset = 0; offset < 5000; offset += PAGE) {
    const query = new URLSearchParams({ vendor: vendorId, limit: String(PAGE), offset: String(offset) });
    const res = await fetch(`/api/marketplace/media?${query}`, { cache: "no-store" });
    const json = await res.json();
    const items = Array.isArray(json?.data) ? json.data : json?.data?.items;
    if (!json?.ok || !Array.isArray(items)) return null;

    const before = byId.size;
    for (const item of items) if (!byId.has(item.id)) byId.set(item.id, item);
    const total = Number(json.data?.total);
    if ((Number.isFinite(total) && byId.size >= total) || byId.size === before) break;
  }
  return [...byId.values()];
}

export default function MediaGallery({
  locale = "ar",
  vendorId,
  initialAssets = [],
  mode = "manage",
  selected = [],
  onSelect,
  max = null,
  listingId = null,
  /* Which tab opens first. A picker for a brand logo that opens on Photos
     makes the seller find the tab before they can find the file — and worse,
     anything they upload while it is on the wrong tab is FILED as a photo,
     which is why a freshly uploaded icon could vanish the moment the dialog
     was reopened. */
  initialKind = "photo",
  /* The seller's own shelves (schema.sql §26). The media page passes them,
     having read them on the server; a picker opened anywhere else fetches its
     own below rather than being threaded a list through six components. */
  initialFolders = [],
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  /**
   * May this gallery change the library, rather than only read it?
   *
   * The showroom, not the mode. Every control here acts on the seller's own
   * files through an action that re-checks the session and refuses a vendor id
   * that is not theirs — so the question a gate can usefully ask is "whose
   * library is this?", and the answer is the same in a dialog as on a page.
   *
   * `vendorId` is genuinely absent sometimes: the staff catalog picker opens
   * on the shared template artwork before a showroom is chosen. That library
   * belongs to everyone, so it stays read-only.
   */
  const canManage = Boolean(vendorId);

  const [assets, setAssets] = useState(initialAssets);
  const [kind, setKind] = useState(initialKind);

  /**
   * ONE selected tab, which is either a kind or a folder.
   *
   * Not two filters at once. A seller looking at "Exteriors" wants what is
   * in Exteriors — being shown the subset of it that is also filed as an
   * icon is a rule they never asked for and would have to work out from an
   * empty grid.
   */
  const [folders, setFolders] = useState(initialFolders);
  /* The shelves are fetched by a picker (below), so for a moment the tab row
     is only the three built-in tabs — and a seller who knows they have five
     folders reads that as "my folders are gone", not as "still loading". */
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [folderId, setFolderId] = useState(null);
  const [naming, setNaming] = useState(null); // null | "new" | folder id
  const [draftName, setDraftName] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  /* The preview shows the FULL file, which on a phone photo is several
     megabytes — long enough that the dialog opened on an empty
     checkerboard and looked broken. */
  const [previewReady, setPreviewReady] = useState(false);
  const [moving, setMoving] = useState(null); // asset id whose menu is open
  /* "cut" takes the file off its shelf; "copy" leaves it and makes another. */
  const [fileMode, setFileMode] = useState("cut");
  /* The asset a move or copy is in flight for. A file arriving on a shelf
     takes a round trip, and without a spinner the seller clicks again. */
  const [filing, setFiling] = useState(null);
  /* The folder whose 3-dot is open — an id, not a flag, because the menu now
     belongs to ONE tab rather than to the row. */
  const [folderMenu, setFolderMenu] = useState(null);
  const [uploading, setUploading] = useState([]);
  const [errors, setErrors] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const inputRef = useRef(null);

  /* Files this gallery uploaded or copied itself, since it mounted. */
  const addedHere = useRef(new Set());

  /**
   * Merge, do not replace — but only keep what was ADDED here.
   *
   * A straight `setAssets(initialAssets)` threw away everything uploaded since
   * the page loaded the moment the parent re-rendered — the server list has no
   * knowledge of a file uploaded thirty seconds ago. So those rows are kept and
   * the server's copy wins on id.
   *
   * It used to keep EVERY row the server did not send, which is also every row
   * that was deleted elsewhere: removing the Car images template left its
   * photos on screen, because to this merge a photo missing from the server
   * looked exactly like one uploaded a moment ago.
   */
  useEffect(() => {
    setAssets((prev) => {
      const seen = new Set(initialAssets.map((a) => a.id));
      return [
        ...initialAssets,
        ...prev.filter((a) => !seen.has(a.id) && addedHere.current.has(a.id)),
      ];
    });
  }, [initialAssets]);

  /**
   * Read the library again when something else changed it.
   *
   * Installing or removing a template publishes to mediaStore; so does another
   * tab. The photos AND the folders are re-read and replace what is here, since
   * the server is now the only one that knows — an install creates the
   * Exterior and Interior folders, which this gallery otherwise never asks for
   * again.
   *
   * Compared with the version last LOADED, not the one at the last render. A
   * Media page kept alive by the router runs this again when it is shown, sees
   * a newer version and catches up. The version is only recorded once the read
   * succeeds, so a read cut short (the page hidden again, a failed request) is
   * retried next time instead of being marked done.
   */
  const mediaVersion = useSyncExternalStore(subscribeMedia, getMediaVersion, getServerMediaVersion);
  const loadedVersion = useRef(mediaVersion);

  useEffect(() => {
    if (!vendorId || mediaVersion === loadedVersion.current) return undefined;

    let alive = true;

    Promise.all([fetchAllMedia(vendorId), listMediaFolders(vendorId)])
      .then(([items, shelves]) => {
        if (!alive) return;

        if (items) {
          setAssets(items);
          addedHere.current.clear();
        }

        if (shelves?.ok) {
          setFolders(shelves.folders);
          // A removed template can take the open folder with it.
          setFolderId((open) => (open && !shelves.folders.some((f) => f.id === open) ? null : open));
        }

        loadedVersion.current = mediaVersion;
      })
      .catch(() => {});

    return () => { alive = false; };
  }, [mediaVersion, vendorId]);

  /**
   * A PICKER reads the library itself when it opens.
   *
   * Every dialog was limited to whatever list its page happened to pass in, and
   * the pages pass a first page — the storefront reads 100 of 425. That was
   * survivable while everything sat loose in Photos, and stopped being so once
   * templates started filing their photos away: a Car images install puts all
   * 400-odd into Exterior and Interior, the kind tabs deliberately show only
   * what is NOT on a shelf, and the 100 newest assets are all filed. So the
   * pencil on a showroom's own cover opened on "Nothing here yet" — with the
   * seller's entire library present and none of it reachable, which reads as a
   * picker that cannot offer anything rather than as a page that is missing.
   *
   * Only for `pick`. The Media page reads the whole library on the server and
   * passes the folders with it, so the same fetch there would be the same list
   * fetched twice.
   *
   * Folders are left to the effect below, which already loads them for a picker
   * and shows tab-shaped skeletons while it does — asking for them here as well
   * would be two requests for one list on every open.
   */
  useEffect(() => {
    if (mode !== "pick" || !vendorId) return undefined;

    let alive = true;

    fetchAllMedia(vendorId)
      .then((items) => { if (alive && items) setAssets(items); })
      .catch(() => {});

    return () => { alive = false; };
  }, [mode, vendorId]);

  /**
   * A picker gets the same shelves as the library page.
   *
   * A seller who files two hundred photos into "Exteriors" and "Interiors" and
   * then opens the logo picker was shown one flat wall of everything — the
   * organising they had just done existed only on the page they did it on.
   *
   * Asked for here rather than passed in: ImagePicker is mounted in a dozen
   * places, none of which has a folder list, and only the ones that were
   * remembered would ever have got one. The dialog mounts on open, so this
   * fires when the picker is opened rather than on every page load.
   */
  useEffect(() => {
    if (!vendorId || initialFolders.length) return;

    let alive = true;
    setLoadingFolders(true);
    listMediaFolders(vendorId)
      .then((res) => { if (alive && res?.folders?.length) setFolders(res.folders); })
      .catch(() => {})
      .finally(() => { if (alive) setLoadingFolders(false); });
    return () => { alive = false; };
  }, [vendorId, initialFolders.length]);


  /* Newest first, always. The server already sorts this way, but a just-
     uploaded file is prepended to local state and nothing was re-sorting after
     a merge — so "where did the picture I just uploaded go?" depended on which
     list it came from. */
  /**
   * A picture is in ONE place.
   *
   * The kind tabs used to show everything of that kind, filed or not, so a
   * photo moved into "Exteriors" appeared in Exteriors AND still sat in
   * Photos — which makes a move look like it did not happen, and makes the
   * same picture look like two. A folder is a place, so leaving one means
   * leaving the other: Photos/Icons/Logos are what is NOT on a shelf yet.
   */
  const visible = assets
    .filter((a) => (folderId ? a.folder_id === folderId : !a.folder_id && a.kind === kind))
    .slice()
    .sort((a, b) => new Date(b.created_at ?? 0) - new Date(a.created_at ?? 0));
  /**
   * Is this the same picture?
   *
   * By id OR by url, because the two callers speak different languages. A
   * multi-photo picker hands back real assets; a single-image FIELD only ever
   * knew a url, so ImagePicker invents `{ id: url, url }` to describe what is
   * currently set. Comparing ids alone meant that entry matched nothing, and
   * the picker opened with no tick on the photo it was already showing —
   * leaving "which one is this field using?" unanswerable from the dialog that
   * exists to answer it. Same url is the same file, so it is the same pick.
   */
  /* How many of this kind are on a shelf rather than missing — the difference
     between "you have none" and "they are filed", which an empty tab cannot
     otherwise tell the seller. */
  const filedElsewhere = assets.filter((a) => a.folder_id && a.kind === kind).length;

  const same = (entry, asset) =>
    entry.id === asset.id || (Boolean(entry.url) && entry.url === asset.url);

  const isSelected = (asset) => selected.some((s) => same(s, asset));

  const upload = useCallback(
    async (files) => {
      if (!vendorId) {
        setErrors([t("اختر البائع أولاً", "Pick a seller first")]);
        return;
      }

      const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
      if (!list.length) return;

      setErrors([]);
      setUploading((u) => [...u, ...list.map((f) => f.name)]);

      // Sequential, not Promise.all: a seller dragging 20 photos on a phone
      // connection would otherwise open 20 sockets and stall them all.
      for (const file of list) {
        try {
          const body = new FormData();
          body.append("file", file);
          body.append("vendorId", vendorId);
          body.append("kind", kind);
          if (listingId) body.append("listingId", listingId);
          // Dropped onto an open shelf, filed on that shelf. Anything else
          // means uploading and then moving every file by hand.
          if (folderId) body.append("folderId", folderId);

          const res = await fetch("/api/marketplace/upload", { method: "POST", body });
          const json = await res.json();

          if (json?.ok && json.data?.asset) {
            addedHere.current.add(json.data.asset.id);
            setAssets((prev) => [json.data.asset, ...prev]);
          } else {
            setErrors((e) => [...e, `${file.name}: ${json?.error?.message ?? t("فشل الرفع", "Upload failed")}`]);
          }
        } catch (err) {
          setErrors((e) => [...e, `${file.name}: ${err.message}`]);
        } finally {
          setUploading((u) => u.filter((n) => n !== file.name));
        }
      }

      /**
       * Once, after the whole batch — not once per file.
       *
       * The upload is a route handler (fetch), so nothing else tells the
       * rest of the dashboard that the library moved: a photo added here
       * was missing from the picker on the Settings page until a reload.
       * Twenty dragged files should still only invalidate once.
       *
       * Failure is ignored on purpose. The files are already uploaded and
       * on screen; a stale page elsewhere is not worth an error the seller
       * can do nothing about.
       */
      mediaChanged().catch(() => {});
    },
    [vendorId, kind, folderId, listingId, t]
  );

  const remove = async (asset) => {
    setDeleting(asset.id);
    try {
      const res = await fetch(`/api/marketplace/upload?id=${asset.id}`, { method: "DELETE" });
      const json = await res.json();
      if (json?.ok) {
        setAssets((prev) => prev.filter((a) => a.id !== asset.id));
        if (isSelected(asset)) onSelect?.(selected.filter((s) => !same(s, asset)));
        // Deleting also clears any storefront logo or cover that named this
        // file, so the pages showing it have to be re-rendered.
        mediaChanged().catch(() => {});
      } else {
        setErrors((e) => [...e, json?.error?.message ?? t("فشل الحذف", "Delete failed")]);
      }
    } finally {
      setDeleting(null);
    }
  };

  /* ── Folders ───────────────────────────────────────────────────────────
     Every one of these updates local state from what the server returned,
     rather than re-reading the page: the seller is mid-organise, and a
     round trip that repaints the grid loses their place in it.
     ------------------------------------------------------------------ */

  const saveFolder = async () => {
    const name = draftName.trim();
    if (!name) return;

    setBusy(true);
    const res =
      naming === "new"
        ? await createMediaFolder(vendorId, name)
        : await renameMediaFolder(vendorId, naming, name);
    setBusy(false);

    if (!res?.ok) {
      setErrors((e) => [
        ...e,
        res?.error === "NAME_TAKEN"
          ? t("لديك مجلد بهذا الاسم.", "You already have a folder with that name.")
          : t("تعذّر الحفظ.", "Could not save."),
      ]);
      return;
    }

    setFolders((prev) =>
      naming === "new"
        ? [...prev, res.folder]
        : prev.map((f) => (f.id === res.folder.id ? res.folder : f))
    );
    if (naming === "new") setFolderId(res.folder.id);
    setNaming(null);
    setDraftName("");
  };

  const dropFolder = async (id) => {
    setBusy(true);
    const res = await deleteMediaFolder(vendorId, id);
    setBusy(false);
    if (!res?.ok) {
      setErrors((e) => [...e, t("تعذّر الحذف.", "Could not delete.")]);
      return;
    }

    setFolders((prev) => prev.filter((f) => f.id !== id));
    // The files are still here — the column is ON DELETE SET NULL — so they
    // move back to "no folder" rather than vanishing from the grid.
    setAssets((prev) => prev.map((a) => (a.folder_id === id ? { ...a, folder_id: null } : a)));
    if (folderId === id) setFolderId(null);
    setNaming(null);
  };

  /**
   * Cut or copy, one path.
   *
   * Cut re-files the row. Copy duplicates the object AND the row, so the two
   * are independent — two rows sharing one file would mean deleting either
   * leaves the other pointing at nothing.
   */
  const fileTo = async (asset, target, targetKind = null) => {
    setMoving(null);
    setFiling(asset.id);

    const res =
      fileMode === "copy"
        ? await copyMediaToFolder(vendorId, asset.id, target, targetKind)
        : await moveMediaToFolder(vendorId, asset.id, target, targetKind);

    setFiling(null);

    if (!res?.ok) {
      setErrors((e) => [
        ...e,
        res?.error === "NOT_YOURS"
          ? t("هذه الصورة مشتركة ولا يمكن نقلها.", "That picture is shared and cannot be filed.")
          : t("تعذّر التنفيذ.", "That did not work."),
      ]);
      return;
    }

    if (fileMode === "copy") {
      // The new file is put at the front, where a just-uploaded one goes.
      addedHere.current.add(res.asset.id);
      setAssets((prev) => [res.asset, ...prev]);
      return;
    }

    setAssets((prev) =>
      prev.map((a) =>
        a.id === asset.id
          ? { ...a, folder_id: res.folderId, kind: res.kind ?? a.kind }
          : a
      )
    );
  };

  /* Cleared as it opens rather than as it closes, so the flag belongs to the
     picture being opened and never carries over from the last one. A cached
     file still fires load, so this costs a frame at most. */
  const openPreview = (asset) => {
    setPreviewReady(false);
    setPreview(asset);
  };

  const toggle = (asset) => {
    if (!onSelect) return;

    if (isSelected(asset)) {
      onSelect(selected.filter((s) => !same(s, asset)));
      return;
    }

    // A single-slot picker REPLACES rather than refuses. Blocking at the limit
    // meant that once an image was set, every click on a different one was
    // silently swallowed — you could set an image but never change it.
    if (max === 1) {
      onSelect([asset]);
      return;
    }

    // Above one, refusing is right: silently evicting something the user chose
    // deliberately is worse than doing nothing.
    if (max && selected.length >= max) return;
    onSelect([...selected, asset]);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    upload(e.dataTransfer.files);
  };

  return (
    <div className="space-y-4">
      {/* ── Kind tabs ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        {/* ── Tabs ────────────────────────────────────────────────────────
            The three built-in TYPES first, then the showroom's own shelves.
            One row and one selection: picking a folder clears the kind and
            vice versa, so the grid always answers a single question.
            --------------------------------------------------------- */}
        <div className="flex flex-wrap items-center gap-1.5">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => { setKind(k.value); setFolderId(null); }}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                !folderId && kind === k.value
                  ? "bg-brand-primary text-white"
                  : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
              }`}
            >
              {t(k.ar, k.en)}
            </button>
          ))}

          {folders.length || loadingFolders ? (
            <span className="mx-1 h-5 w-px bg-brand-primary/10 dark:bg-white/10" />
          ) : null}

          {/* Tab-shaped, not a spinner: the row is about to be this wide, so
              nothing under it jumps when the real names arrive. */}
          {loadingFolders ? (
            <>
              <Skeleton className="h-8 w-24 rounded-lg" />
              <Skeleton className="h-8 w-20 rounded-lg" />
            </>
          ) : null}

          {/* ── One shelf, and its own menu ──────────────────────────────
              The 3-dot lives ON the tab it acts on. A single menu beside the
              row could only ever act on whichever folder happened to be open,
              so renaming a folder meant opening it first — and a delete
              floating next to the tabs reads as though it might apply to any
              of them. Attached to the tab, the question "which folder does
              this delete?" cannot be asked.
              ------------------------------------------------------- */}
          {folders.map((f) => {
            const on = folderId === f.id;
            const owned = canManage;

            return (
              <div key={f.id} className="relative">
                <div
                  className={`flex items-center rounded-lg transition-colors ${
                    on
                      ? "bg-brand-primary text-white"
                      : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => { setFolderId(f.id); setFolderMenu(null); }}
                    className={`flex items-center gap-1.5 py-1.5 text-sm ${
                      owned ? "ps-3 pe-1.5" : "px-3"
                    }`}
                  >
                    <Folder className="h-3.5 w-3.5" />
                    {f.name}
                    <span className="text-xs opacity-70 tabular-nums">
                      {assets.filter((a) => a.folder_id === f.id).length}
                    </span>
                  </button>

                  {owned ? (
                    /* modal={false} on both dropdowns: they open INSIDE a
                       dialog, and a modal menu inside a modal dialog fights it
                       for the scroll lock and the pointer-events guard. */
                    <DropdownMenu
                      modal={false}
                      open={folderMenu === f.id}
                      onOpenChange={(v) => setFolderMenu(v ? f.id : null)}
                    >
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className={`rounded-e-lg py-1.5 pe-2 ps-0.5 transition-opacity ${
                            on ? "text-white/80 hover:text-white" : "opacity-60 hover:opacity-100"
                          }`}
                          title={t("خيارات المجلد", "Folder options")}
                          aria-label={t("خيارات المجلد", "Folder options")}
                        >
                          {busy && folderMenu === f.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <MoreVertical className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </DropdownMenuTrigger>

                      <DropdownMenuContent
                        align="start"
                        dir={isAr ? "rtl" : "ltr"}
                        className="w-56"
                      >
                        <DropdownMenuLabel className="flex items-center justify-between gap-2 py-1 text-[11px] font-medium text-muted-foreground">
                          <span className="truncate">{f.name}</span>
                          <button
                            type="button"
                            onClick={() => setFolderMenu(null)}
                            className="rounded p-0.5 transition-colors hover:bg-muted"
                            aria-label={t("إغلاق", "Close")}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />

                        <DropdownMenuItem
                          className="text-xs"
                          onSelect={() => { setNaming(f.id); setDraftName(f.name); }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          {t("إعادة تسمية", "Rename")}
                        </DropdownMenuItem>

                        <DropdownMenuItem
                          className="items-start text-xs text-red-600 focus:text-red-600"
                          onSelect={() => dropFolder(f.id)}
                        >
                          <Trash2 className="mt-0.5 h-3.5 w-3.5" />
                          <span>
                            {t("حذف المجلد", "Delete folder")}
                            <span className="block text-[10px] opacity-70">
                              {t("تبقى الصور في المكتبة", "The pictures stay in the library")}
                            </span>
                          </span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
              </div>
            );
          })}

          {/* Offered in the dialog too. A seller who realises mid-choice that
              this photo belongs on a shelf they have not made yet should be
              able to make it there and then. */}
          {canManage ? (
            <button
              type="button"
              onClick={() => { setNaming("new"); setDraftName(""); setFolderMenu(null); }}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-brand-primary transition-colors hover:bg-brand-primary/10"
              title={t("مجلد جديد", "New folder")}
            >
              <FolderPlus className="h-4 w-4" />
              {t("مجلد جديد", "New folder")}
            </button>
          ) : null}
        </div>

        {mode === "pick" && max ? (
          <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">
            {selected.length} / {max}
          </span>
        ) : null}
      </div>

      {/* One box for both jobs — a new folder and a rename are the same
          question, and Enter answers it. */}
      {naming ? (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); saveFolder(); }
              if (e.key === "Escape") { setNaming(null); setDraftName(""); }
            }}
            maxLength={40}
            placeholder={t("مثال: صور خارجية", "e.g. Exterior shots")}
            className="h-9 flex-1 rounded-lg border bg-background px-3 text-sm outline-hidden focus:border-brand-primary"
          />
          <button
            type="button"
            onClick={saveFolder}
            disabled={busy || !draftName.trim()}
            className="raised-solid h-9 rounded-lg bg-brand-primary px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("حفظ", "Save")}
          </button>
          <button
            type="button"
            onClick={() => { setNaming(null); setDraftName(""); }}
            className="h-9 rounded-lg border px-3 text-sm"
          >
            {t("إلغاء", "Cancel")}
          </button>
        </div>
      ) : null}

      {/* ── Dropzone ─────────────────────────────────────────────────────── */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
          dragging
            ? "border-brand-primary bg-brand-primary/5"
            : "border-gray-300 hover:border-brand-primary dark:border-gray-600"
        }`}
      >
        <Upload className="h-7 w-7 text-brand-primary" />
        <p className="mt-2 text-sm font-medium text-brand-primary">
          {t("اسحب الصور هنا أو اضغط للاختيار", "Drag images here, or click to choose")}
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {t("JPEG · PNG · WebP · AVIF · SVG — حتى 8 ميجابايت", "JPEG · PNG · WebP · AVIF · SVG — up to 8 MB")}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => { upload(e.target.files); e.target.value = ""; }}
        />
      </div>

      {/* ── Errors ───────────────────────────────────────────────────────── */}
      {errors.length ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/40">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 text-xs text-red-700 dark:text-red-300">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <ul className="space-y-0.5">
                {errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
            <button type="button" onClick={() => setErrors([])} aria-label={t("إغلاق", "Dismiss")}>
              <X className="h-3.5 w-3.5 text-red-500" />
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Grid ─────────────────────────────────────────────────────────── */}
      {visible.length === 0 && uploading.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-12 text-center dark:border-gray-700">
          <ImageIcon className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" />
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {t("لا توجد ملفات بعد", "Nothing here yet")}
          </p>

          {/* An empty tab has two very different causes, and "you have no
              photos" is the wrong one to imply at a seller who has fifty of
              them on a shelf. Say which folders to look in. */}
          {!folderId && filedElsewhere ? (
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              {t(
                `${filedElsewhere} في المجلدات`,
                `${filedElsewhere} ${filedElsewhere === 1 ? "is" : "are"} in your folders`
              )}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {uploading.map((name) => (
            <div
              key={`up-${name}`}
              className="flex aspect-square items-center justify-center rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-[#141414]"
            >
              <Loader2 className="h-5 w-5 animate-spin text-brand-primary" />
            </div>
          ))}

          {visible.map((asset) => {
            const picked = isSelected(asset);
            const order = picked ? selected.findIndex((s) => same(s, asset)) + 1 : null;

            return (
              /* Two boxes, not one: the square CROPS its thumbnail, and a
                 clipping box cannot also hold a dropdown — the folder menu
                 was being cut off at the tile's edge. The outer box does the
                 positioning, the inner one does the cropping. */
              <div key={asset.id} className="group relative">
                <div
                  className={`aspect-square overflow-hidden rounded-lg border-2 transition-colors ${
                    picked ? "border-brand-primary" : "border-gray-200 dark:border-gray-700"
                  }`}
                >
                  <button
                    type="button"
                    /* In a picker the tile picks. On the library page there is
                       nothing to pick, so it opens the picture instead — which
                       is what clicking a thumbnail is expected to do. */
                    onClick={() => (mode === "pick" ? toggle(asset) : openPreview(asset))}
                    className="block h-full w-full cursor-pointer"
                    aria-pressed={mode === "pick" ? picked : undefined}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumbUrl(asset.url, THUMB.grid)}
                      alt={asset.alt_en || asset.filename || ""}
                      className="h-full w-full bg-gray-50 object-cover dark:bg-[#141414]"
                      loading="lazy"
                    />
                  </button>
                </div>

                {/* The first pick is the main photo — say so, don't make them guess. */}
                {picked ? (
                  <span className="raised-solid absolute inset-s-1.5 top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-brand-primary px-1.5 text-[11px] font-bold text-white">
                    {order === 1 ? <Check className="h-3.5 w-3.5" /> : order}
                  </span>
                ) : null}

                {/* ── Per-tile controls ──────────────────────────────────
                    A column down the trailing edge so they never cover the
                    picture they act on, and hidden until hover on a mouse —
                    on touch there is no hover, so they stay visible.
                    ------------------------------------------------- */}
                <div className="absolute inset-e-1.5 top-1.5 flex flex-col gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => openPreview(asset)}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow-sm transition-colors hover:bg-white dark:bg-black/70"
                    aria-label={t("معاينة", "Preview")}
                    title={t("معاينة", "Preview")}
                  >
                    <Eye className="h-3.5 w-3.5 text-neutral-700 dark:text-white" />
                  </button>

                  {canManage ? (
                    <>
                      {/* Shared template artwork has no vendor of its own and
                          belongs to everyone who installed the template, so it
                          cannot be filed or deleted from here. */}
                      {/* Offered even with no folders at all: moving between
                          Photos, Icons and Logos is a move in itself. */}
                      {canManage ? (
                        <DropdownMenu
                          modal={false}
                          open={moving === asset.id}
                          onOpenChange={(v) => setMoving(v ? asset.id : null)}
                        >
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow-sm transition-colors hover:bg-white dark:bg-black/70"
                              aria-label={t("نقل إلى مجلد", "Move to folder")}
                              title={t("نقل إلى مجلد", "Move to folder")}
                            >
                              <FolderInput className="h-3.5 w-3.5 text-neutral-700 dark:text-white" />
                            </button>
                          </DropdownMenuTrigger>

                          <DropdownMenuContent
                            align="end"
                            dir={isAr ? "rtl" : "ltr"}
                            className="w-56"
                          >
                            <DropdownMenuLabel className="flex items-center justify-between gap-2 py-1 text-[11px] font-medium text-muted-foreground">
                              {t("نقل إلى", "File it in")}
                              <button
                                type="button"
                                onClick={() => setMoving(null)}
                                className="rounded p-0.5 transition-colors hover:bg-muted"
                                aria-label={t("إغلاق", "Close")}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </DropdownMenuLabel>

                            {/* Cut or copy FIRST, then where to. Two lists of
                                folders under two headings would be twice the
                                height and the same decision made twice.

                                preventDefault on select, because choosing a
                                MODE is not choosing an action — without it
                                Radix closes the menu on the click that was
                                only meant to arm it. */}
                            <DropdownMenuRadioGroup
                              value={fileMode}
                              onValueChange={setFileMode}
                            >
                              <DropdownMenuRadioItem
                                value="cut"
                                onSelect={(e) => e.preventDefault()}
                                className="text-xs"
                              >
                                <Scissors className="me-1.5 h-3.5 w-3.5" />
                                {t("قص", "Cut")}
                              </DropdownMenuRadioItem>
                              <DropdownMenuRadioItem
                                value="copy"
                                onSelect={(e) => e.preventDefault()}
                                className="text-xs"
                              >
                                <Copy className="me-1.5 h-3.5 w-3.5" />
                                {t("نسخ", "Copy")}
                              </DropdownMenuRadioItem>
                            </DropdownMenuRadioGroup>

                            <DropdownMenuSeparator />

                            {/* ── Where it is now is MARKED ──────────────
                                Cutting a picture to the place it already is
                                moves it nowhere, so that one row is disabled —
                                and a greyed row with nothing to explain it just
                                reads as broken. The tick says which row it is
                                and why. Copy leaves them all live: copying into
                                the same place is a real duplicate.
                                ------------------------------------- */}

                            {/* ── The three built-in tabs ────────────────
                                They are destinations like any shelf. A picture
                                uploaded on the wrong tab used to be stuck as
                                the wrong kind — a logo filed under Photos was
                                invisible to every logo picker, and the only
                                cure was deleting a file that a car might
                                already be using and uploading it again.
                                ------------------------------------- */}
                            {KINDS.map((k) => {
                              const here = !asset.folder_id && asset.kind === k.value;

                              return (
                                <DropdownMenuItem
                                  key={k.value}
                                  className="text-xs"
                                  disabled={fileMode === "cut" && here}
                                  onSelect={() => fileTo(asset, null, k.value)}
                                >
                                  <ImageIcon className="h-3.5 w-3.5" />
                                  <span className="truncate">{t(k.ar, k.en)}</span>
                                  {here ? (
                                    <span className="ms-auto flex items-center gap-1 text-[10px] opacity-70">
                                      <Check className="h-3 w-3" />
                                      {t("هنا الآن", "here now")}
                                    </span>
                                  ) : null}
                                </DropdownMenuItem>
                              );
                            })}

                            {folders.length ? <DropdownMenuSeparator /> : null}

                            {folders.map((f) => {
                              const here = asset.folder_id === f.id;

                              return (
                                <DropdownMenuItem
                                  key={f.id}
                                  className="text-xs"
                                  disabled={fileMode === "cut" && here}
                                  onSelect={() => fileTo(asset, f.id)}
                                >
                                  <Folder className="h-3.5 w-3.5" />
                                  <span className="truncate">{f.name}</span>
                                  {here ? (
                                    <span className="ms-auto flex items-center gap-1 text-[10px] opacity-70">
                                      <Check className="h-3 w-3" />
                                      {t("هنا الآن", "here now")}
                                    </span>
                                  ) : null}
                                </DropdownMenuItem>
                              );
                            })}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => remove(asset)}
                        disabled={deleting === asset.id}
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow-sm transition-colors hover:bg-red-50 dark:bg-black/70"
                        aria-label={t("حذف", "Delete")}
                        title={t("حذف", "Delete")}
                      >
                        {deleting === asset.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-red-600" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5 text-red-600" />
                        )}
                      </button>
                    </>
                  ) : null}
                </div>

                {/* The round trip, made visible. Over the picture rather than
                    on the button, because the whole tile is what changes. */}
                {filing === asset.id ? (
                  <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/70 dark:bg-black/60">
                    <Loader2 className="h-5 w-5 animate-spin text-brand-primary" />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {mode === "pick" && selected.length > 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t("الصورة رقم ١ هي الصورة الرئيسية.", "Image 1 is the main photo.")}
        </p>
      ) : null}

      {/* ── Preview ──────────────────────────────────────────────────────
          The FULL file, not the grid thumbnail — the whole point is to see
          what the crop hides. thumbUrl() is deliberately not used here.

          The facts beside it are the ones a seller checks before using a
          picture somewhere: what it is called, how big it is, and its
          dimensions — a 400px file is why a banner looks soft.
          --------------------------------------------------------- */}
      <Dialog open={Boolean(preview)} onOpenChange={(v) => !v && setPreview(null)}>
        <DialogContent dir={isAr ? "rtl" : "ltr"} className="flex max-h-[90vh] flex-col sm:max-w-4xl">
          <DialogHeader className="pr-12">
            <DialogTitle className="truncate text-start text-base text-brand-primary">
              {preview?.filename || t("معاينة", "Preview")}
            </DialogTitle>
          </DialogHeader>

          {preview ? (
            <>
              <div className="relative min-h-0 flex-1 overflow-auto rounded-lg bg-[repeating-conic-gradient(#f3f4f6_0_25%,transparent_0_50%)] bg-[length:20px_20px] p-2 dark:bg-[repeating-conic-gradient(#1f1f1f_0_25%,transparent_0_50%)]">
                {!previewReady ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-brand-primary" />
                  </div>
                ) : null}

                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview.url}
                  alt={preview.filename || ""}
                  onLoad={() => setPreviewReady(true)}
                  /* A broken file must clear it too, or the spinner turns
                     into a permanent one over a picture that will never
                     arrive. */
                  onError={() => setPreviewReady(true)}
                  className={`mx-auto max-h-[60vh] w-auto max-w-full object-contain transition-opacity ${
                    previewReady ? "opacity-100" : "opacity-0"
                  }`}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-muted-foreground">
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
                  {preview.width && preview.height ? (
                    <span>{preview.width} × {preview.height}</span>
                  ) : null}
                  {preview.size_bytes ? (
                    <span>{(preview.size_bytes / 1048576).toFixed(2)} MB</span>
                  ) : null}
                  {preview.mime_type ? <span>{preview.mime_type}</span> : null}
                  {preview.folder_id ? (
                    <span className="flex items-center gap-1">
                      <Folder className="h-3 w-3" />
                      {folders.find((f) => f.id === preview.folder_id)?.name ?? ""}
                    </span>
                  ) : null}
                </span>

                {/* Opens in a tab rather than offering a download: the file is
                    already theirs and a new tab is where a URL can be copied
                    from, which is what this is actually reached for. */}
                <a
                  href={preview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-brand-primary hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {t("فتح الملف", "Open the file")}
                </a>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
