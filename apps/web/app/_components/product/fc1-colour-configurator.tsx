"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { translator, type Locale } from "../../_lib/i18n";
import { fc1Photos } from "./fc1-photos";
import styles from "./fc1-product.module.css";
import { Fc1ThreeDViewer } from "./fc1-three-d-viewer";
import {addCartLine} from "../../_lib/commerce/storefront-cart";
import { Fc1TestRide } from "./fc1-test-ride";

type ColourId = "sample" | "black" | "blue" | "silver";
type ModelId = "standard" | "pro";

// Deploy the verified FC1 GLB at this static path, or set the public R2 URL at build time.
// Until it exists, the selector remains photo-only: a 2D image is never presented as real 3D.
const FC1_MODEL_URL = process.env.NEXT_PUBLIC_FC1_3D_MODEL_URL?.trim() || "/products/fc1/ALSVID_FC1_unfolded_review_v10.glb";

const COLOURS: {id: ColourId; key: string; hex: string; available: boolean}[] = [
  { id: "sample", key: "fc1.colours.sample", hex: "#2d5850", available: true },
  { id: "black", key: "fc1.colours.black", hex: "#262a2d", available: false },
  { id: "blue", key: "fc1.colours.blue", hex: "#2a4f6b", available: false },
  { id: "silver", key: "fc1.colours.silver", hex: "#b7c2c8", available: false },
];

const COPY = {
  zh: {
    modelUnavailable: "规划版本 · 待确认",
    sample: "样车展示",
    proposal: "颜色提案 · 待确认",
    choose: "选择你喜欢的颜色",
    interest: "颜色仅用于外观参考，不代表现货或量产色号。",
    preferenceSave: "保存我的颜色偏好",
    preferenceSaving: "正在保存…",
    preferenceSaved: "已保存匿名颜色偏好（不是订单）",
    preferenceFailed: "保存失败，请重试",
    preferenceNote: "仅点击保存时才记录本次浏览会话的车型与颜色，不收集姓名或邮箱。",
    title: "选择你的 A1 Ultra",
    fineprint: "颜色为基于绿色实拍车的模拟效果，量产色号与可售状态以正式公布为准。",
    summary: "当前预览",
    delivery: "计划从中国发往德国，预计交付 4–6 周；具体时间待物流确认。当前仅收集邮件预约意向。",
    noPayment: "邮件仅用于表达预约意向，不代表订单成立，也不会产生付款。",
    preview: "颜色效果模拟 · 非量产实拍",
    standard: "参考配置",
    photoMode: "实拍",
    threeDMode: "3D 查看",
    threeDLoading: "正在载入三维模型…",
    threeDNote: "3D 为外观核对模型，部分结构尚未实物验收；以真实车辆图片为准。拖动旋转，双指缩放。",
  },
  en: {
    modelUnavailable: "Planned · unconfirmed",
    sample: "Reference sample",
    proposal: "Colour proposal · unconfirmed",
    choose: "Choose your favourite colour",
    interest: "Colours are appearance proposals, not confirmed stock or production finishes.",
    preferenceSave: "Save my colour preference",
    preferenceSaving: "Saving…",
    preferenceSaved: "Anonymous preference saved (not an order)",
    preferenceFailed: "Could not save. Please retry.",
    preferenceNote: "Only clicking Save records the model and colour for this browser session, without name or email.",
    title: "Make your A1 Ultra yours",
    fineprint: "Colours are simulations based on the genuine green sample. Final finishes and availability are not confirmed.",
    summary: "Your preview",
    delivery: "Shipping from China to Germany is planned, with an estimated 4–6 week delivery window subject to logistics confirmation. At this stage, only email reservation enquiries are accepted.",
    noPayment: "The email expresses interest only; it does not create an order or trigger payment.",
    preview: "Simulated colour · not a production photo",
    standard: "Reference specification",
    photoMode: "Photo",
    threeDMode: "3D view",
    threeDLoading: "Loading the 3D model…",
    threeDNote: "This is an appearance review model, not verified production geometry. Refer to actual bike photography. Drag to rotate or pinch to zoom.",
  },
  de: {
    modelUnavailable: "In Planung · noch offen",
    sample: "Referenzmuster",
    proposal: "Farbvorschlag · noch offen",
    choose: "Wähle deine Lieblingsfarbe",
    interest: "Farben sind Designvorschläge, keine bestätigten Serienfarben oder Lagerbestände.",
    preferenceSave: "Farbwunsch speichern",
    preferenceSaving: "Wird gespeichert…",
    preferenceSaved: "Anonymer Farbwunsch gespeichert (keine Bestellung)",
    preferenceFailed: "Speichern fehlgeschlagen. Bitte erneut versuchen.",
    preferenceNote: "Nur beim Speichern werden Modell und Farbe für diese Browsersitzung erfasst, ohne Namen oder E-Mail.",
    title: "Gestalte dein A1 Ultra",
    fineprint: "Farbansichten sind Simulationen des echten grünen Musters. Serienfarben und Verfügbarkeit sind noch nicht bestätigt.",
    summary: "Deine Vorschau",
    delivery: "Der Versand aus China nach Deutschland ist mit einer geschätzten Lieferzeit von 4–6 Wochen geplant; die Logistik muss dies noch bestätigen. Derzeit sind nur Reservierungsanfragen per E-Mail vorgesehen.",
    noPayment: "Die E-Mail bekundet nur Interesse; sie begründet keine Bestellung und löst keine Zahlung aus.",
    preview: "Farb-Simulation · kein Serienfoto",
    standard: "Referenzkonfiguration",
    photoMode: "Foto",
    threeDMode: "3D-Ansicht",
    threeDLoading: "3D-Modell wird geladen…",
    threeDNote: "Dieses Anschauungsmodell ist keine geprüfte Seriengeometrie. Maßgeblich sind die echten Fahrzeugfotos. Drehen durch Ziehen, zoomen mit zwei Fingern.",
  },
} satisfies Record<Locale, Record<string, string>>;

