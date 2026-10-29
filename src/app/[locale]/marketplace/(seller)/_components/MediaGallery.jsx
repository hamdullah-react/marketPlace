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

import Img from '@/marketplace/ui/Img';
import { useState, useRef, useCallback, useEffect, useSyncExternalStore } from "react";
import {
  Upload, Trash2, Check, Loader2, ImageIcon, AlertCircle, X, Sparkles,
  FolderPlus, Folder, Pencil, Eye, FolderInput, ExternalLink,
  MoreVertical, Scissors, Copy, CheckSquare, Square,
} from "lucide-react";
import { useOnChange } from "@/hooks/use-on-change";
import { uploadMedia, deleteMedia } from "../_apicalls/catalogApi";
import {
  mediaChanged, createMediaFolder, renameMediaFolder, deleteMediaFolder,
  moveMediaToFolder, copyMediaToFolder, listMediaFolders,
} from "../_actions/media";
import { subscribeMedia, getMediaVersion, getServerMediaVersion } from "./mediaStore";
import BackgroundStudio from "./BackgroundStudio";
import dynamic from "next/dynamic";
import { compressImage, blobToFile, formatBytes } from "@/marketplace/media/compress";

/**
 * The cropper is ~30 KB and is of no use to a seller who is not editing a
 * photo this second, so it is fetched when one is opened. ssr:false because it
 * measures a DOM box that does not exist on the server — the same reason the
 * header's search dialog is loaded this way.
 */
const ImageEditorDialog = dynamic(() => import("./ImageEditorDialog"), { ssr: false });

/** What may be stored, matching the upload route. Shown before anything is sent. */
const MAX_STORED_BYTES = 1024 * 1024;

/**
 * ── Recognising a file, when the browser will not ───────────────────────────
 *
 * `file.type` is the browser's guess and it is routinely EMPTY for an SVG
 * dragged out of a file manager, or served as text/plain by some sources. The
 * old filter was `f.type.startsWith("image/")`, so those files were dropped on
 * the floor with no message at all — the seller dragged a logo in and nothing
 * whatsoever happened.
 *
 * So the extension is consulted whenever the type is missing or unhelpful.
 * Nothing here is a security boundary: the route re-checks, and sharp decides
 * what a file really is by reading it.
 */
const IMAGE_EXT = /\.(jpe?g|png|webp|avif|gif|svg)$/i;

function isSvg(file) {
  return file?.type === "image/svg+xml" || /\.svg$/i.test(file?.name ?? "");
}

