// src/inventory/applyJasonCode.ts
import { supabase } from "../lib/supabaseClient";
import { JasonCodePayloadV1 } from "./jasonCode";

/**
 * Wendet einen Jasoncode-Payload auf eine bestehende Box an:
 * - Box-Metadaten aktualisieren (nur vorhandene Spalten)
 * - vorhandene Items (is_out = false) dieser Box löschen
 * - neue Items in der Tabelle "items" anlegen
 */
export async function applyJasonCodeToBox(
  boxId: string, // UUID der aktuell ausgewählten Box
  payload: JasonCodePayloadV1
): Promise<void> {
  // 0) Boxdaten laden (für box_no & ggf. location)
  const { data: boxData, error: boxFetchError } = await supabase
    .from("boxes")
    .select("id, box_no, location")
    .eq("id", boxId)
    .single();

  if (boxFetchError || !boxData) {
    console.error("Box-Fetch-Fehler:", boxFetchError);
    throw new Error("Box-Daten konnten nicht geladen werden.");
  }

  const boxNo = boxData.box_no as number | null;
  const boxLocation =
    (payload.location as string | undefined) ??
    (boxData.location as string | null) ??
    null;

  // 1) Box-Felder aktualisieren (nur Spalten, die es wirklich gibt)
  const boxUpdate: Record<string, any> = {};

  if (payload.label) boxUpdate.label = payload.label;
  if (payload.location) boxUpdate.location = payload.location;
  if (payload.category) boxUpdate.category = payload.category;

  if (Object.keys(boxUpdate).length > 0) {
    const { error: boxError } = await supabase
      .from("boxes")
      .update(boxUpdate)
      .eq("id", boxId);

    if (boxError) {
      console.error("Box-Update-Fehler:", boxError);
      throw new Error("Box konnte nicht aktualisiert werden.");
    }
  }

  // 2) Vorhandene Items dieser Box löschen (nur die, die im Lager sind)
  const { error: delError } = await supabase
    .from("items")
    .delete()
    .eq("box_id", boxId)
    .eq("is_out", false);

  if (delError) {
    console.error("Lösch-Fehler items:", delError);
    throw new Error("Vorhandene Items konnten nicht gelöscht werden.");
  }

  // 3) Neue Items aus dem Payload einfügen – OHNE "id", DB vergibt Auto-ID
  const rows = payload.items.map((item) => ({
    box_id: boxId,
    box_no: boxNo,
    name: item.name,
    location: boxLocation,
    category: payload.category ?? null,
    quantity: item.qty ?? 1,
    min_quantity: 0,
    exact_position: payload.positionHuman ?? null,
    is_out: false,
    photo_url: null as string | null,
  }));

  const { error: insError } = await supabase.from("items").insert(rows);

  if (insError) {
    console.error("Insert-Fehler items:", insError);
    throw new Error("Neue Items konnten nicht angelegt werden.");
  }
}