/** Pixel-level recolour of the genuine green sample; avoids tinting tyres, metal, saddle and background.
 * This is a preference preview, never a claim that a factory colour exists.
 */
function recolourPixels(base: ImageData, colour: Exclude<ColourId, "sample">): ImageData {
  const bytes = new Uint8ClampedArray(base.data);
  const target = {
    black: [31, 35, 38],
    blue: [27, 69, 105],
    silver: [164, 179, 185],
  }[colour];
  for (let i = 0; i < bytes.length; i += 4) {
    if (bytes[i + 3]! < 12) continue;
    const r = bytes[i]!, g = bytes[i + 1]!, b = bytes[i + 2]!;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const range = max - min;
    if (range < 10 || max < 19) continue;
    // Green / teal paint only. Black tyres and warm saddle colours are preserved.
    let hue = 0;
    if (max === r) hue = ((g - b) / range) % 6;
    else if (max === g) hue = (b - r) / range + 2;
    else hue = (r - g) / range + 4;
    hue = (hue * 60 + 360) % 360;
    const saturation = range / max;
    if (hue < 70 || hue > 195 || saturation < .11) continue;
    const edge = Math.min(1, (hue - 70) / 18, (195 - hue) / 18, (saturation - .11) / .14);
    const strength = Math.max(0, Math.min(.97, edge * .97));
    const light = (r * .22 + g * .67 + b * .11);
    const scale = Math.max(.43, Math.min(1.42, (light + 39) / 117));
    bytes[i] = Math.round(r * (1 - strength) + target[0]! * scale * strength);
    bytes[i + 1] = Math.round(g * (1 - strength) + target[1]! * scale * strength);
    bytes[i + 2] = Math.round(b * (1 - strength) + target[2]! * scale * strength);
  }
  return new ImageData(bytes, base.width, base.height);
}

