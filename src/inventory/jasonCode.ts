// src/inventory/jasonCode.ts

// Ein Item im Jasoncode
export interface JasonCodeItemSpec {
  name: string;
  qty?: number;
  notes?: string;
}

// Der komplette Payload, den wir aus dem Jasoncode ziehen
export interface JasonCodePayloadV1 {
  label?: string;
  location?: string;
  category?: string;
  shelf?: number;
  positionHuman?: string;
  positionCode?: string;
  qrPayload?: string;
  items: JasonCodeItemSpec[];
}

/**
 * Parst einen Jasoncode der Form:
 *
 *   JXINV_v1={ "label": "...", "items": [ { "name": "...", "qty": 2 }, ... ] }
 *
 * und gibt ein JasonCodePayloadV1-Objekt zurück.
 */
export function parseJasonCode(input: string): JasonCodePayloadV1 {
  const raw = (input || "").trim();

  if (!raw.toLowerCase().startsWith("jxinv_v1")) {
    throw new Error(
      "Jasoncode muss mit 'JXINV_v1=' beginnen (z.B. JXINV_v1={...})."
    );
  }

  const eqIndex = raw.indexOf("=");
  if (eqIndex === -1) {
    throw new Error("Jasoncode-Format ungültig: '=' wurde nicht gefunden.");
  }

  const jsonPart = raw.slice(eqIndex + 1).trim();
  if (!jsonPart) {
    throw new Error("Jasoncode enthält keinen JSON-Teil nach '='.");
  }

  let obj: any;
  try {
    obj = JSON.parse(jsonPart);
  } catch (e: any) {
    throw new Error(
      "Jasoncode enthält kein gültiges JSON: " + (e?.message || String(e))
    );
  }

  if (!obj || typeof obj !== "object") {
    throw new Error("Jasoncode-Payload muss ein Objekt sein.");
  }

  if (!Array.isArray(obj.items) || obj.items.length === 0) {
    throw new Error(
      "Jasoncode benötigt ein Feld 'items' mit mindestens einem Eintrag."
    );
  }

  const items: JasonCodeItemSpec[] = obj.items.map(
    (it: any, idx: number): JasonCodeItemSpec => {
      if (!it || typeof it !== "object") {
        throw new Error(`Item #${idx + 1} im Jasoncode ist kein Objekt.`);
      }
      if (typeof it.name !== "string" || !it.name.trim()) {
        throw new Error(
          `Item #${idx + 1} im Jasoncode hat keinen gültigen Namen.`
        );
      }

      const item: JasonCodeItemSpec = {
        name: it.name.trim(),
      };

      if (typeof it.qty === "number" && it.qty > 0) {
        item.qty = it.qty;
      }

      if (typeof it.notes === "string" && it.notes.trim()) {
        item.notes = it.notes.trim();
      }

      return item;
    }
  );

  const payload: JasonCodePayloadV1 = {
    label: typeof obj.label === "string" ? obj.label : undefined,
    location: typeof obj.location === "string" ? obj.location : undefined,
    category: typeof obj.category === "string" ? obj.category : undefined,
    shelf: typeof obj.shelf === "number" ? obj.shelf : undefined,
    positionHuman:
      typeof obj.positionHuman === "string" ? obj.positionHuman : undefined,
    positionCode:
      typeof obj.positionCode === "string" ? obj.positionCode : undefined,
    qrPayload: typeof obj.qrPayload === "string" ? obj.qrPayload : undefined,
    items,
  };

  return payload;
}