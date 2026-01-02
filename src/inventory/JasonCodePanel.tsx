// src/inventory/JasonCodePanel.jsx
import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

function extractJsonFromJasonCode(raw) {
  if (!raw) return null;
  const match = raw.match(/\{[\s\S]*\}$/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch (err) {
    console.error('JSON parse error in JasonCodePanel:', err);
    return null;
  }
}

/**
 * Erwartete Struktur z.B.:
 *
 * JXINV_v1={
 *   "label": "Geschenkpapier",
 *   "location": "Regal 2, oben, 1. Reihe von links",
 *   "items": [
 *     { "name": "Geschenkpapier", "qty": 1 }
 *   ],
 *   "photos": [
 *     { "label": "Box 99 – Übersicht", "photo_url": null }
 *   ]
 * }
 */
export default function JasonCodePanel({ boxId, boxLabel }) {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // Versuch, aus "Box 99 – xxx" die Nummer zu ziehen (für box_no)
  function getBoxNoFromLabel(label) {
    if (!label) return null;
    const m = String(label).match(/Box\s+(\d+)/i);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return Number.isNaN(n) ? null : n;
  }

  async function handleApply() {
    if (!boxId) {
      setStatus({ type: 'error', message: 'Keine Box ausgewählt.' });
      return;
    }
    if (!code.trim()) {
      setStatus({ type: 'error', message: 'Bitte Jasoncode einfügen.' });
      return;
    }

    setStatus(null);
    setIsSaving(true);

    const obj = extractJsonFromJasonCode(code);
    if (!obj) {
      setIsSaving(false);
      setStatus({
        type: 'error',
        message:
          'Jasoncode konnte nicht als gültiges JSON gelesen werden. Bitte auf "..." und ohne //-Kommentare achten.',
      });
      return;
    }

    try {
      const boxNo = getBoxNoFromLabel(boxLabel);
      const defaultLocation = obj.location || null;

      const itemsPayload = [];

      // 1) Normale Items
      if (Array.isArray(obj.items)) {
        for (const it of obj.items) {
          if (!it || !it.name) continue;
          itemsPayload.push({
            box_id: boxId,
            box_no: boxNo,
            name: it.name,
            location: it.location || defaultLocation,
            category: it.category || null,
            quantity:
              (typeof it.qty === 'number' && it.qty > 0
                ? it.qty
                : typeof it.quantity === 'number' && it.quantity > 0
                ? it.quantity
                : 1),
            min_quantity:
              typeof it.min_quantity === 'number' ? it.min_quantity : 0,
            exact_position:
              it.exact_position || it.exactPosition || obj.positionHuman || null,
            is_out: false,
            photo_url: it.photo_url || null,
          });
        }
      }

      // 2) Fotos als Items (Kategorie "Foto")
      if (Array.isArray(obj.photos)) {
        obj.photos.forEach((ph, index) => {
          if (!ph) return;
          const name =
            ph.name || ph.label || `Foto ${index + 1} (${boxLabel || ''})`;
          itemsPayload.push({
            box_id: boxId,
            box_no: boxNo,
            name,
            location: ph.location || defaultLocation,
            category: ph.category || 'Foto',
            quantity: 1,
            min_quantity: 0,
            exact_position:
              ph.exact_position || ph.exactPosition || obj.positionHuman || null,
            is_out: false,
            photo_url: ph.photo_url || null, // später können wir hier echte URLs füllen
          });
        });
      }

      if (itemsPayload.length === 0) {
        setIsSaving(false);
        setStatus({
          type: 'error',
          message:
            'Im Jasoncode wurden keine items[] oder photos[] gefunden, aus denen ich Einträge anlegen kann.',
        });
        return;
      }

      // In die DB schreiben
      const { error } = await supabase.from('items').insert(itemsPayload);

      if (error) {
        console.error(error);
        setIsSaving(false);
        setStatus({
          type: 'error',
          message: 'Items konnten nicht gespeichert werden (Supabase-Fehler).',
        });
        return;
      }

      setIsSaving(false);
      setStatus({
        type: 'success',
        message: `${itemsPayload.length} Einträge für ${boxLabel || 'die Box'} wurden gespeichert. Ansicht bitte kurz aktualisieren, um sie in der Liste zu sehen.`,
      });

      // Wenn du magst, Feld nach Erfolg leeren:
      // setCode('');
    } catch (err) {
      console.error(err);
      setIsSaving(false);
      setStatus({
        type: 'error',
        message: 'Unerwarteter Fehler beim Verarbeiten des Jasoncodes.',
      });
    }
  }

  return (
    <div
      style={{
        marginTop: 16,
        paddingTop: 10,
        borderTop: '1px solid rgba(148,163,184,0.4)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 4,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Jasoncode für diese Box
          </div>
          <div
            style={{
              fontSize: 11,
              opacity: 0.7,
            }}
          >
            Aktive Box: {boxLabel || '–'}
          </div>
        </div>
        <div
          style={{
            fontSize: 10,
            opacity: 0.7,
          }}
        >
          Unterstützt: <code>items[]</code> &amp; <code>photos[]</code>
        </div>
      </div>

      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={
          'Beispiel:\n' +
          'JXINV_v1={\n' +
          '  "label": "Geschenkpapier",\n' +
          '  "location": "Regal 2, oben, 1. Reihe von links",\n' +
          '  "items": [\n' +
          '    { "name": "Geschenkpapier", "qty": 1 }\n' +
          '  ],\n' +
          '  "photos": [\n' +
          '    { "label": "Box 99 – Übersicht" }\n' +
          '  ]\n' +
          '}'
        }
        style={{
          width: '100%',
          minHeight: 130,
          borderRadius: 10,
          border: '1px solid rgba(148,163,184,0.8)',
          background: 'rgba(15,23,42,0.9)',
          color: '#e5e7eb',
          fontSize: 12,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas',
          padding: '8px 10px',
          resize: 'vertical',
          boxSizing: 'border-box',
          outline: 'none',
        }}
      />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 6,
        }}
      >
        <div
          style={{
            fontSize: 10,
            opacity: 0.7,
          }}
        >
          Hinweis: Im JSON-Block keine <code>//</code>-Kommentare verwenden.
        </div>
        <button
          onClick={handleApply}
          disabled={isSaving}
          style={{
            border: 'none',
            borderRadius: 999,
            padding: '6px 14px',
            fontSize: 12,
            cursor: 'pointer',
            background: isSaving
              ? 'rgba(148,163,184,0.8)'
              : 'rgba(34,197,94,0.95)',
            color: isSaving ? '#0f172a' : '#022c22',
            fontWeight: 600,
          }}
        >
          {isSaving ? 'Speichere…' : 'Jasoncode anwenden'}
        </button>
      </div>

      {status && (
        <div
          style={{
            marginTop: 6,
            padding: '6px 8px',
            borderRadius: 8,
            fontSize: 11,
            background:
              status.type === 'success'
                ? 'rgba(22,163,74,0.15)'
                : 'rgba(248,113,113,0.12)',
            border:
              status.type === 'success'
                ? '1px solid rgba(22,163,74,0.7)'
                : '1px solid rgba(248,113,113,0.7)',
          }}
        >
          {status.message}
        </div>
      )}
    </div>
  );
}