function ColourBike({ locale, colour, modelUrl, onModelFailure }: { locale: Locale; colour: ColourId; modelUrl: string | null; onModelFailure: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<ImageData | null>(null);
  const [ready, setReady] = useState(0);
  const [drawn, setDrawn] = useState<ColourId>("sample");
  const copy = COPY[locale];

  useEffect(() => {
    const picture = new Image();
    let live = true;
    picture.onload = () => {
      if (!live) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = picture.naturalWidth;
      canvas.height = picture.naturalHeight;
      const ctx = canvas.getContext("2d", {willReadFrequently: true});
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(picture, 0, 0);
      try {
        baseRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);
        setReady(value => value + 1);
      } catch { /* Genuine photo remains visible when canvas is restricted. */ }
    };
    picture.src = fc1Photos.side.src;
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!ready || !baseRef.current || colour === "sample") {
      setDrawn("sample");
      return;
    }
    const ctx = canvasRef.current?.getContext("2d", {willReadFrequently: true});
    if (!ctx) return;
    ctx.putImageData(recolourPixels(baseRef.current, colour), 0, 0);
    setDrawn(colour);
  }, [colour, ready]);

  return <div className={styles.interestBikeStage} data-3d-active={Boolean(modelUrl)}>
    <img {...fc1Photos.side} className={styles.interestOriginalBike} alt={translator(locale)("fc1.photo.alt")} fetchPriority="high" />
    <canvas ref={canvasRef} className={styles.interestColourCanvas} data-visible={colour !== "sample" && drawn === colour} aria-hidden="true" />
    {modelUrl ? <Fc1ThreeDViewer
      url={modelUrl}
      colour={colour}
      alt={translator(locale)("fc1.photo.alt")}
      note={copy.threeDNote}
      loadingText={copy.threeDLoading}
      onFailure={onModelFailure}
    /> : <p className={styles.interestPreviewLabel}>{copy.preview}</p>}
  </div>;
}