function isImage(file) {
  if (!file) return false;
  if (typeof file.type === "string" && file.type.startsWith("image/")) return true;
  return IMAGE_EXT.test(file.name ?? "");
}
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
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
  DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
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
  /* The asset a move or copy is in flight for. A file arriving on a shelf
     takes a round trip, and without a spinner the seller clicks again. */
  const [filing, setFiling] = useState(null);
  /* The folder whose 3-dot is open — an id, not a flag, because the menu now
     belongs to ONE tab rather than to the row. */
  const [folderMenu, setFolderMenu] = useState(null);
  const [uploading, setUploading] = useState([]);
  /**
   * The editor queue: every picked file, handled one at a time.
   *
   * It used to be a single file, and a drag of several skipped the dialog
   * entirely — so a seller uploading five photos could crop none of them, and
   * the format and size they chose for one did not reach the rest.
   *
   * `queue` is what is left, `queue[0]` is on screen. Each file is dealt with
   * and uploaded before the next appears, so twenty photos never hold twenty
   * decoded bitmaps at once.
   */
  const [queue, setQueue] = useState([]);
  /**
   * One object URL per queued file, made ONCE when the queue is set.
   *
   * The filmstrip renders every thumbnail, and the dialog is remounted on each
   * advance so that one photo's crop cannot leak into the next. If the URLs
   * were made inside the dialog, every advance would mint and decode the whole
   * strip again — twenty bitmaps per photo on a twenty-photo batch.
   */
  const [thumbs, setThumbs] = useState([]);
  /** Indexes already uploaded, so the strip can tick them and advance past. */
  const [doneIdx, setDoneIdx] = useState([]);
  /**
   * What each finished photo turned into: { bytes, format }.
   *
   * The strip prints it under the thumbnail, so a seller part-way through a
   * batch can see that the first four really were compressed and to what —
   * a tick alone says "handled", which is not the same claim.
   */
  const [doneInfo, setDoneInfo] = useState({});

  /**
   * What has been done to each queued photo, kept OUTSIDE the dialog.
   *
   * The dialog is keyed on the current photo so one crop cannot leak into the
   * next — which also means it is torn down and rebuilt on every jump. With
   * the crop, the format and the compressed result living inside it, moving to
   * photo 2 and back to photo 1 discarded everything done to photo 1: the
   * seller cropped, looked away, came back and found the original.
   *
   * So the edits live here, where the queue lives, and the dialog is handed
   * its photo's entry on mount and reports changes back as they happen. The
   * BLOB is kept rather than an object URL: a url belongs to the document that
   * made it, and the remounted dialog makes its own from these bytes.
   */
  const [edits, setEdits] = useState({});

  const patchEdit = (i, patch) =>
    setEdits((prev) => ({ ...prev, [i]: { ...(prev[i] ?? {}), ...patch } }));
  const [current, setCurrent] = useState(0);

  const editing = queue[current] ?? null;

  /* Opening a queue: URLs in, counters reset. Not an effect — this is the
     event, and deriving it later would mean a render showing a strip with no
     pictures in it. */
  const openQueue = (files) => {
    setThumbs((old) => {
      old.forEach((u) => URL.revokeObjectURL(u));
      return files.map((f) => URL.createObjectURL(f));
    });
    setQueue(files);
    setDoneIdx([]);
    setDoneInfo({});
    setEdits({});
    setCurrent(0);
  };

  const closeQueue = () => {
    setThumbs((old) => {
      old.forEach((u) => URL.revokeObjectURL(u));
      return [];
    });
    setQueue([]);
    setDoneIdx([]);
    setDoneInfo({});
    setEdits({});
    setCurrent(0);
  };

  /**
   * Move to the next photo nobody has dealt with yet.
   *
   * Forward from here first, then round to the start, so skipping one and
   * coming back to it later works without the seller hunting for it. When
   * there is nothing left the queue closes itself — a dialog that stays open
   * over an empty strip is a dialog somebody has to dismiss for no reason.
   */
  const advanceFrom = (index, doneList) => {
    const total = queue.length;
    for (let step = 1; step <= total; step += 1) {
      const candidate = (index + step) % total;
      if (!doneList.includes(candidate)) {
        setCurrent(candidate);
        return;
      }
    }
    closeQueue();
  };
  const [errors, setErrors] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [deleting, setDeleting] = useState(null);

  /**
   * ── Bulk selection ────────────────────────────────────────────────────
   *
   * Deliberately NOT the picker's `selected`. That one answers "which photos
   * is this listing using", lives with the caller and is capped by `max`;
   * this one answers "which files am I about to act on" and is local,
   * uncapped, and only exists on the library page. Sharing one list would
   * mean ticking a photo to delete it also attached it to a car.
   */
  const [marked, setMarked] = useState(() => new Set());
  /** The pending destructive action: { assets: [...] }, or null. */
  const [pendingDelete, setPendingDelete] = useState(null);
  /** Progress of a run over many files: { done, total, verb }. */
  const [bulk, setBulk] = useState(null);
  /* Which photo the background dialog is open on, or null. One dialog for
     the whole grid rather than one per tile: it holds a 42 MB model and a
     canvas, and twenty mounted copies of that is twenty of each. */
  const [studioAsset, setStudioAsset] = useState(null);
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
  /**
   * Leaving a tab or a shelf drops the ticks.
   *
   * A mark that survives the move is a file the seller can no longer SEE, and
   * the next click on "Delete 12" would take four pictures off a shelf they
   * are not looking at. During render rather than in an effect, so the count
   * never paints a number that is already wrong — see hooks/use-on-change.
   */
  useOnChange(`${kind}|${folderId ?? ""}`, () => setMarked(new Set()));

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
    /**
     * `precompressed` is set by the crop dialog, whose output has ALREADY been
     * resized and encoded. Without it the blob would be put through the
     * compressor a second time — re-encoding a lossy image to the same lossy
     * format, which sharpens the first pass's artefacts and buys nothing.
     */
    async (files, { precompressed = false, skipEditor = false, format = null, maxEdge = null, replaces = null } = {}) => {
      if (!vendorId) {
        setErrors([t("اختر البائع أولاً", "Pick a seller first")]);
        return;
      }

      const list = Array.from(files).filter(isImage);
      if (!list.length) return;

      setErrors([]);

      /**
       * ── ONE photo opens the editor; a batch does not ────────────────────
       *
       * Nobody is going to crop twenty photos one at a time, and a dialog that
       * appears twenty times is a dialog that gets dismissed twenty times. So a
       * single pick — which is the cover shot, the one worth a minute — gets
       * the cropper, and a drag of several is compressed with the defaults and
       * sent straight through.
       *
       * SVG is passed through untouched either way: it is a vector, and a
       * canvas would rasterise away the one property it was chosen for.
       */
      /**
       * ── Every pick opens the editor, however many there are ─────────────
       *
       * One at a time, with the count shown, and "Apply to all" on the dialog
       * for the seller who wants the same size and format across the batch
       * without pressing Compress twenty times.
       *
       * SVG included: the dialog offers "keep vector" (uploaded byte for
       * byte) or rasterise to AVIF/WebP, which is what makes one croppable.
       *
       * `skipEditor` is still honoured — BackgroundStudio's output is a
       * decision the seller has already taken, and asking them to crop it
       * again would be a second dialog for the same choice.
       */
      if (!precompressed && !skipEditor) {
        openQueue(list);
        return;
      }

      setUploading((u) => [...u, ...list.map((f) => f.name)]);

      // Sequential, not Promise.all: a seller dragging 20 photos on a phone
      // connection would otherwise open 20 sockets and stall them all.
      for (const file of list) {
        try {
          /**
           * Shrunk here, before it crosses the network.
           *
           * The server re-encodes to AVIF regardless, so this is not what makes
           * the stored file small — it is what stops five megabytes per photo
           * being uploaded from a forecourt to produce sixty kilobytes. An SVG
           * is left alone, and a failure falls back to the original rather than
           * losing the seller's photo.
           */
          let toSend = file;
          if (!precompressed && !isSvg(file)) {
            try {
              const out = await compressImage(file, maxEdge ? { maxEdge } : {});
              if (out.bytes > MAX_STORED_BYTES) {
                setErrors((e) => [
                  ...e,
                  `${file.name}: ${t(
                    `حجم الملف كبير جداً (${formatBytes(out.bytes)} بعد الضغط، والحد ${formatBytes(MAX_STORED_BYTES)})`,
                    `File size is too high (${formatBytes(out.bytes)} after compression, limit ${formatBytes(MAX_STORED_BYTES)})`
                  )}`,
                ]);
                continue;
              }
              toSend = blobToFile(out.blob, file.name);
            } catch {
              // Compression is an optimisation, not a gate. The route still
              // converts, and still enforces the limit on what it stores.
            }
          }

          const body = new FormData();
          body.append("file", toSend);
          /* The seller's choice from the dialog. Omitted for a batch, where
             the route's own default (AVIF) applies. */
          if (format) body.append("format", format);
          body.append("vendorId", vendorId);
          body.append("kind", kind);
          if (listingId) body.append("listingId", listingId);
          // Dropped onto an open shelf, filed on that shelf. Anything else
          // means uploading and then moving every file by hand.
          if (folderId) body.append("folderId", folderId);
          /* An EDIT, not an addition. The route swaps every reference to the
             old picture over to this one and then deletes it, so a cleaned-up
             photo stays on the car it was already on instead of leaving the
             library holding both versions. */
          if (replaces) body.append("replaces", replaces);

          const res = await fetch("/api/marketplace/upload", { method: "POST", body });
          const json = await res.json();

          if (json?.ok && json.data?.asset) {
            addedHere.current.add(json.data.asset.id);
            setAssets((prev) => {
              /* The replaced row is gone server-side; drop it here too rather
                 than waiting for a reload, or the seller sees both versions
                 and cannot tell which one their cars are using. */
              const without = json.data.replaced
                ? prev.filter((a) => a.id !== json.data.replaced)
                : prev;
              return [json.data.asset, ...without];
            });
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

  /**
   * Delete ONE file. Never called straight from a button — `pendingDelete`
   * holds the set and the dialog calls this. A thumbnail grid is the easiest
   * place in the dashboard to hit the wrong 28px target, and the file may be
   * the only copy of a photo the seller paid someone to take.
   */
  const removeOne = async (asset) => {
    const res = await fetch(`/api/marketplace/upload?id=${asset.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => null);
    if (!json?.ok) {
      /* The STATUS and the code travel with the message. "Delete failed" on
         its own is unactionable — 401 (signed out), 404 (not yours, or already
         gone) and 500 (the delete itself broke) each need a different answer,
         and without them the only way to tell which happened is to go and read
         the server. */
      const detail = [json?.error?.code, `HTTP ${res.status}`].filter(Boolean).join(" ");
      const message = json?.error?.message ?? t("فشل الحذف", "Delete failed");
      throw new Error(`${message} (${detail})`);
    }

    setAssets((prev) => prev.filter((a) => a.id !== asset.id));
    setMarked((prev) => {
      if (!prev.has(asset.id)) return prev;
      const next = new Set(prev);
      next.delete(asset.id);
      return next;
    });
    if (isSelected(asset)) onSelect?.(selected.filter((s) => !same(s, asset)));
  };

  /**
   * Delete a whole set, ONE AT A TIME.
   *
   * Sequential rather than Promise.all: each delete also sweeps the storefront
   * columns that named the file (see the DELETE route), so forty at once is
   * forty storage calls and forty table scans fired together at a database the
   * rest of the dashboard is still reading from.
   *
   * A failure does not stop the run. If the eleventh file is shared catalog
   * artwork the seller does not own, the other thirty-nine are still theirs to
   * delete, and the dialog reports what was refused by name.
   */
  const removeMany = async (list) => {
    setBulk({ done: 0, total: list.length, verb: "delete" });
    const failed = [];

    for (let i = 0; i < list.length; i++) {
      const asset = list[i];
      setDeleting(asset.id);
      try {
        await removeOne(asset);
      } catch (err) {
        failed.push(`${asset.filename || asset.id}: ${err.message}`);
      }
      setBulk({ done: i + 1, total: list.length, verb: "delete" });
    }

    setDeleting(null);
    setBulk(null);
    setPendingDelete(null);
    if (failed.length) setErrors((e) => [...e, ...failed]);
    // Deleting also clears any storefront logo or cover that named these
    // files, so the pages showing them have to be re-rendered. Once for the
    // whole run, not once per file.
    mediaChanged().catch(() => {});
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
   *
   * `howTo` is an ARGUMENT, not state. It used to be a radio the seller armed
   * before picking a destination, which made one decision into two clicks and
   * left a mode set from last time with nothing on screen to say so. The menu
   * now names both — "Cut to", "Copy to" — and each destination row carries
   * its own answer.
   */
  const fileTo = async (asset, target, targetKind = null, howTo = "cut") => {
    setMoving(null);
    setFiling(asset.id);

    const res =
      howTo === "copy"
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

    if (howTo === "copy") {
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

  /* ── The ticked set ─────────────────────────────────────────────────────
     Only on the library page: in a picker the tile already means "pick this",
     and a second kind of tick on the same square would be two answers to one
     gesture.
     ------------------------------------------------------------------ */

  const canMark = mode === "manage";
  /**
   * Only the seller's OWN files can be ticked.
   *
   * Shared template artwork (vendor_id null) cannot be deleted or filed by
   * anyone — the server answers 404 or NOT_YOURS — so including it in a
   * selection can only produce a bar that promises "12 selected" and then
   * reports four failures. Select-all counts and acts on this list, not on
   * everything visible.
   */
  const selectable = visible.filter((a) => Boolean(a.vendor_id));
  const markedAssets = selectable.filter((a) => marked.has(a.id));
  const allMarked = selectable.length > 0 && markedAssets.length === selectable.length;

  const markToggle = (asset) =>
    setMarked((prev) => {
      const next = new Set(prev);
      if (next.has(asset.id)) next.delete(asset.id);
      else next.add(asset.id);
      return next;
    });

  /* Select-all covers what is ON SCREEN — this tab, this shelf — and not the
     whole library, which is the only reading that matches the checkbox the
     seller is looking at. */
  const markAll = () => setMarked(new Set(selectable.map((a) => a.id)));
  const markNone = () => setMarked(new Set());

  /**
   * Cut or copy a whole set.
   *
   * Sequential for the same reason deleting is: each copy duplicates a storage
   * object, and firing thirty of those at once is a burst the seller gets
   * nothing for. Failures are collected rather than thrown, so one shared file
   * in the middle does not strand the rest.
   */
  const fileMany = async (list, target, targetKind, howTo) => {
    setMoving(null);
    setBulk({ done: 0, total: list.length, verb: howTo });
    const failed = [];
    const copies = [];

    for (let i = 0; i < list.length; i++) {
      const asset = list[i];
      setFiling(asset.id);
      try {
        const res =
          howTo === "copy"
            ? await copyMediaToFolder(vendorId, asset.id, target, targetKind)
            : await moveMediaToFolder(vendorId, asset.id, target, targetKind);

        if (!res?.ok) {
          failed.push(
            res?.error === "NOT_YOURS"
              ? `${asset.filename || asset.id}: ${t("مشتركة ولا يمكن نقلها.", "shared, cannot be filed.")}`
              : `${asset.filename || asset.id}: ${t("تعذّر التنفيذ.", "that did not work.")}`
          );
        } else if (howTo === "copy") {
          addedHere.current.add(res.asset.id);
          copies.push(res.asset);
        } else {
          setAssets((prev) =>
            prev.map((a) =>
              a.id === asset.id
                ? { ...a, folder_id: res.folderId, kind: res.kind ?? a.kind }
                : a
            )
          );
        }
      } catch {
        failed.push(`${asset.filename || asset.id}: ${t("تعذّر التنفيذ.", "that did not work.")}`);
      }
      setBulk({ done: i + 1, total: list.length, verb: howTo });
    }

    /* The new rows go in together and at the front, where a just-uploaded file
       goes — one repaint rather than one per copy. */
    if (copies.length) setAssets((prev) => [...copies, ...prev]);

    setFiling(null);
    setBulk(null);
    /* A cut empties the current view of everything that moved, so the ticks
       have nothing left to point at. A copy leaves the originals where they
       are, and keeping them ticked lets the seller file the same set twice. */
    if (howTo === "cut") markNone();
    if (failed.length) setErrors((e) => [...e, ...failed]);
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
          /* Spelled out rather than "image/*": a native file dialog does
             not reliably offer SVG under the wildcard, so a seller looking for
             their logo simply could not see it. The list matches ALLOWED in
             the upload route, and `.svg` is there for the dialogs that filter
             on extension instead of type. */
          accept="image/jpeg,image/png,image/webp,image/avif,image/svg+xml,.svg"
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

      {/* ── Bulk bar ───────────────────────────────────────────────────────
          Appears only once something is ticked, so the library page is not
          carrying a toolbar for an action nobody has started. Sticky, because
          the set being built can be longer than the screen and a bar that
          scrolls away takes the count and the buttons with it.
          --------------------------------------------------------------- */}
      {canMark && canManage && marked.size > 0 ? (
        <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-brand-primary/30 bg-white/95 p-2 shadow-sm backdrop-blur dark:border-brand-primary/40 dark:bg-[#141414]/95">
          <span className="ps-1 text-sm font-medium tabular-nums text-brand-primary">
            {markedAssets.length} {t("محدد", "selected")}
          </span>

          <button
            type="button"
            onClick={allMarked ? markNone : markAll}
            className="rounded-lg px-2 py-1 text-xs text-gray-600 underline-offset-2 hover:underline dark:text-gray-300"
          >
            {allMarked
              ? t("إلغاء تحديد الكل", "Clear")
              : t(`تحديد الكل (${selectable.length})`, `Select all (${selectable.length})`)}
          </button>

          <div className="ms-auto flex flex-wrap items-center gap-2">
            {/* Cut and copy are SEPARATE buttons here, not a mode you arm
                first as on the tile menu. On one picture the mode is a
                property of the next click; on a set the seller has already
                decided, and making them set a radio before picking a shelf is
                a step that buys nothing. */}
            {["cut", "copy"].map((howTo) => (
              <DropdownMenu key={howTo}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={!!bulk}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-white/5"
                  >
                    {howTo === "cut" ? <Scissors className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {howTo === "cut" ? t("قص", "Cut") : t("نسخ", "Copy")}
                  </button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" dir={isAr ? "rtl" : "ltr"} className="w-56">
                  <DropdownMenuLabel className="py-1 text-[11px] font-medium text-muted-foreground">
                    {howTo === "cut"
                      ? t(`نقل ${markedAssets.length} إلى`, `Move ${markedAssets.length} to`)
                      : t(`نسخ ${markedAssets.length} إلى`, `Copy ${markedAssets.length} to`)}
                  </DropdownMenuLabel>

                  {KINDS.map((k) => {
                    /* Cutting to where they already all are moves nothing. */
                    const here = !folderId && kind === k.value;
                    return (
                      <DropdownMenuItem
                        key={k.value}
                        className="text-xs"
                        disabled={howTo === "cut" && here}
                        onSelect={() => fileMany(markedAssets, null, k.value, howTo)}
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
                    const here = folderId === f.id;
                    return (
                      <DropdownMenuItem
                        key={f.id}
                        className="text-xs"
                        disabled={howTo === "cut" && here}
                        onSelect={() => fileMany(markedAssets, f.id, null, howTo)}
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
            ))}

            <button
              type="button"
              disabled={!!bulk}
              onClick={() => setPendingDelete({ assets: markedAssets })}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:hover:bg-red-950/40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("حذف", "Delete")}
            </button>

            <button
              type="button"
              onClick={markNone}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-white/5"
              aria-label={t("إلغاء التحديد", "Clear selection")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Forty files is forty round trips, so the bar says where it is
              rather than just disabling itself. */}
          {bulk ? (
            <div className="flex w-full items-center gap-2 border-t border-gray-100 pt-2 text-xs text-gray-600 dark:border-gray-800 dark:text-gray-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-primary" />
              <span className="tabular-nums">
                {bulk.done} / {bulk.total}
              </span>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                <div
                  className="h-full rounded-full bg-brand-primary transition-[width]"
                  style={{ width: `${bulk.total ? (bulk.done / bulk.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          ) : null}
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
        /* More columns on a wide screen, now that the picker dialog is one.
           At six, a library of eighty photos was a long scroll through mostly
           empty rows. */
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
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
            /**
             * Shared template artwork, and why it gets no buttons.
             *
             * A file with no vendor of its own belongs to everyone who
             * installed the template that brought it, so the server refuses
             * to delete it (404 NOT_FOUND) or to file it (NOT_YOURS). The
             * gallery already SAID this in a comment, but it gated the
             * buttons on `canManage` — which asks whether this gallery may
             * change the library at all, not whether this particular file is
             * the seller's. So every shared logo still had a delete button,
             * and pressing it could only ever produce "Not found".
             *
             * Forty-six of them sit in the library behind the template
             * catalog, which is why this looked like "delete is broken"
             * rather than like one unusual file.
             */
            const ownFile = Boolean(asset.vendor_id);
            const canEditAsset = canManage && ownFile;

            return (
              /* Two boxes, not one: the square CROPS its thumbnail, and a
                 clipping box cannot also hold a dropdown — the folder menu
                 was being cut off at the tile's edge. The outer box does the
                 positioning, the inner one does the cropping. */
              <div key={asset.id} className="group relative">
                <div
                  className={`aspect-square overflow-hidden rounded-lg border-2 transition-colors ${
                    marked.has(asset.id)
                      ? "border-brand-primary ring-2 ring-brand-primary/30"
                      : picked
                        ? "border-brand-primary"
                        : "border-gray-200 dark:border-gray-700"
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
                    <Img
                      src={asset.url}
            width={240}
            height={180}
                      alt={asset.alt_en || asset.filename || ""}
                      className="h-full w-full bg-gray-50 object-cover dark:bg-[#141414]"
                      loading="lazy"
                    />
                  </button>
                </div>

                {/* ── What this file WEIGHS ──────────────────────────────
                    Along the bottom edge, where it never covers the subject.

                    A seller cannot otherwise tell a 48 KB AVIF from a 5 MB
                    JPEG — they look identical in a 240px tile — and the whole
                    point of the upload pipeline is invisible without it. It is
                    also how an old, heavy library becomes visible: anything
                    uploaded before the conversion existed still reads in
                    megabytes here.

                    size_bytes is null on rows written before the route
                    recorded it, so the badge is skipped rather than printing
                    a confident "0 B" about a file nobody measured. */}
                {asset.size_bytes ? (
                  <span
                    className="pointer-events-none absolute inset-x-1.5 bottom-1.5 flex items-center justify-between gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-medium text-white"
                    title={[
                      formatBytes(asset.size_bytes),
                      asset.width && asset.height ? `${asset.width}×${asset.height}` : null,
                      asset.mime_type,
                    ].filter(Boolean).join(" · ")}
                  >
                    <span className="font-mono">{formatBytes(asset.size_bytes)}</span>
                    {asset.mime_type ? (
                      <span className="opacity-75">
                        {String(asset.mime_type).split("/")[1]?.replace("svg+xml", "svg").toUpperCase()}
                      </span>
                    ) : null}
                  </span>
                ) : null}

                {/* The first pick is the main photo — say so, don't make them guess. */}
                {picked ? (
                  <span className="raised-solid absolute inset-s-1.5 top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-brand-primary px-1.5 text-[11px] font-bold text-white">
                    {order === 1 ? <Check className="h-3.5 w-3.5" /> : order}
                  </span>
                ) : null}

                {/* ── The tick ───────────────────────────────────────────
                    Leading edge, opposite the action column, so selecting is
                    never a mis-aimed delete. Unlike those buttons it STAYS
                    visible once anything is ticked — a checkbox that fades out
                    on mouse-leave hides the count it is building.
                    ------------------------------------------------- */}
                {canMark && canEditAsset ? (
                  <button
                    type="button"
                    onClick={() => markToggle(asset)}
                    aria-pressed={marked.has(asset.id)}
                    aria-label={
                      marked.has(asset.id)
                        ? t("إلغاء التحديد", "Deselect")
                        : t("تحديد", "Select")
                    }
                    className={`absolute inset-s-1.5 top-1.5 z-10 flex h-7 w-7 items-center justify-center rounded-md bg-white/90 shadow-sm transition-opacity hover:bg-white dark:bg-black/70 ${
                      marked.size || marked.has(asset.id)
                        ? "opacity-100"
                        : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                    }`}
                  >
                    {marked.has(asset.id) ? (
                      <CheckSquare className="h-4 w-4 text-brand-primary" />
                    ) : (
                      <Square className="h-4 w-4 text-neutral-500 dark:text-neutral-300" />
                    )}
                  </button>
                ) : canMark && canManage ? (
                  /* Says WHY this one has no controls. A tile that is simply
                     missing the buttons its neighbours have reads as a bug,
                     and the seller's next move is to report that delete is
                     broken — which is exactly what happened. */
                  <span
                    title={t(
                      "ملف مشترك من قالب — لا يمكن حذفه أو نقله.",
                      "Shared template file — it cannot be deleted or moved."
                    )}
                    className="absolute inset-s-1.5 top-1.5 z-10 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white"
                  >
                    {t("مشترك", "shared")}
                  </span>
                ) : null}

                {/* ── Per-tile controls: ONE button ──────────────────────
                    Everything a tile can do now lives behind the three dots,
                    for two reasons.

                    The row of icons never fit. Four 28px buttons stacked are
                    124px, taller than the tile itself once the grid reaches
                    three or four columns, so the delete hung outside it; laid
                    out 2x2 they fit but covered a 60x60 corner of a ~100px
                    picture, which is most of the subject on a phone. One
                    button is 28px and always fits.

                    And an icon is a guess. Scissors, a folder with an arrow
                    and a spark are not self-evident, so the actions that
                    matter most — the one that deletes, the one that moves —
                    were the ones a seller had to hover and read a tooltip to
                    identify. In the menu they are words.
                    ------------------------------------------------- */}
                <div className="absolute inset-e-1.5 top-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                  <DropdownMenu
                    modal={false}
                    open={moving === asset.id}
                    onOpenChange={(v) => setMoving(v ? asset.id : null)}
                  >
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow-sm transition-colors hover:bg-white dark:bg-black/70"
                        aria-label={t("خيارات", "Options")}
                        title={t("خيارات", "Options")}
                      >
                        <MoreVertical className="h-3.5 w-3.5 text-neutral-700 dark:text-white" />
                      </button>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent align="end" dir={isAr ? "rtl" : "ltr"} className="w-52">
                      <DropdownMenuItem className="text-xs" onSelect={() => openPreview(asset)}>
                        <Eye className="h-3.5 w-3.5" />
                        {t("معاينة", "Preview")}
                      </DropdownMenuItem>

                      {/* Offered only on photographs. An icon or a logo has a
                          transparent background already, and a document has a
                          background that IS the content — running a salient
                          object detector over a service book would cut the
                          page out of the page. */}
                      {canEditAsset && asset.kind === "photo" ? (
                        <DropdownMenuItem className="text-xs" onSelect={() => setStudioAsset(asset)}>
                          <Sparkles className="h-3.5 w-3.5 text-brand-primary" />
                          {t("تنظيف الخلفية", "Clean up background")}
                        </DropdownMenuItem>
                      ) : null}

                      {/* Shared template artwork has no vendor of its own and
                          belongs to everyone who installed the template, so it
                          cannot be filed or deleted from here — hence
                          canEditAsset rather than canManage. Offering the rows
                          and letting the server say no is not a safeguard, it
                          is a dead control. */}
                      {canEditAsset ? (
                        <>
                          <DropdownMenuSeparator />

                          {/* Cut and copy are SEPARATE submenus rather than a
                              mode armed before a destination, which is what
                              the old flyout did. Arming a radio and then
                              choosing a shelf is one decision expressed as
                              two clicks, and nothing on screen reminded the
                              seller which mode was still set from last time. */}
                          {["cut", "copy"].map((howTo) => (
                            <DropdownMenuSub key={howTo}>
                              <DropdownMenuSubTrigger className="text-xs">
                                {howTo === "cut" ? (
                                  <Scissors className="h-3.5 w-3.5" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                                {howTo === "cut" ? t("قص إلى", "Cut to") : t("نسخ إلى", "Copy to")}
                              </DropdownMenuSubTrigger>

                              <DropdownMenuSubContent className="w-48">
                                {/* The three built-in tabs are destinations
                                    like any shelf. A picture uploaded on the
                                    wrong tab used to be stuck as the wrong
                                    kind — a logo filed under Photos was
                                    invisible to every logo picker, and the
                                    only cure was deleting a file a car might
                                    already be using and uploading it again. */}
                                {KINDS.map((k) => {
                                  /* Cutting a picture to where it already is
                                     moves it nowhere, so that row is disabled
                                     — and a greyed row with nothing to explain
                                     it just reads as broken. The tick says
                                     which row it is and why. Copy leaves them
                                     all live: copying into the same place is a
                                     real duplicate. */
                                  const here = !asset.folder_id && asset.kind === k.value;
                                  return (
                                    <DropdownMenuItem
                                      key={k.value}
                                      className="text-xs"
                                      disabled={howTo === "cut" && here}
                                      onSelect={() => fileTo(asset, null, k.value, howTo)}
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
                                      disabled={howTo === "cut" && here}
                                      onSelect={() => fileTo(asset, f.id, null, howTo)}
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
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                          ))}

                          <DropdownMenuSeparator />

                          <DropdownMenuItem
                            className="text-xs text-red-600 focus:text-red-600"
                            disabled={deleting === asset.id}
                            /* Asks first. The file behind this row may be the
                               only copy of a photo somebody was paid to take. */
                            onSelect={() => setPendingDelete({ assets: [asset] })}
                          >
                            {deleting === asset.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                            {t("حذف", "Delete")}
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
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
        <DialogContent
          dir={isAr ? "rtl" : "ltr"}
          className="flex max-h-[92vh] flex-col sm:max-w-5xl"
          /* Same rule as the picker: dismissed on purpose, never by missing. */
          onInteractOutside={(e) => e.preventDefault()}
        >
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

                <Img
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

      {/* The result goes through the SAME upload() the drop zone uses, so it
          lands in the folder that is currently open, under the same kind, and
          appears in the grid by the path everything else already takes. The
          original is not touched — this adds a photo, it does not replace
          one. */}
      <BackgroundStudio
        /* Keyed on the photo: a different asset mounts a different dialog,
           which is what resets the preview, the error and the progress
           without an effect clearing three fields by hand. */
        key={studioAsset?.id ?? "none"}
        asset={studioAsset}
        open={!!studioAsset}
        onOpenChange={(next) => { if (!next) setStudioAsset(null); }}
        /* skipEditor: asking somebody to crop a cutout they have just made is
           a second dialog for a decision they already took. It is still
           compressed on the way out like everything else. */
        /* replaces: this is an EDIT of that picture, not a new one. */
        onSave={(file) => upload([file], { skipEditor: true, replaces: studioAsset?.id })}
        locale={locale}
      />

      {/* ── Crop, resize and compress, before anything is uploaded ─────────
          Mounted only while a file is being edited, so the cropper chunk is
          fetched on first use and never on a dashboard nobody uploads from.
          The result goes through the SAME upload() as everything else, with
          `precompressed` set so it is not encoded a second time. */}
      {editing ? (
        <ImageEditorDialog
          /* Keyed on the CURRENT file, so moving along the strip mounts a
             fresh editor. Without it the crop, zoom and compressed result of
             the previous photo would still be in state, described as
             belonging to this one. The strip itself is driven by props, so
             remounting costs nothing — the thumbnails live above. */
          key={`${current}-${editing.name}-${editing.size}`}
          file={editing}
          locale={locale}
          maxBytes={MAX_STORED_BYTES}
          files={queue}
          thumbs={thumbs}
          index={current}
          doneIdx={doneIdx}
          doneInfo={doneInfo}
          /* The WHOLE map, not just this photo's entry: the dialog has to be
             able to say "all four are compressed" before it enables Upload,
             and to compress the other three on one press. */
          edits={edits}
          onEditChangeAt={patchEdit}
          onUploadAll={() => {
            /* Every queued photo at once, in the queue's own order so the
               first picked stays the cover. Each was compressed with its own
               settings, so they are uploaded as-is — no second encode. */
            const ready = queue
              .map((f, i) => ({ f, i, e: edits[i] }))
              .filter(({ i, e }) => e?.result?.blob && !doneIdx.includes(i));

            if (!ready.length) return;

            for (const { f, e } of ready) {
              const fmt = e.format ?? "avif";
              upload(
                [blobToFile(e.result.blob, f.name, fmt === "svg" ? "svg" : null)],
                { precompressed: true, format: fmt }
              );
            }
            closeQueue();
          }}
          onJump={(i) => setCurrent(i)}
          onCancel={closeQueue}
          onSkip={() => advanceFrom(current, doneIdx)}
          /* ONE photo. A batch leaves by onUploadAll instead, which is why
             there is no "apply to the rest" branch here any more: with the
             queue uploaded in one press, there is no "rest" left to apply
             anything to. Settings are propagated by the dialog's own
             "Apply size & format to the rest" button, before compressing. */
          onConfirm={(result) => {
            /* The extension follows the FORMAT the seller picked, so a kept
               vector stays `logo.svg` and a rasterised one becomes
               `logo.webp` — the route reads the type from the bytes either
               way, but a name that lies is a name somebody later trusts. */
            const file = blobToFile(result.blob, editing.name, result.format === "svg" ? "svg" : null);

            const nextDone = [...doneIdx, current];
            setDoneIdx(nextDone);
            setDoneInfo((prev) => ({
              ...prev,
              [current]: { bytes: result.bytes, format: result.format },
            }));

            upload([file], { precompressed: true, format: result.format });
            advanceFrom(current, nextDone);
          }}
        />
      ) : null}

      {/* ── "Are you sure?" ────────────────────────────────────────────────
          One dialog for one file and for forty — the question is the same and
          only the count changes, and two dialogs saying nearly the same thing
          is how one of them drifts.

          It SHOWS the pictures rather than naming them. A seller recognises a
          photograph instantly and a filename like
          `jetour-t2-2026-black-exterior-photo-20260928-cb573a.jpg` not at all,
          so a list of names cannot actually answer "is this the right one?".

          Deliberately blunt about reach: deleting here also clears the
          storefront logo or cover that named the file, which is not something
          to discover afterwards.
          --------------------------------------------------------------- */}
      <Dialog
        open={Boolean(pendingDelete)}
        /* While a run is going there is nothing to cancel — the files already
           gone are gone — so the dialog holds until it finishes. */
        onOpenChange={(v) => { if (!v && !bulk) setPendingDelete(null); }}
      >
        <DialogContent
          dir={isAr ? "rtl" : "ltr"}
          className="sm:max-w-md"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-start text-base text-red-600">
              {pendingDelete?.assets?.length === 1
                ? t("حذف هذا الملف؟", "Delete this file?")
                : t(`حذف ${pendingDelete?.assets?.length ?? 0} ملفات؟`, `Delete ${pendingDelete?.assets?.length ?? 0} files?`)}
            </DialogTitle>
          </DialogHeader>

          {pendingDelete ? (
            <>
              {/* Up to twelve thumbnails, then a count. A wall of sixty
                  pushes the buttons off a laptop screen, and past a dozen
                  nobody is checking them one by one anyway. */}
              <div className="flex flex-wrap gap-1.5">
                {pendingDelete.assets.slice(0, 12).map((a) => (
                  <Img
                    key={a.id}
                    src={thumbUrl(a.url, THUMB.grid)}
                    width={56}
                    height={56}
                    alt={a.filename || ""}
                    className="h-14 w-14 rounded-md border border-gray-200 bg-gray-50 object-cover dark:border-gray-700 dark:bg-[#141414]"
                  />
                ))}
                {pendingDelete.assets.length > 12 ? (
                  <span className="flex h-14 w-14 items-center justify-center rounded-md border border-dashed border-gray-300 text-xs tabular-nums text-gray-500 dark:border-gray-600">
                    +{pendingDelete.assets.length - 12}
                  </span>
                ) : null}
              </div>

              {pendingDelete.assets.length === 1 ? (
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                  {pendingDelete.assets[0].filename}
                </p>
              ) : null}

              <p className="text-sm text-gray-600 dark:text-gray-300">
                {t(
                  "لا يمكن التراجع. سيُزال الملف أيضاً من أي شعار أو غلاف يستخدمه.",
                  "This cannot be undone. The file is also cleared from any storefront logo or cover using it."
                )}
              </p>

              {bulk ? (
                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-red-600" />
                  <span className="tabular-nums">{bulk.done} / {bulk.total}</span>
                </div>
              ) : null}

              <DialogFooter className="gap-2 sm:gap-2">
                <button
                  type="button"
                  disabled={!!bulk}
                  onClick={() => setPendingDelete(null)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-white/5"
                >
                  {t("إلغاء", "Cancel")}
                </button>
                <button
                  type="button"
                  disabled={!!bulk}
                  onClick={() => removeMany(pendingDelete.assets)}
                  className="flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60"
                >
                  {bulk ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  {pendingDelete.assets.length === 1
                    ? t("حذف", "Delete")
                    : t(`حذف ${pendingDelete.assets.length}`, `Delete ${pendingDelete.assets.length}`)}
                </button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