export function Fc1ColourConfigurator({locale}: {locale: Locale}) {
  const t = translator(locale);
  const copy = COPY[locale];
  const [model, setModel] = useState<ModelId>("standard");
  const [expandedModel, setExpandedModel] = useState<ModelId | null>(null);
  const [colour, setColour] = useState<ColourId>("sample");
  const [modelAvailable, setModelAvailable] = useState(false);
  const [visualMode, setVisualMode] = useState<"photo" | "3d">("photo");
  const [email, setEmail] = useState("");
  const [reservationState, setReservationState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [cartStatus,setCartStatus]=useState<"idle"|"added"|"failed">("idle");
  const [preferenceStatus,setPreferenceStatus]=useState<"idle"|"saving"|"saved"|"failed">("idle");

  const onModelFailure = useCallback(() => {
    setVisualMode("photo");
    setModelAvailable(false);
  }, []);

  useEffect(() => {
    // HEAD avoids fetching the 35 MB GLB until the user actually opens 3D.
    // Reject Next.js HTML fallbacks and misconfigured R2 URLs.
    const controller = new AbortController();
    fetch(FC1_MODEL_URL, { method:"HEAD", signal:controller.signal, cache:"no-store" })
      .then(response => {
        const mime = response.headers.get("content-type") || "";
        if (response.ok && !mime.includes("text/html") && !mime.includes("application/json")) {
          setModelAvailable(true);
        }
      })
      .catch(() => { /* Static photography remains available. */ });
    return () => controller.abort();
  }, []);
  const current = COLOURS.find(item => item.id === colour) ?? COLOURS[0]!;
  const reservationEmail = process.env.NEXT_PUBLIC_FC1_RESERVATION_EMAIL?.trim() ?? "";
  const reservationEmailConfigured = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reservationEmail);
  const modelLabel = model === "standard" ? "A1 Ultra Standard" : "A1 Ultra Pro";
  const colourLabel = t(current.key as "fc1.colours.sample");
  const submitReservation = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setReservationState("sending"); try { const response = await fetch("/api/public/fc1-reservation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, model: modelLabel, colour: colourLabel, locale }) }); if (!response.ok) throw new Error("send failed"); setReservationState("sent"); } catch { setReservationState("failed"); } };

  // Browsing colours remains local. Persist a pseudonymous preference only after a separate opt-in click.
  const saveColourPreference = async () => {
    setPreferenceStatus("saving");
    try {
      const storageKey = "alsvid-a1-ultra-colour-preference-session";
      const sessionKey = window.sessionStorage.getItem(storageKey) ?? window.crypto.randomUUID();
      window.sessionStorage.setItem(storageKey, sessionKey);
      const response = await fetch("/api/public/fc1-colour-interest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({productCode:"A1-ULTRA",sessionKey,modelCode:model,colourCode:colour,locale}),
      });
      if (!response.ok) throw new Error("Preference was not saved");
      setPreferenceStatus("saved");
    } catch {
      setPreferenceStatus("failed");
    }
  };
  const chooseColour = (next: ColourId) => {setColour(next);setCartStatus("idle");setPreferenceStatus("idle");};
  const chooseModel = (next: ModelId) => {
    setModel(next);
    setCartStatus("idle");
    setPreferenceStatus("idle");
    setExpandedModel(previous => previous === next ? null : next);
  };
  return <div id="configure" className={styles.interestConfigurator}>
    <div className={styles.interestVisual}>
      <div className={styles.interestIntro}>
        <span>FOLDING CARBON / ALSVID</span>
        <h1>ALSVID A1 Ultra</h1>
        <p>{t("fc1.heading")}</p>
      </div>
      <div className={styles.interestViewModes} role="group" aria-label={copy.threeDMode}>
        <button type="button" aria-pressed={visualMode === "photo"} onClick={() => setVisualMode("photo")}>{copy.photoMode}</button>
        {modelAvailable ? <button type="button" aria-pressed={visualMode === "3d"} onClick={() => setVisualMode("3d")}>{copy.threeDMode}</button> : null}
      </div>
      <ColourBike locale={locale} colour={colour} modelUrl={modelAvailable && visualMode === "3d" ? FC1_MODEL_URL : null} onModelFailure={onModelFailure}/>
      <div className={styles.interestVisualFooter}><span>{visualMode === "3d" ? copy.threeDMode : copy.preview}</span><span>A1 Ultra / {current.key ? t(current.key as "fc1.colours.sample") : ""}</span></div>
    </div>
    <aside className={styles.interestControls} aria-label={copy.title}>
      <div className={styles.interestControlsHeading}><span>ALSVID A1 Ultra / CONFIGURE</span><h2>{copy.title}</h2><p>{t("fc1.intro")}</p></div>
      <fieldset className={styles.interestFieldset}>
        <legend>{t("fc1.selection.model")}</legend>
        <div className={styles.interestModels}>
          {(["standard","pro"] as const).map(item=><button type="button" key={item} aria-pressed={model===item} aria-expanded={expandedModel===item} aria-controls="fc1-model-details" onClick={()=>chooseModel(item)}>
            <strong>A1 Ultra {item==="standard"?"Standard":"Pro"}</strong>
            <small>{item==="standard"?copy.standard:copy.modelUnavailable}</small>
          </button>)}
        </div>
        <div
          id="fc1-model-details"
          className={styles.interestModelDetail}
          role="region"
          aria-label={expandedModel === "pro" ? t("fc1.selection.pro_status") : t("fc1.highlights")}
          hidden={expandedModel === null}
        >
          {expandedModel === "standard" ? (
            <>
              <div className={styles.interestSpecs} aria-label={t("fc1.highlights")}>
                <div><strong>40 <small>cm</small></strong><span>{t("fc1.metric.step")}</span></div>
                <div><strong>85 × 69 × 48 <small>cm</small></strong><span>{t("fc1.metric.folded")}</span></div>
                <div><strong>{new Intl.NumberFormat(locale,{minimumFractionDigits:1,maximumFractionDigits:1}).format(15.5)} <small>kg</small></strong><span>{t("fc1.metric.weight")}</span></div>
                <div><strong>80 <small>km¹</small></strong><span>{t("fc1.metric.range")}</span></div>
              </div>
              <p className={styles.interestModelNote}>{t("fc1.selection.model_note")}</p>
            </>
          ) : expandedModel === "pro" ? (
            <>
              <p className={styles.interestModelNote}>{t("fc1.selection.pro_status")}</p>
              <p className={styles.interestModelNote}>{t("fc1.selection.model_note")}</p>
            </>
          ) : null}
        </div>
      </fieldset>
      <fieldset className={styles.interestFieldset}>
        <legend>{copy.choose}</legend>
        <div className={styles.interestSwatches}>
          {COLOURS.map(item=><button type="button" key={item.id} aria-label={t(item.key as "fc1.colours.sample")} aria-pressed={colour===item.id} onClick={()=>chooseColour(item.id)}>
            <span className={styles.interestSwatch} style={{background:item.hex}} aria-hidden="true"/>
            <span className={styles.interestSwatchName}>{t(item.key as "fc1.colours.sample")}</span>
            <small>{item.available?copy.sample:copy.proposal}</small>
          </button>)}
        </div>
        <p className={styles.interestHint}>{copy.interest}</p>
        <button type="button" className={styles.interestReservationButton} onClick={()=>void saveColourPreference()} disabled={preferenceStatus==="saving"}>{preferenceStatus==="saving"?copy.preferenceSaving:copy.preferenceSave}</button>
        <p className={styles.interestHint} role="status">{preferenceStatus==="saved"?copy.preferenceSaved:preferenceStatus==="failed"?copy.preferenceFailed:copy.preferenceNote}</p>
      </fieldset>
      <div className={styles.interestSummary}>
        <small>{copy.summary}</small><strong>A1 Ultra {model==="standard"?"Standard":"Pro"} / {t(current.key as "fc1.colours.sample")}</strong>
        <div className={styles.cartPurchaseActions} data-product-purchase="fc1">
          <button type="button" className={styles.cartAddButton}
            onClick={()=>setCartStatus(addCartLine({product:"FC1",model,colour,quantity:1})?"added":"failed")}>
            {t("catalog.cart.add")}
          </button>
          <button type="button" className={styles.cartBuyButton} disabled
            title={t("catalog.cart.checkoutUnavailable")}>{t("catalog.cart.buyNow")}</button>
          <p role="status" className={styles.cartPurchaseNote}>
            {cartStatus==="added"?<>{t("catalog.cart.added")} <a href={"/"+locale+"/cart"}>{t("catalog.cart.view")}</a></>:
             cartStatus==="failed"?t("catalog.cart.storageError"):t("catalog.cart.previewNotice")}
          </p>
        </div>
        <Fc1TestRide locale={locale} model={modelLabel} colour={colourLabel} />
        <form className={styles.interestReservationActions} onSubmit={submitReservation}><label htmlFor="fc1-reservation-email">{t("fc1.reservation.cta")}</label><input id="fc1-reservation-email" type="email" required autoComplete="email" value={email} onChange={(event)=>setEmail(event.target.value)} placeholder="you@example.com" disabled={!reservationEmailConfigured} /><button className={styles.interestReservationButton} type={reservationEmailConfigured ? "submit" : "button"} disabled={!reservationEmailConfigured || reservationState === "sending"}>{reservationState === "sent" ? "✓" : reservationState === "sending" ? "…" : t("fc1.reservation.cta")}</button><p className={styles.interestReservationPending} role="status">{reservationState === "sent" ? t("fc1.reservation.sent") : reservationState === "failed" ? t("fc1.reservation.failed") : reservationEmailConfigured ? t("fc1.reservation.note") : t("fc1.reservation.pending")}</p></form>
        <p>{copy.fineprint}</p>
        <p className={styles.interestDelivery}>{copy.delivery}</p>
        <p>{copy.noPayment}</p>
      </div>
    </aside>
  </div>;
}
